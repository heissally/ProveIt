/**
 * Starting the verifier's sign-in on Google's or Discord's own page.
 *
 * PKCE: the browser keeps a random `verifier` and sends only its hash to the
 * provider. The one-time code is useless without the verifier, which goes only
 * to the Lit Action (via /api/check), never to anyone else.
 */
import { ethers } from "ethers";
import { challengeHashFor } from "../../../shared/verify.ts";
import { DISCORD_SCOPES } from "../../../shared/discord.ts";
import { base64url, toQuery, fromQuery, type Check } from "./challenge";
import { PROVEIT } from "./config";

export function makePkce(random: Uint8Array = crypto.getRandomValues(new Uint8Array(32))) {
  const verifier = base64url(random);
  const challenge = base64url(ethers.utils.arrayify(ethers.utils.sha256(ethers.utils.toUtf8Bytes(verifier))));
  return { verifier, challenge };
}

export const callbackPath = (method: Check["method"]) => `/callback/${method}`;

/** The provider's sign-in URL for this check. */
export function providerUrl(check: Check, opts: { origin: string; state: string; codeChallenge: string }): string {
  const redirectUri = opts.origin + callbackPath(check.method);
  if (check.method === "google") {
    const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    u.search = new URLSearchParams({
      client_id: PROVEIT.google.clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email",
      // Google copies the nonce into the ID token; the Lit Action checks it is
      // SHA-256(challengeId), which ties this sign-in to this one check.
      nonce: challengeHashFor(check.challengeId).slice(2),
      state: opts.state,
      code_challenge: opts.codeChallenge,
      code_challenge_method: "S256",
      prompt: "select_account",
    }).toString();
    return u.toString();
  }
  const u = new URL("https://discord.com/oauth2/authorize");
  u.search = new URLSearchParams({
    response_type: "code",
    client_id: PROVEIT.discord.clientId,
    scope: DISCORD_SCOPES.join(" "),
    redirect_uri: redirectUri,
    state: opts.state,
    code_challenge: opts.codeChallenge,
    code_challenge_method: "S256",
  }).toString();
  return u.toString();
}

/** What the browser remembers (in this tab only) while the verifier is at the provider. */
export interface Pending {
  challengeId: string;
  query: string;
  state: string;
  verifier: string;
  redirectUri: string;
}
const KEY = "proveit:pending";

export function savePending(storage: Storage, check: Check, p: Omit<Pending, "challengeId" | "query">) {
  storage.setItem(KEY, JSON.stringify({ challengeId: check.challengeId, query: toQuery(check), ...p }));
}

/** Read and forget the pending sign-in, checking `state` so a stray callback is ignored. */
export function takePending(storage: Storage, state: string | null): { check: Check; pending: Pending } | null {
  const raw = storage.getItem(KEY);
  storage.removeItem(KEY);
  if (!raw || !state) return null;
  try {
    const pending = JSON.parse(raw) as Pending;
    if (pending.state !== state) return null;
    const check = fromQuery(pending.challengeId, new URLSearchParams(pending.query));
    return check ? { check, pending } : null;
  } catch {
    return null;
  }
}
