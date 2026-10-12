/**
 * npm run lit:audit
 *
 * Read-only check of your Lit account against what ProveIt needs, before a review
 * or release. Free: list calls only, nothing is changed.
 *
 *   proveit-google / proveit-discord: exactly their own safe (PKP) and the deployed
 *     action CID. Anything else in these groups could open the client secret.
 *   proveit-tools: only the signer-lookup action, no safes.
 *   Usage keys: execute-only, no wildcards, no management rights.
 *   The deployed CIDs still match the code in this repo.
 */
import { loadLitConfig } from "./lib/config.ts";
import { compareGroup, isClean, normalizeGroupId, readGroup } from "./lib/group-check.ts";
import { auditKeys, type KeyInfo } from "./lib/key-audit.ts";
import { getActionCid, litRequest, readActionSource, requireEnv } from "./lib/lit-api.ts";

const accountKey = requireEnv("LIT_ACCOUNT_API_KEY");
const config = await loadLitConfig();
let failures = 0;
const ok = (msg: string) => console.log(`  ✓ ${msg}`);
const bad = (msg: string) => {
  failures++;
  console.log(`  ✗ ${msg}`);
};

console.log("\nProveIt · Lit account audit (read-only)\n");

// ---- The code in this repo is the deployed code -----------------------------------
console.log("Deployed actions");
for (const m of ["google", "discord"] as const) {
  const cid = await getActionCid(await readActionSource(`lit-actions/proveit-${m}.js`));
  if (cid === config[m].actionCid) ok(`proveit-${m}.js in this repo = deployed CID ${cid}`);
  else bad(`proveit-${m}.js gives ${cid}, but config/lit.json says ${config[m].actionCid}: deploy or revert`);
}

// ---- The two safes ------------------------------------------------------------------
for (const m of ["google", "discord"] as const) {
  console.log(`\nGroup proveit-${m}`);
  try {
    const group = await readGroup(accountKey, `proveit-${m}`);
    const p = compareGroup(group, {
      safe: config[m].pkp,
      allowed: [{ name: `proveit-${m} (deployed)`, cid: config[m].actionCid! }],
      required: [`proveit-${m} (deployed)`],
    });
    if (isClean(p)) ok(`holds only the ${m} safe and the deployed action`);
    for (const a of p.extraActions) bad(`extra action "${a}": untick it (it could open the ${m} client secret)`);
    for (const a of p.missingActions) bad(`missing ${a}: tick it, or sign-ins will fail`);
    for (const w of p.extraWallets) bad(`extra wallet ${w}: untick it`);
    if (p.safeMissing) bad(`the ${m} safe ${config[m].pkp} isn't ticked`);
  } catch (err) {
    bad((err as Error).message);
  }
}

// ---- The tools group ----------------------------------------------------------------
console.log("\nGroup proveit-tools");
try {
  const lookupCid = await getActionCid(await readActionSource("lit-actions/proveit-signer-lookup.js"));
  const group = await readGroup(accountKey, "proveit-tools");
  const p = compareGroup(group, { safe: "0x0", allowed: [{ name: "proveit-signer-lookup", cid: lookupCid }], required: ["proveit-signer-lookup"] });
  if (group.wallets.length === 0 && p.extraActions.length === 0 && p.missingActions.length === 0) ok("holds only proveit-signer-lookup, and no safes");
  for (const a of p.extraActions) bad(`extra action "${a}"`);
  for (const a of p.missingActions) bad(`missing ${a}`);
  for (const w of group.wallets) bad(`wallet ${w} should not be in the tools group`);
} catch (err) {
  bad((err as Error).message);
}

// ---- Usage keys ---------------------------------------------------------------------
console.log("\nUsage keys");
const page = { page_number: "0", page_size: "100" };
const [groupsRes, keysRes] = await Promise.all([
  litRequest("list_groups", { apiKey: accountKey, query: page }),
  litRequest("list_api_keys", { apiKey: accountKey, query: page }),
]);
if (!Array.isArray(groupsRes.data) || !Array.isArray(keysRes.data)) {
  bad(`could not list groups/keys (HTTP ${groupsRes.status}/${keysRes.status})`);
} else {
  const names = Object.fromEntries((groupsRes.data as Array<{ id: string; name: string }>).map((g) => [normalizeGroupId(g.id), g.name]));
  for (const r of auditKeys(keysRes.data as KeyInfo[], names)) {
    const where = r.executesIn.length ? r.executesIn.join(", ") : "no groups";
    if (r.problems.length === 0) ok(`${r.name}: execute-only, in ${where}`);
    else bad(`${r.name} (in ${where}): ${r.problems.join("; ")}`);
  }
  if (!(keysRes.data as KeyInfo[]).some((k) => k.name === "proveit-web-key")) {
    console.log("  ℹ no key named proveit-web-key found, so the website key's groups weren't checked");
  }
}

console.log(`\n${failures === 0 ? "✓ Audit passed." : `✗ ${failures} problem(s) found. Fix them in the Lit Dashboard, then run again.`}\n`);
process.exit(failures === 0 ? 0 : 1);
