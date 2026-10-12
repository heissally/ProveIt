/**
 * npm run lit:cids
 *
 * Prints the CID of each ProveIt action, computed from the code in this repo.
 * Free: it uses Lit's public CID calculator and needs no API key.
 *
 * LIT: a CID is a fingerprint of the exact file bytes. Change one character and
 * the CID (and the action's signing key) changes. Compare the production CIDs
 * printed here with config/lit.json and SECURITY.md to confirm that the code you
 * are reading is the code that is deployed.
 */
import {
  M1_ACTIONS,
  M2_ACTIONS,
  PRODUCTION_ACTIONS,
  VAULT_TWIN_NAME,
  getActionCid,
  readActionSource,
  vaultTwinSource,
} from "../lib/lit-api.ts";

async function printAction(name: string, path: string, code: string) {
  console.log(`  ${name}`);
  console.log(`    file: ${path}`);
  console.log(`    CID:  ${await getActionCid(code)}\n`);
}

console.log("\nProveIt · action CIDs (computed from this repo's code)");

console.log("\nProduction\n");
for (const a of PRODUCTION_ACTIONS) await printAction(a.name, a.path, await readActionSource(a.path));

console.log("Milestone 1 test actions\n");
for (const a of M1_ACTIONS) await printAction(a.name, a.path, await readActionSource(a.path));

console.log("Milestone 2 test actions\n");
for (const a of M2_ACTIONS) await printAction(a.name, a.path, await readActionSource(a.path));
const vaultCode = await readActionSource(M2_ACTIONS[1].path);
await printAction(VAULT_TWIN_NAME, `${M2_ACTIONS[1].path} + one comment line (made by the script)`, vaultTwinSource(vaultCode));

console.log("These match the Lit Dashboard's \"Get Lit Action IPFS CID\" for the same file.\n");
