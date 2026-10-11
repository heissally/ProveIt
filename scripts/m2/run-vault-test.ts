/**
 * npm run lit:vault
 *
 * Milestone 2: proves that a PKP "safe" can only be opened by the exact action
 * CIDs listed with it in a group. Uses freshly generated DUMMY secrets, never a
 * real one. Costs roughly 8–10 credits per run.
 *
 *   Lock     encrypt a dummy secret into the Google safe and the Discord safe
 *   Open     the permitted probe opens each safe and finds the right secret
 *   Twin     identical code with a different CID: opens Discord's safe (listed),
 *            is REFUSED by Google's safe (not listed). This is the key test.
 *   Wrong    Google's safe can't open a secret locked by Discord's safe
 *   Tamper   a ciphertext changed by one character is rejected
 *
 * Needs LIT_ACCOUNT_API_KEY and LIT_DEV_USAGE_KEY in .env.local, and both PKP
 * addresses in config/lit.json.
 */
import { randomBytes } from "node:crypto";
import { ethers } from "ethers";
import type { Check } from "../lib/identity-check.ts";
import { loadLitConfig, type LitConfig } from "../lib/config.ts";
import {
  M2_ACTIONS,
  VAULT_TWIN_NAME,
  getActionCid,
  litRequest,
  readActionSource,
  requireEnv,
  runLitAction,
  vaultTwinSource,
} from "../lib/lit-api.ts";
import { ciphertextFrom, expectOpened, expectRefused, tamper, vaultOutcome } from "../lib/vault-check.ts";

const accountKey = requireEnv("LIT_ACCOUNT_API_KEY");
const devKey = requireEnv("LIT_DEV_USAGE_KEY");
let config: LitConfig;
try {
  config = await loadLitConfig();
} catch (err) {
  console.error(`\n✗ ${(err as Error).message}\n`);
  process.exit(1);
}

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
const sha256 = (s: string) => ethers.utils.sha256(ethers.utils.toUtf8Bytes(s));

console.log("\nProveIt · Milestone 2 · safe (PKP vault) test");
console.log(`(${new Date().toISOString()})\n`);

// ---- The code involved, and its fingerprints --------------------------------------
const encryptCode = await readActionSource(M2_ACTIONS[0].path);
const vaultCode = await readActionSource(M2_ACTIONS[1].path);
const twinCode = vaultTwinSource(vaultCode);
const [encryptCid, vaultCid, twinCid] = await Promise.all([encryptCode, vaultCode, twinCode].map(getActionCid));
console.log("Actions used:");
console.log(`  ${M2_ACTIONS[0].name}  ${encryptCid}`);
console.log(`  ${M2_ACTIONS[1].name}  ${vaultCid}`);
console.log(`  ${VAULT_TWIN_NAME}  ${twinCid}`);
console.log("Safes (PKPs):");
console.log(`  google   ${config.google.pkp}`);
console.log(`  discord  ${config.discord.pkp}`);

const creditsBefore = await creditsNow();
let executions = 0;
async function run(code: string, params: Record<string, unknown>) {
  const r = await runLitAction(devKey, code, params);
  if (r.status === 200) executions++; // billed whenever the action actually ran
  return r;
}

// ---- Lock: encrypt one dummy secret per safe ---------------------------------------
// Random every run, so nothing here could ever be a real secret.
const dummy = {
  google: `dummy-google-${randomBytes(16).toString("hex")}`,
  discord: `dummy-discord-${randomBytes(16).toString("hex")}`,
};
console.log("\nLock · encrypt a dummy secret into each safe");
const locked: Record<"google" | "discord", string | null> = { google: null, discord: null };
for (const method of ["google", "discord"] as const) {
  const out = ciphertextFrom(await run(encryptCode, { pkpId: config[method].pkp, secret: dummy[method] }));
  if ("error" in out) {
    record({ name: `Locked a dummy secret in the ${method} safe`, ok: false, detail: out.error });
    continue;
  }
  locked[method] = out.ciphertext;
  record({
    name: `Locked a dummy secret in the ${method} safe`,
    ok: !out.ciphertext.includes(dummy[method]),
    detail: `ciphertext is ${out.ciphertext.length} characters, starts "${out.ciphertext.slice(0, 24)}…", and does not contain the secret`,
  });
}

if (!locked.google || !locked.discord) {
  console.log("\n  Can't continue without both ciphertexts. Common causes:");
  console.log("  · 403: the dev key can't run in that group, or the group doesn't list proveit-encrypt-secret");
  console.log("  · a Decrypt/Encrypt permission error: the safe (PKP) isn't ticked in that group");
  console.log("  · created things in the last few minutes: wait 2 minutes and run again\n");
  process.exit(1);
}
const ctGoogle = locked.google;
const ctDiscord = locked.discord;

// ---- Open: the permitted probe opens each safe --------------------------------------
console.log("\nOpen · the listed probe opens each safe");
record(
  expectOpened(
    "Google safe opens for proveit-m2-probe-vault",
    vaultOutcome(await run(vaultCode, { pkpId: config.google.pkp, ciphertext: ctGoogle })),
    sha256(dummy.google),
  ),
);
record(
  expectOpened(
    "Discord safe opens for proveit-m2-probe-vault",
    vaultOutcome(await run(vaultCode, { pkpId: config.discord.pkp, ciphertext: ctDiscord })),
    sha256(dummy.discord),
  ),
);

// ---- Twin: same logic, different fingerprint -----------------------------------------
console.log("\nTwin · identical code, different CID, listed for the Discord safe only");
record(
  expectOpened(
    "Twin opens the Discord safe (it is on Discord's list)",
    vaultOutcome(await run(twinCode, { pkpId: config.discord.pkp, ciphertext: ctDiscord })),
    sha256(dummy.discord),
  ),
);
record(
  expectRefused(
    "Twin is REFUSED by the Google safe (not on Google's list)",
    vaultOutcome(await run(twinCode, { pkpId: config.google.pkp, ciphertext: ctGoogle })),
  ),
);

// ---- Wrong safe and tampering ----------------------------------------------------------
console.log("\nWrong safe and tampering");
record(
  expectRefused(
    "Google safe can't open a secret locked by the Discord safe",
    vaultOutcome(await run(vaultCode, { pkpId: config.google.pkp, ciphertext: ctDiscord })),
  ),
);
record(
  expectRefused(
    "A ciphertext changed by one character is rejected",
    vaultOutcome(await run(vaultCode, { pkpId: config.google.pkp, ciphertext: tamper(ctGoogle) })),
  ),
);

// ---- Cost --------------------------------------------------------------------------------
console.log("\nCost");
await new Promise((r) => setTimeout(r, 3000)); // give billing a moment to settle
const creditsAfter = await creditsNow();
record({
  name: "Credits used by this run",
  ok: null,
  detail:
    creditsBefore !== null && creditsAfter !== null
      ? `${creditsBefore - creditsAfter} credits for ${executions} executions; balance now ≈ ${creditsAfter} credits`
      : "could not read the balance",
});

// ---- Summary -----------------------------------------------------------------------------
const failed = results.filter((c) => c.ok === false);
const passed = results.filter((c) => c.ok === true);
console.log("\nSummary");
console.log(`  ${passed.length} passed, ${failed.length} failed`);
if (failed.length === 0) {
  console.log("  ✓ All Milestone 2 checks passed. Only the listed CIDs can open each safe.");
} else {
  for (const c of failed) console.log(`  ✗ ${c.name}`);
}
console.log("\nCopy everything from 'ProveIt · Milestone 2' down to here and paste it in chat.\n");
process.exit(failed.length === 0 ? 0 : 1);
