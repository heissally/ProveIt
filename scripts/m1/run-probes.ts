/**
 * npm run lit:probe
 *
 * Milestone 1: answers the brief's open questions by running tiny test actions
 * on the real Lit network. Costs roughly 5–15 credits per run.
 *
 *   Test 1  runtime probe       Q1 (js_params), Q3 (outbound calls + timing), clock
 *   Test 2  identity probe      sign with the action's own key, verify by CID
 *   Test 3  unenrolled code     Q2: the usage key must be REFUSED for other code
 *   Test 4  unenrolled code     info: what the ACCOUNT key is allowed to run
 *   Cost                        Q5: credits used per execution
 *
 * Needs LIT_ACCOUNT_API_KEY and LIT_PROBE_USAGE_KEY in .env.local.
 */
import { ethers } from "ethers";
import { canonical } from "../../shared/canonical.ts";
import {
  checkIdentityProbe,
  type Check,
  type IdentityProbeOutput,
  type SignerLookupOutput,
} from "../lib/identity-check.ts";
import {
  M1_ACTIONS,
  describeFailure,
  getActionCid,
  litRequest,
  readActionSource,
  requireEnv,
  runLitAction,
} from "../lib/lit-api.ts";

const accountKey = requireEnv("LIT_ACCOUNT_API_KEY");
const usageKey = requireEnv("LIT_PROBE_USAGE_KEY");

const results: Check[] = [];
function record(check: Check) {
  results.push(check);
  const mark = check.ok === true ? "✓" : check.ok === false ? "✗" : "ℹ";
  console.log(`  ${mark} ${check.name}`);
  if (check.detail) console.log(`      ${check.detail}`);
}

async function creditsNow(): Promise<number | null> {
  const res = await litRequest("billing/balance", { apiKey: accountKey });
  const cents = (res.data as { balance_cents?: number })?.balance_cents;
  return res.ok && typeof cents === "number" ? -cents : null; // negative cents = credit
}

console.log("\nProveIt · Milestone 1 · probe results");
console.log(`(${new Date().toISOString()})\n`);

// ---- Load the three enrolled actions and their CIDs ---------------------------
const [runtime, identity, lookup] = await Promise.all(
  M1_ACTIONS.map(async (a) => {
    const code = await readActionSource(a.path);
    return { ...a, code, cid: await getActionCid(code) };
  }),
);
console.log("Actions used:");
for (const a of [runtime, identity, lookup]) console.log(`  ${a.name}  ${a.cid}`);

const creditsBefore = await creditsNow();
let executions = 0;

// ---- Test 1: runtime probe ------------------------------------------------------
console.log("\nTest 1 · runtime probe (usage key, enrolled action)");
const sentParams = {
  hashInput: "proveit-m1",
  domain: "coinbase.com",
  aString: "hello",
  aNumber: 42,
  aBool: true,
  aNull: null,
  anArray: [1, 2, 3],
  nested: { inner: "value", list: ["a", "b"] },
};
const t1Start = Date.now();
const r1 = await runLitAction(usageKey, runtime.code, sentParams);
executions += r1.ok ? 1 : 0;

if (!r1.ok) {
  record({
    name: "Usage key can run an action that is in its group",
    ok: false,
    detail:
      describeFailure(r1) +
      (r1.status === 403
        ? "  → If you created the key in the last few minutes, wait 1–2 minutes and run again" +
          " (Lit permissions take a moment). Otherwise check the group has this CID ticked."
        : ""),
  });
} else {
  record({ name: "Usage key can run an action that is in its group", ok: true, detail: `round trip ${r1.ms} ms` });

  type Fetch = { ms: number; status?: number; error?: string; finalUrl?: string; bodySnippet?: string; registrationDate?: string | null };
  const rep = r1.response as {
    enclaveNowMs: number;
    params: { typeofParams: string; types: Record<string, string>; nestedEcho: unknown };
    globals: Record<string, unknown>;
    sha256: string;
    fetches: Record<string, Fetch>;
    totalMs: number;
  };

  // Q1. Compare with canonical() so key ORDER doesn't matter: Lit delivers
  // js_params with keys re-sorted alphabetically, so only the contents count.
  const expectedTypes = {
    hashInput: "string", domain: "string", aString: "string", aNumber: "number",
    aBool: "boolean", aNull: "null", anArray: "array", nested: "object",
  };
  const typesOk =
    rep.params.typeofParams === "object" &&
    canonical(rep.params.types) === canonical(expectedTypes) &&
    canonical(rep.params.nestedEcho) === canonical(sentParams.nested);
  record({
    name: "Q1: js_params arrive as one object passed to main(), types intact",
    ok: typesOk,
    detail: `received types ${JSON.stringify(rep.params.types)}`,
  });

  // Runtime built-ins
  record({
    name: "ethers v5 is available inside the action",
    ok: String(rep.globals.ethersVersion).startsWith("ethers/5"),
    detail: `ethers.version = ${rep.globals.ethersVersion}`,
  });
  record({
    name: "Other built-ins",
    ok: null,
    detail: Object.entries(rep.globals)
      .filter(([k]) => k !== "ethersVersion" && k !== "litActions")
      .map(([k, v]) => `${k}=${v}`)
      .join("  "),
  });
  record({
    name: "Lit.Actions functions available",
    ok: null,
    detail: JSON.stringify(rep.globals.litActions),
  });
  const localSha = ethers.utils.sha256(ethers.utils.toUtf8Bytes(sentParams.hashInput));
  record({
    name: "SHA-256 inside Lit matches SHA-256 on this computer",
    ok: rep.sha256 === localSha,
    detail: rep.sha256,
  });

  // The enclave's clock decides "expired", so it must be accurate.
  const t1End = t1Start + r1.ms;
  const clockOk = rep.enclaveNowMs >= t1Start - 60_000 && rep.enclaveNowMs <= t1End + 60_000;
  const midpoint = t1Start + r1.ms / 2;
  record({
    name: "Enclave clock agrees with this computer (within 60 s)",
    ok: clockOk,
    detail: `difference ≈ ${Math.round((rep.enclaveNowMs - midpoint) / 1000)} s`,
  });

  // Q3: outbound calls. Dummy credentials, so a rejection is the expected answer.
  const fetchChecks: Array<[string, string, (f: Fetch) => boolean, string]> = [
    ["googleToken", "Q3: Google token endpoint reachable", (f) => f.status === 400 || f.status === 401, "expect 400/401"],
    ["discordToken", "Q3: Discord token endpoint reachable", (f) => f.status === 400 || f.status === 401, "expect 400/401"],
    ["discordMe", "Q3: Discord /users/@me reachable", (f) => f.status === 401, "expect 401"],
    [
      "rdap",
      "Q3: RDAP lookup works (domain age)",
      (f) => f.status === 200 && typeof f.registrationDate === "string" && f.registrationDate.length > 0,
      "expect 200 + a registration date",
    ],
  ];
  for (const [key, name, passes, expectation] of fetchChecks) {
    const f = rep.fetches[key];
    const detail = f.error
      ? `network error after ${f.ms} ms: ${f.error}`
      : `HTTP ${f.status} in ${f.ms} ms (${expectation})` +
        (f.registrationDate !== undefined ? `, registered ${f.registrationDate}` : "") +
        (f.finalUrl && key === "rdap" ? `, via ${f.finalUrl}` : "") +
        (passes(f) ? "" : `, body: ${JSON.stringify(f.bodySnippet)}`);
    record({ name, ok: !f.error && passes(f), detail });
  }
  record({
    name: "Q3: time for all four calls inside one execution",
    ok: null,
    detail: `${rep.totalMs} ms inside Lit; ${r1.ms} ms round trip from this computer`,
  });
}

// ---- Test 2: action-identity signing --------------------------------------------
console.log("\nTest 2 · sign with the action's own key, then look the signer up by CID");
const nowSec = Math.floor(Date.now() / 1000);
const sampleResult = {
  v: 1,
  method: "google",
  status: "verified",
  reason: "ok",
  claim: { domain: "example.com" },
  challengeHash: ethers.utils.sha256(ethers.utils.toUtf8Bytes("m1-sample-challenge")),
  issuedAt: nowSec,
  expiresAt: nowSec + 900,
};
const message = canonical(sampleResult);
const r2 = await runLitAction(usageKey, identity.code, { message, selfCid: identity.cid });
executions += r2.ok ? 1 : 0;
const r3 = await runLitAction(usageKey, lookup.code, { cid: identity.cid });
executions += r3.ok ? 1 : 0;

if (!r2.ok) {
  record({ name: "Identity probe ran", ok: false, detail: describeFailure(r2) });
} else if (!r3.ok) {
  record({ name: "Signer lookup helper ran", ok: false, detail: describeFailure(r3) });
} else {
  const probeOut = r2.response as IdentityProbeOutput;
  record({
    name: "The action signed exactly the canonical JSON we sent",
    ok: probeOut.message === message,
    detail: message.length > 90 ? message.slice(0, 90) + "…" : message,
  });
  for (const check of checkIdentityProbe(probeOut, r3.response as SignerLookupOutput, identity.cid)) {
    record(check);
  }
}

// ---- Test 3: the usage key must not run code outside its group ---------------------
// A fresh comment makes this code's CID new every run, so it can't be in any group.
const unenrolledCode =
  `// ProveIt M1: this exact code is in no group (${Date.now()})\n` +
  `async function main() { return { ranWithoutEnrollment: true }; }\n`;
console.log("\nTest 3 · usage key + code that is NOT in its group (must be refused)");
const r4 = await runLitAction(usageKey, unenrolledCode, null);
const ranUnenrolled = r4.ok && (r4.response as { ranWithoutEnrollment?: boolean })?.ranWithoutEnrollment === true;
executions += ranUnenrolled ? 1 : 0;
record({
  name: "Q2: usage key is refused for code that isn't in its group",
  ok: !ranUnenrolled,
  detail: ranUnenrolled
    ? "⚠ IT RAN. The usage key can run any code. Stop and tell Claude."
    : `refused with ${describeFailure(r4)}`,
});

// ---- Test 4: information only: what can the account key run? ----------------------
console.log("\nTest 4 · account key + the same unenrolled code (information only)");
const r5 = await runLitAction(accountKey, unenrolledCode, null);
const accountRan = r5.ok && (r5.response as { ranWithoutEnrollment?: boolean })?.ranWithoutEnrollment === true;
executions += accountRan ? 1 : 0;
record({
  name: "Account key and code in no group",
  ok: null,
  detail: accountRan ? "the account key CAN run code that is in no group" : `refused: ${describeFailure(r5)}`,
});

// ---- Q5: cost ------------------------------------------------------------------------
console.log("\nCost");
await new Promise((r) => setTimeout(r, 3000)); // give billing a moment to settle
const creditsAfter = await creditsNow();
if (creditsBefore !== null && creditsAfter !== null) {
  const spent = creditsBefore - creditsAfter;
  record({
    name: "Q5: credits used by this run",
    ok: null,
    detail:
      `${spent} credits for ${executions} executions` +
      (executions > 0 ? ` (≈ ${(spent / executions).toFixed(1)} per execution)` : "") +
      `; balance now ≈ ${creditsAfter} credits`,
  });
} else {
  record({ name: "Q5: credits used by this run", ok: null, detail: "could not read the balance" });
}

// ---- Summary -------------------------------------------------------------------------
const failed = results.filter((c) => c.ok === false);
const passed = results.filter((c) => c.ok === true);
console.log("\nSummary");
console.log(`  ${passed.length} passed, ${failed.length} failed, ${results.length - passed.length - failed.length} info`);
if (failed.length === 0) {
  console.log("  ✓ All Milestone 1 checks passed.");
} else {
  for (const c of failed) console.log(`  ✗ ${c.name}`);
}
console.log("\nCopy everything from 'ProveIt · Milestone 1 · probe results' down to here and paste it in chat.\n");
process.exit(failed.length === 0 ? 0 : 1);
