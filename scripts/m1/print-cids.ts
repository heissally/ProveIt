/**
 * npm run lit:cids
 *
 * Prints the CID of each ProveIt action, ready to paste into the Lit Dashboard.
 * Free: it uses Lit's public CID calculator and needs no API key.
 *
 * LIT: a CID is a fingerprint of the exact file bytes. Change one character and
 * the CID (and the action's signing key) changes, so re-run this after any edit.
 */
import {
  M1_ACTIONS,
  M2_ACTIONS,
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

console.log("\nProveIt · action CIDs");

console.log("\nMilestone 1 (done)\n");
for (const a of M1_ACTIONS) await printAction(a.name, a.path, await readActionSource(a.path));

console.log("Milestone 2\n");
for (const a of M2_ACTIONS) await printAction(a.name, a.path, await readActionSource(a.path));
const vaultCode = await readActionSource(M2_ACTIONS[1].path);
await printAction(VAULT_TWIN_NAME, `${M2_ACTIONS[1].path} + one comment line (made by the script)`, vaultTwinSource(vaultCode));

console.log("Register each CID in the Dashboard under Lit Actions → Add,");
console.log("using the name shown above as the action's Name.");
console.log("These match the Dashboard's \"Get Lit Action IPFS CID\" for the same file.\n");
