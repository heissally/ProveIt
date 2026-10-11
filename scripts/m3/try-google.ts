/**
 * npm run google:try -- --domain <company domain> [--expired] [--wrong-nonce] [--consent]
 *
 * Milestone 3 end-to-end test, before the website exists. It plays both roles:
 *   asker:    makes a challenge (challengeId, nonce, 15-minute expiry)
 *   verifier: opens Google's real sign-in page in your browser, catches the
 *             one-time code on http://localhost:3000/callback/google, and runs
 *             the real proveit-google action on Lit with it
 *   asker:    checks the signed result exactly as the result page will
 *             (shared/verify.ts), then shows that a tampered copy is rejected
 *
 *   --expired      skip sign-in and send an already-expired link
 *   --wrong-nonce  sign in for one check but send the code with another check's id
 *   --consent      always show Google's consent screen (so you can test Cancel)
 *
 * Costs about 1 credit per run. Needs LIT_DEV_USAGE_KEY in .env.local.
 */
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { challengeHashFor, verifyResult, type SignedResult } from "../../shared/verify.ts";
import { explainReason } from "../../shared/reasons.ts";
import { loadLitConfig } from "../lib/config.ts";
import { describeFailure, getActionCid, readActionSource, requireEnv, runLitAction } from "../lib/lit-api.ts";

const args = process.argv.slice(2);
const domainArg = args[args.indexOf("--domain") + 1];
const expired = args.includes("--expired");
const wrongNonce = args.includes("--wrong-nonce");
const consent = args.includes("--consent");
if (!args.includes("--domain") || !domainArg || domainArg.startsWith("--")) {
  console.error("\nUsage: npm run google:try -- --domain coinbase.com [--expired] [--wrong-nonce] [--consent]\n");
  process.exit(1);
}
const domain = domainArg.trim().toLowerCase();
const devKey = requireEnv("LIT_DEV_USAGE_KEY");
const google = (await loadLitConfig()).google;
const redirectUri = google.redirectUris?.[0];
if (!google.clientId || !google.actionCid || !google.signer || !redirectUri) {
  console.error("\n✗ Run npm run secret:encrypt -- google and npm run action:deploy -- google first.\n");
  process.exit(1);
}

// The code we run must be exactly the deployed one, or its signer won't match.
const code = await readActionSource("lit-actions/proveit-google.js");
if ((await getActionCid(code)) !== google.actionCid) {
  console.error("\n✗ proveit-google.js changed since the last deploy. Run npm run action:deploy -- google.\n");
  process.exit(1);
}

console.log(`\nProveIt · Milestone 3 · live Google check for "${domain}"\n`);

// ---- Asker: create the challenge ------------------------------------------------------
const b64url = (bytes: Buffer) => bytes.toString("base64url");
const challengeId = b64url(randomBytes(16)); // 128-bit, 22 characters
const nonce = challengeHashFor(challengeId).slice(2); // SHA-256(challengeId), hex
const now = Math.floor(Date.now() / 1000);
const expiresAt = expired ? now - 60 : now + 15 * 60;
console.log(`Asker made check ${challengeId}, expiring ${new Date(expiresAt * 1000).toLocaleTimeString()}`);

// ---- Verifier: sign in with Google ------------------------------------------------------
async function signInWithGoogle(): Promise<{ code: string; verifier: string }> {
  const verifier = b64url(randomBytes(32)); // PKCE: proves the same browser finishes the sign-in
  const state = b64url(randomBytes(16));
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: google.clientId!,
    redirect_uri: redirectUri!,
    response_type: "code",
    scope: "openid email",
    nonce, // Google copies this into the ID token; the action checks it
    state,
    code_challenge: b64url(createHash("sha256").update(verifier).digest()),
    code_challenge_method: "S256",
    // --consent makes Google show its consent screen (with Cancel) even if you approved before.
    prompt: consent ? "consent select_account" : "select_account",
  }).toString();

  const callbackPath = new URL(redirectUri!).pathname;
  const port = Number(new URL(redirectUri!).port || 80);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      server.close();
      reject(new Error("no sign-in within 5 minutes"));
    }, 5 * 60 * 1000);
    const server = createServer((req, res) => {
      const u = new URL(req.url ?? "/", redirectUri);
      if (u.pathname !== callbackPath) {
        res.writeHead(404).end();
        return;
      }
      const ok = u.searchParams.get("state") === state && u.searchParams.get("code");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<p style="font:16px system-ui">${ok ? "Signed in. Go back to the terminal." : "Sign-in did not complete."} You can close this tab.</p>`);
      clearTimeout(timer);
      server.close();
      if (u.searchParams.get("state") !== state) reject(new Error("state mismatch: ignoring this callback"));
      else if (!ok) reject(new Error(`Google returned: ${u.searchParams.get("error") ?? "no code"}`));
      else resolve({ code: u.searchParams.get("code")!, verifier });
    });
    server.on("error", (e) => reject(new Error(`could not listen on port ${port}: ${e.message}`)));
    server.listen(port, () => {
      console.log("Opening Google sign-in in your browser… (if it doesn't open, paste this link)");
      console.log(`  ${url}\n`);
      spawn("open", [url.toString()], { stdio: "ignore", detached: true }).unref();
    });
  });
}

let signIn = { code: "expired-check-no-sign-in-needed", verifier: b64url(randomBytes(32)) };
if (!expired) {
  try {
    signIn = await signInWithGoogle();
    console.log("✓ Got a one-time code from Google");
  } catch (err) {
    console.log(`✗ ${(err as Error).message}\n`);
    process.exit(1);
  }
}

// ---- Verifier's browser: run the Lit Action ------------------------------------------------
// With --wrong-nonce, send a different check's id than the one Google signed in for.
const sentChallengeId = wrongNonce ? b64url(randomBytes(16)) : challengeId;
const run = await runLitAction(devKey, code, {
  code: signIn.code,
  codeVerifier: signIn.verifier,
  redirectUri,
  challengeId: sentChallengeId,
  domain,
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
  signer: google.signer,
  challengeId: sentChallengeId,
  method: "google" as const,
  claim: { domain },
  expiresAt,
};
const v = verifyResult(out, expectedCheck);
console.log(`\nAsker's check: ${v.valid ? "✓ signature valid, from the published proveit-google action" : "✗ " + v.problems.join("; ")}`);
const r = out.result;
if (v.valid) {
  if (r.status === "verified") {
    console.log(`  → VERIFIED: this person controls a work account at ${(r.claim as { domain: string }).domain}`);
  } else {
    console.log(`  → COULD NOT VERIFY: ${explainReason(r.reason)}`);
    if (r.actualDomain) console.log(`    They signed in with an account at ${r.actualDomain}.`);
    if (r.providerError) {
      const hints: Record<string, string> = {
        invalid_client: "Google rejected the client ID or secret. Re-lock the secret (npm run secret:encrypt -- google).",
        invalid_grant: "the code was already used, expired, or the PKCE verifier/redirect address didn't match.",
        redirect_uri_mismatch: "the redirect address isn't listed on the Google client.",
        unauthorized_client: "this client isn't allowed to use this sign-in flow.",
      };
      const code = String(r.providerError).replace(/^google_\d+_/, "");
      console.log(`    Google's error code: ${r.providerError}${hints[code] ? ` → ${hints[code]}` : ""}`);
    }
  }
  if (r.domainAgeFlag) {
    const age = { ok: "older than 90 days", new: "⚠ registered less than 90 days ago", unknown: "unknown" };
    console.log(`    Domain age: ${age[r.domainAgeFlag as keyof typeof age] ?? r.domainAgeFlag}`);
  }
}

// Tampering: flip the outcome in a copy, as a dishonest results store might.
const tampered = structuredClone(out);
tampered.result.status = tampered.result.status === "verified" ? "not_verified" : "verified";
const tv = verifyResult(tampered, expectedCheck);
console.log(`\nTamper test: ${tv.valid ? "✗ a tampered copy was ACCEPTED. Tell Claude." : "✓ a tampered copy is rejected (" + tv.problems[0] + ")"}\n`);
process.exit(v.valid && !tv.valid ? 0 : 1);
