/**
 * Fake Google and RDAP answers for testing proveit-google.js.
 *
 * Shapes follow Google's OpenID Connect docs
 * (https://developers.google.com/identity/openid-connect/openid-connect) and
 * RDAP (RFC 9083). We build them instead of recording real ones because real
 * Google responses contain personal data (email, name, user ID).
 */
import { challengeHashFor } from "../../../shared/verify.ts";
import type { FakeFetch, FakeResponse } from "../harness.ts";

export const NOW = 1791110400; // a fixed "now" for every test
export const CLIENT_ID = "123456789012-proveittest.apps.googleusercontent.com";
export const CLIENT_SECRET = "GOCSPX-test-client-secret-never-leak";
export const REDIRECT_URI = "http://localhost:3000/callback/google";
export const TEST_CONFIG = {
  clientId: CLIENT_ID,
  pkpId: "0xe59e58610d4940b5d35b448b6e2a16b1d58965e3",
  encryptedClientSecret: "test-ciphertext-for-the-google-client-secret",
  redirectUris: [REDIRECT_URI],
};

// Values that must NEVER appear in the action's output or logs.
export const PERSONAL = {
  email: "jordan.a@coinbase.com",
  sub: "110169484474386276334",
  name: "Jordan A.",
};
export const AUTH_CODE = "4/0AeanS0test-one-time-authorization-code";
export const ACCESS_TOKEN = "ya29.test-access-token-never-leak";
export const CODE_VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
export const CHALLENGE_ID = "Xq3vT9bLm2Rk8WdZp4NcAa";
export const NONCE = challengeHashFor(CHALLENGE_ID).slice(2);

/** The js_params the verifier's browser would send. */
export function params(overrides: Record<string, unknown> = {}) {
  return {
    code: AUTH_CODE,
    codeVerifier: CODE_VERIFIER,
    redirectUri: REDIRECT_URI,
    challengeId: CHALLENGE_ID,
    domain: "coinbase.com",
    expiresAt: NOW + 14 * 60,
    ...overrides,
  };
}

/** ID token claims for a Workspace account at coinbase.com. Override to vary. */
export function claims(overrides: Record<string, unknown> = {}) {
  return {
    iss: "https://accounts.google.com",
    azp: CLIENT_ID,
    aud: CLIENT_ID,
    sub: PERSONAL.sub,
    hd: "coinbase.com",
    email: PERSONAL.email,
    email_verified: true,
    at_hash: "HK6E_P6Dh8Y93mRNtsDB1Q",
    nonce: NONCE,
    name: PERSONAL.name,
    iat: NOW - 5,
    exp: NOW + 3595,
    ...overrides,
  };
}

/** A personal Gmail account: no hd claim at all. */
export function gmailClaims(overrides: Record<string, unknown> = {}) {
  const c: Record<string, unknown> = claims({ email: "jordan.a@gmail.com", ...overrides });
  delete c.hd;
  return c;
}

const b64url = (s: string) => Buffer.from(s).toString("base64url");
export function idToken(payload: Record<string, unknown>): string {
  const header = { alg: "RS256", kid: "test-key-id", typ: "JWT" };
  return `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}.fake-google-signature`;
}

/** Google's token endpoint answer for a successful code exchange. */
export function tokenResponse(payload: Record<string, unknown>): FakeResponse {
  return {
    status: 200,
    body: {
      access_token: ACCESS_TOKEN,
      expires_in: 3599,
      scope: "openid https://www.googleapis.com/auth/userinfo.email",
      token_type: "Bearer",
      id_token: idToken(payload),
    },
  };
}

/** An RDAP domain record registered `daysAgo` days before NOW. */
export function rdapRecord(domain: string, daysAgo: number): FakeResponse {
  const registered = new Date((NOW - daysAgo * 86400) * 1000).toISOString();
  return {
    status: 200,
    body: {
      objectClassName: "domain",
      ldhName: domain.toUpperCase(),
      events: [
        { eventAction: "registration", eventDate: registered },
        { eventAction: "expiration", eventDate: "2030-01-01T00:00:00Z" },
      ],
    },
  };
}

/** Route fake requests: Google's token endpoint and rdap.org lookups. */
export function fakeNetwork(opts: {
  token?: FakeResponse | Error;
  rdap?: Record<string, FakeResponse | Error>;
}): FakeFetch {
  return (url) => {
    const answer = (a: FakeResponse | Error | undefined) => {
      if (a instanceof Error) throw a;
      if (!a) return { status: 404, body: { error: "not found" } };
      return a;
    };
    if (url === "https://oauth2.googleapis.com/token") return answer(opts.token);
    const rdap = url.match(/^https:\/\/rdap\.org\/domain\/(.+)$/);
    if (rdap) return answer(opts.rdap?.[rdap[1]]);
    throw new Error(`unexpected request to ${url}`);
  };
}
