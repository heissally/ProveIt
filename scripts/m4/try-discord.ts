/**
 * npm run discord:try -- --roles Mod [--server <guildId>] [--expired] [--consent] [--no-open]
 *
 * Milestone 4 end-to-end test, before the website exists. It plays both roles:
 *   asker:    picks a registered server and the roles that count, makes a challenge
 *   verifier: signs in on Discord's real page, the code is caught on
 *             http://localhost:3000/callback/discord, and the real proveit-discord
 *             action runs on Lit with it
 *   asker:    checks the signed result exactly as the result page will
 *             (shared/verify.ts), then shows that a tampered copy is rejected
 *
 *   --roles        Mod, Admin, or Admin,Mod (the roles that count)
 *   --expired      skip sign-in and send an already-expired link
 *   --consent      always show Discord's Authorize screen (so you can test Cancel)
 *   --no-open      print the link instead of opening it, so you can paste it into a
 *                  private window signed in as a different Discord account
 *
 * Costs about 1 credit per run. Needs LIT_DEV_USAGE_KEY in .env.local.
 */
import { randomBytes } from "node:crypto";
import { challengeHashFor, verifyResult, type SignedResult } from "../../shared/verify.ts";
import { explainReason } from "../../shared/reasons.ts";
import { DISCORD_SCOPES, ROLE_ORDER } from "../../shared/discord.ts";
import { loadLitConfig } from "../lib/config.ts";
import { describeFailure, getActionCid, readActionSource, requireEnv, runLitAction } from "../lib/lit-api.ts";
import { b64url, catchOAuthCode, makePkce } from "../lib/oauth-local.ts";
import { loadRegistry } from "../lib/registry.ts";

const LABELS: string[] = ROLE_ORDER; // same order as the action
const args = process.argv.slice(2);
const argValue = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : undefined;
};
const rolesArg = argValue("--roles");
if (!rolesArg) {
  console.error("\nUsage: npm run discord:try -- --roles Mod [--server <guildId>] [--expired] [--consent] [--no-open]\n");
  process.exit(1);
}
const asked = rolesArg.split(",").map((r) => r.trim()).filter(Boolean);
const unknown = asked.filter((r) => !LABELS.includes(r));
if (unknown.length) {
  console.error(`\n✗ Unknown role label(s): ${unknown.join(", ")}. Use any of: ${LABELS.join(", ")}\n`);
  process.exit(1);
}
const roles = LABELS.filter((l) => asked.includes(l)); // same fixed order the action uses
const expired = args.includes("--expired");

const devKey = requireEnv("LIT_DEV_USAGE_KEY");
const discord = (await loadLitConfig()).discord;
const redirectUri = discord.redirectUris?.[0];
if (!discord.clientId || !discord.actionCid || !discord.signer || !redirectUri) {
  console.error("\n✗ Run npm run secret:encrypt -- discord and npm run action:deploy -- discord first.\n");
  process.exit(1);
}
const registry = await loadRegistry();
const server = argValue("--server") ? registry.find((s) => s.guildId === argValue("--server")) : registry[0];
if (!server) {
  console.error(`\n✗ Server ${argValue("--server")} is not in registry/servers.json.\n`);
  process.exit(1);
}

const code = await readActionSource("lit-actions/proveit-discord.js");
if ((await getActionCid(code)) !== discord.actionCid) {
  console.error("\n✗ proveit-discord.js or the registry changed since the last deploy. Run npm run action:deploy -- discord.\n");
  process.exit(1);
}

const claimText = `is ${roles.join(" or ")} in`;
console.log(`\nProveIt · Milestone 4 · live Discord check: someone ${claimText} "${server.name.trim()}"\n`);

// ---- Asker: create the challenge ------------------------------------------------------
const challengeId = b64url(randomBytes(16));
const now = Math.floor(Date.now() / 1000);
const expiresAt = expired ? now - 60 : now + 15 * 60;
console.log(`Asker made check ${challengeId}, expiring ${new Date(expiresAt * 1000).toLocaleTimeString()}`);

// ---- Verifier: sign in with Discord -----------------------------------------------------
const pkce = makePkce();
let oauthCode = "expired-check-no-sign-in-needed";
if (!expired) {
  const state = b64url(randomBytes(16));
  const authUrl = new URL("https://discord.com/oauth2/authorize");
  authUrl.search = new URLSearchParams({
    response_type: "code",
    client_id: discord.clientId,
    scope: DISCORD_SCOPES.join(" "),
    redirect_uri: redirectUri,
    state,
    code_challenge: pkce.challenge,
    code_challenge_method: "S256",
    ...(args.includes("--consent") ? { prompt: "consent" } : {}),
  }).toString();
  try {
    oauthCode = await catchOAuthCode({ authUrl, redirectUri, state, openBrowser: !args.includes("--no-open") });
    console.log("✓ Got a one-time code from Discord");
  } catch (err) {
    console.log(`✗ ${(err as Error).message}\n`);
    process.exit(1);
  }
}

// ---- Verifier's browser: run the Lit Action ------------------------------------------------
const run = await runLitAction(devKey, code, {
  code: oauthCode,
  codeVerifier: pkce.verifier,
  redirectUri,
  challengeId,
  guildId: server.guildId,
  roles,
  expiresAt,
});
const out = run.response as ({ ok: true; signer: string } & SignedResult) | { ok: false; error: string } | null;
if (!run.ok || !out || !out.ok) {
  console.log(`✗ The action did not return a signed result: ${out && !out.ok ? out.error : describeFailure(run)}\n`);
  process.exit(1);
}
console.log(`✓ Lit Action ran in ${run.ms} ms and signed a result\n`);
console.log("Signed result (this is everything the asker will ever see):");
console.log(JSON.stringify(out.result, null, 2).replace(/^/gm, "  "));

// ---- Asker: verify, exactly like the result page will -------------------------------------
const expectedCheck = {
  signer: discord.signer,
  challengeId,
  method: "discord" as const,
  claim: { guildId: server.guildId, guildName: server.name.trim(), roles },
  expiresAt,
};
const v = verifyResult(out, expectedCheck);
console.log(`\nAsker's check: ${v.valid ? "✓ signature valid, from the published proveit-discord action" : "✗ " + v.problems.join("; ")}`);
const r = out.result;
const who = (r.subject as { discordUsername?: string } | undefined)?.discordUsername;
if (v.valid) {
  if (r.status === "verified") {
    const where = `the official server "${server.name.trim()}"`;
    const what = `has the ${r.provenRole} role in ${where}`;
    console.log(`  → VERIFIED: Discord user ${who} ${what}`);
    console.log(`    Make sure ${who} is the exact account messaging you. Copycats use lookalike names.`);
  } else {
    console.log(`  → COULD NOT VERIFY: ${explainReason(r.reason, "discord")}${who ? ` (signed in as ${who})` : ""}`);
    if (r.providerError) console.log(`    Discord's error code: ${r.providerError}`);
  }
}
if (r.challengeHash !== challengeHashFor(challengeId)) console.log("  ✗ challenge hash mismatch");

const tampered = structuredClone(out);
tampered.result.status = tampered.result.status === "verified" ? "not_verified" : "verified";
const tv = verifyResult(tampered, expectedCheck);
console.log(`\nTamper test: ${tv.valid ? "✗ a tampered copy was ACCEPTED. Tell Claude." : "✓ a tampered copy is rejected (" + tv.problems[0] + ")"}\n`);
process.exit(v.valid && !tv.valid ? 0 : 1);
