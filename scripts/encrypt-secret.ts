/**
 * npm run secret:encrypt -- google        (Milestone 4 adds: -- discord)
 *
 * One-time setup: lock an OAuth client secret into its PKP safe.
 *   1. checks the group holds ONLY the safe and the encrypt helper (plus the
 *      current ProveIt action, when rotating), so nothing else could open it
 *   2. asks for the client ID (public) and the client secret (hidden input)
 *   3. runs proveit-encrypt-secret.js on Lit and saves only the ciphertext,
 *      plus the client ID, in config/lit.json
 * The secret is never printed, logged or written to disk.
 */
import { loadLitConfig, updateMethodConfig } from "./lib/config.ts";
import { compareGroup, isClean, readGroup } from "./lib/group-check.ts";
import { getActionCid, readActionSource, requireEnv, runLitAction } from "./lib/lit-api.ts";
import { ask, askHidden } from "./lib/prompt.ts";
import { checkSecret, cleanPasted } from "./lib/secret-format.ts";
import { ciphertextFrom } from "./lib/vault-check.ts";

const CLIENT_ID_FORMAT = {
  google: /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/,
  discord: /^\d{17,20}$/,
};

const method = process.argv[2];
if (method !== "google" && method !== "discord") {
  console.error("\nUsage: npm run secret:encrypt -- google\n");
  process.exit(1);
}
const accountKey = requireEnv("LIT_ACCOUNT_API_KEY");
const devKey = requireEnv("LIT_DEV_USAGE_KEY");
const config = (await loadLitConfig())[method];
const groupName = `proveit-${method}`;

console.log(`\nProveIt · lock the ${method} client secret into its safe\n`);

// ---- 1. Is the group clean? ----------------------------------------------------------
const encryptCid = await getActionCid(await readActionSource("lit-actions/proveit-encrypt-secret.js"));
const allowed = [{ name: "proveit-encrypt-secret", cid: encryptCid }];
if (config.actionCid) allowed.push({ name: `proveit-${method} (current)`, cid: config.actionCid });

const problems = compareGroup(await readGroup(accountKey, groupName), {
  safe: config.pkp,
  allowed,
  required: ["proveit-encrypt-secret"],
});
if (!isClean(problems)) {
  console.log(`✗ The "${groupName}" group isn't ready. Fix this in the Dashboard (Groups → Edit), then run again:`);
  for (const a of problems.extraActions) console.log(`  · untick action "${a}". It could open the safe.`);
  for (const a of problems.missingActions) console.log(`  · tick action "${a}"`);
  for (const w of problems.extraWallets) console.log(`  · untick wallet ${w}`);
  if (problems.safeMissing) console.log(`  · tick the ${method} safe ${config.pkp}`);
  console.log("");
  process.exit(1);
}
console.log(`✓ "${groupName}" holds only the ${method} safe and the allowed actions`);

// ---- 2. Client ID and secret -----------------------------------------------------------
let clientId = config.clientId ?? "";
const typed = await ask(`Client ID${clientId ? ` [press Enter to keep ${clientId}]` : ""}: `);
if (typed) clientId = typed;
if (!CLIENT_ID_FORMAT[method].test(clientId)) {
  console.log(`✗ "${clientId}" doesn't look like a ${method} client ID. Nothing was changed.\n`);
  process.exit(1);
}
console.log("Paste the client secret ONCE, then press Enter. Nothing will appear while you paste.");
const secret = cleanPasted(await askHidden("Client secret (hidden): "));
const check = checkSecret(method, secret);
if (!check.ok) {
  console.log(`✗ That doesn't look like a ${method} client secret: ${check.summary}.`);
  console.log("  Nothing was changed. Run the command again and paste the secret exactly once.\n");
  process.exit(1);
}
console.log(`✓ Received ${check.summary}`);
if ((await ask("Lock it into the safe now? (y/n): ")).toLowerCase() !== "y") {
  console.log("Stopped. Nothing was changed.\n");
  process.exit(0);
}

// ---- 3. Lock it ---------------------------------------------------------------------------
const out = ciphertextFrom(
  await runLitAction(devKey, await readActionSource("lit-actions/proveit-encrypt-secret.js"), {
    pkpId: config.pkp,
    secret,
  }),
);
if ("error" in out) {
  console.log(`✗ Lit could not lock the secret: ${out.error}\n`);
  process.exit(1);
}
await updateMethodConfig(method, { clientId, encryptedClientSecret: out.ciphertext });
console.log(`✓ Secret locked. Saved the client ID and ciphertext (${out.ciphertext.length} characters) to config/lit.json`);
console.log("  The plain secret was not saved anywhere.\n");
console.log(`Next: npm run action:deploy -- ${method}\n`);
