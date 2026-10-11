/**
 * npm run action:deploy -- google
 *
 * Prepares a ProveIt Lit Action for use:
 *   1. writes the public settings from config/lit.json into the action's CONFIG block
 *   2. computes the action's CID (its fingerprint; there is no IPFS upload on Chipotle)
 *   3. asks Lit for the action's signer address via proveit-signer-lookup.js
 *   4. saves the CID and signer to config/lit.json
 *   5. prints what you still need to click in the Lit Dashboard
 *
 * LIT: any change to the action's code, including its CONFIG, gives a new CID and
 * a new signer address. Run this after every change, then redo the Dashboard steps.
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { stampConfig } from "./lib/action-config.ts";
import { loadLitConfig, updateMethodConfig } from "./lib/config.ts";
import { REPO_ROOT, getActionCid, readActionSource, requireEnv, runLitAction, describeFailure } from "./lib/lit-api.ts";

const method = process.argv[2];
if (method !== "google") {
  console.error("\nUsage: npm run action:deploy -- google   (Discord comes in Milestone 4)\n");
  process.exit(1);
}
const devKey = requireEnv("LIT_DEV_USAGE_KEY");
const config = (await loadLitConfig())[method];
const actionPath = `lit-actions/proveit-${method}.js`;

console.log(`\nProveIt · deploy proveit-${method}.js\n`);

const missing: string[] = [];
if (!config.clientId) missing.push("clientId");
if (!config.encryptedClientSecret) missing.push("encryptedClientSecret");
if (!config.redirectUris?.length) missing.push("redirectUris");
if (missing.length) {
  console.log(`✗ config/lit.json is missing ${method}.${missing.join(", ")}.`);
  console.log(`  Run npm run secret:encrypt -- ${method} first.\n`);
  process.exit(1);
}

// ---- 1. Write the settings into the action ------------------------------------------
const filePath = join(REPO_ROOT, actionPath);
const before = await readFile(filePath, "utf8");
const after = stampConfig(before, {
  clientId: config.clientId!,
  pkpId: config.pkp,
  encryptedClientSecret: config.encryptedClientSecret!,
  redirectUris: config.redirectUris!,
});
if (after !== before) await writeFile(filePath, after);
console.log(after !== before ? `✓ Wrote the settings into ${actionPath}` : `✓ ${actionPath} already has these settings`);

// ---- 2 + 3. Fingerprint and signer ------------------------------------------------------
const cid = await getActionCid(await readActionSource(actionPath));
console.log(`✓ CID:    ${cid}`);

const lookupCode = await readActionSource("lit-actions/proveit-signer-lookup.js");
const lookup = await runLitAction(devKey, lookupCode, { cid });
const signer = (lookup.response as { walletAddress?: string } | null)?.walletAddress;
if (!lookup.ok || !signer) {
  console.log(`✗ Could not look up the signer address: ${describeFailure(lookup)}`);
  console.log("  Check that the proveit-tools group lists proveit-signer-lookup and the dev key may run in it.\n");
  process.exit(1);
}
console.log(`✓ Signer: ${signer}`);

// ---- 4. Save ---------------------------------------------------------------------------
const changed = config.actionCid !== cid;
await updateMethodConfig(method, {
  actionCid: cid,
  signer,
  ...(changed && config.actionCid ? { previousActionCid: config.actionCid } : {}),
});
console.log("✓ Saved CID and signer to config/lit.json");

// ---- 5. Dashboard to-do ------------------------------------------------------------------
const retire = changed ? config.actionCid : config.previousActionCid;
console.log("\nYour turn in the Lit Dashboard:");
console.log(`  1. Lit Actions → Add → IPFS CID ${cid}`);
console.log(`     Name: proveit-${method} ${cid.slice(0, 8)}`);
console.log(`  2. Groups → proveit-${method} → Edit → CID hashes permitted:`);
console.log(`     · tick   proveit-${method} ${cid.slice(0, 8)}`);
if (retire) console.log(`     · untick proveit-${method} ${retire.slice(0, 8)} (the old version)`);
console.log("     · untick proveit-encrypt-secret (tick it again only when changing the secret)");
console.log("     · leave only the " + method + " safe ticked under PKP IDs permitted. Save.");
console.log(`  3. Wait about a minute, then test it: npm run ${method}:try -- --domain <company domain>\n`);
