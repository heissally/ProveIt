import { ethers } from "ethers";
import { beforeAll, describe, expect, it } from "vitest";
import { canonical } from "../../shared/canonical.ts";
import { verifyResult } from "../../shared/verify.ts";
import { stampConfig } from "../../scripts/lib/action-config.ts";
import { readActionSource } from "../../scripts/lib/lit-api.ts";
import { TEST_ACTION_KEY, actionCanonical, runAction, type RunOptions } from "./harness.ts";
import {
  ACCESS_TOKEN, AUTH_CODE, CHALLENGE_ID, CLIENT_SECRET, CODE_VERIFIER, NOW, PERSONAL, TEST_CONFIG,
  claims, fakeNetwork, gmailClaims, idToken, params, rdapRecord, tokenResponse,
} from "./fixtures/google.ts";

let source: string;
beforeAll(async () => {
  // Test the real file, with test values written into its CONFIG block.
  source = stampConfig(await readActionSource("lit-actions/proveit-google.js"), TEST_CONFIG);
});

const unlock = (args: { pkpId: string; ciphertext: string }) => {
  if (args.pkpId !== TEST_CONFIG.pkpId || args.ciphertext !== TEST_CONFIG.encryptedClientSecret) {
    throw new Error("wrong safe or ciphertext");
  }
  return CLIENT_SECRET;
};

/** Run the action with a fake Google answer (and coinbase.com registered in 2012). */
function run(p: Record<string, unknown>, network: Parameters<typeof fakeNetwork>[0], extra: Partial<RunOptions> = {}) {
  const rdap = { "coinbase.com": rdapRecord("coinbase.com", 5000), ...network.rdap };
  return runAction(source, p, { nowSec: NOW, decrypt: unlock, fetch: fakeNetwork({ ...network, rdap }), ...extra });
}
const google = (c: Record<string, unknown>) => ({ token: tokenResponse(c) });

/** The asker's side: is this a genuine result for exactly what was asked? */
function askerVerifies(output: any, domain = "coinbase.com", expiresAt = NOW + 14 * 60) {
  return verifyResult(output, {
    signer: TEST_ACTION_KEY.address, challengeId: CHALLENGE_ID, method: "google", claim: { domain }, expiresAt,
  });
}

describe("proveit-google.js · success", () => {
  it("right domain → verified, signed, and the asker's check passes", async () => {
    const { output } = await run(params(), google(claims()));
    expect(output.ok).toBe(true);
    expect(output.result).toMatchObject({ status: "verified", reason: "ok", method: "google", claim: { domain: "coinbase.com" } });
    expect(output.result.domainAgeFlag).toBe("ok");
    expect(output.signer).toBe(TEST_ACTION_KEY.address);
    expect(askerVerifies(output)).toEqual({ valid: true, problems: [] });
  });

  it("matching is case-insensitive (asker typed Coinbase.COM)", async () => {
    const { output } = await run(params({ domain: "Coinbase.COM" }), google(claims({ hd: "coinbase.com" })));
    expect(output.result.status).toBe("verified");
    expect(output.result.claim.domain).toBe("coinbase.com");
  });

  it("verified but the domain is under 90 days old → verified with domainAgeFlag 'new'", async () => {
    const { output } = await run(params(), { ...google(claims()), rdap: { "coinbase.com": rdapRecord("coinbase.com", 20) } });
    expect(output.result.status).toBe("verified");
    expect(output.result.domainAgeFlag).toBe("new");
  });

  it("domain-age lookup fails → still verified, with domainAgeFlag 'unknown'", async () => {
    const { output } = await run(params(), { ...google(claims()), rdap: { "coinbase.com": new Error("timeout") } });
    expect(output.result.status).toBe("verified");
    expect(output.result.domainAgeFlag).toBe("unknown");
  });

  it("sends Google exactly what the token exchange needs", async () => {
    const { fetches, decrypts } = await run(params(), google(claims()));
    expect(decrypts).toEqual([{ pkpId: TEST_CONFIG.pkpId, ciphertext: TEST_CONFIG.encryptedClientSecret }]);
    const tokenCall = fetches.find((f) => f.url === "https://oauth2.googleapis.com/token")!;
    expect(tokenCall.init.method).toBe("POST");
    expect(Object.fromEntries(new URLSearchParams(tokenCall.init.body))).toEqual({
      grant_type: "authorization_code", code: AUTH_CODE, code_verifier: CODE_VERIFIER,
      redirect_uri: TEST_CONFIG.redirectUris[0], client_id: TEST_CONFIG.clientId, client_secret: CLIENT_SECRET,
    });
  });
});

describe("proveit-google.js · could not verify (signed)", () => {
  const cases: Array<[string, Record<string, unknown>, string]> = [
    ["wrong domain (works at another company)", claims({ hd: "kraken.com" }), "wrong_domain"],
    ["lookalike domain (coinbase-careers.com)", claims({ hd: "coinbase-careers.com" }), "wrong_domain"],
    ["subdomain trick (coinbase.com.evil.io)", claims({ hd: "coinbase.com.evil.io" }), "wrong_domain"],
    ["personal Gmail (no hd)", gmailClaims(), "no_hd"],
    ["personal account with a @coinbase.com email but no hd", gmailClaims({ email: "x@coinbase.com" }), "no_hd"],
    ["empty hd", claims({ hd: "" }), "no_hd"],
    ["wrong nonce (sign-in from another check)", claims({ nonce: "0".repeat(64) }), "bad_nonce"],
    ["missing nonce", claims({ nonce: undefined }), "bad_nonce"],
    ["token for a different app (wrong aud)", claims({ aud: "someone-else.apps.googleusercontent.com" }), "bad_token"],
    ["token from a different issuer", claims({ iss: "https://evil.example" }), "bad_token"],
    ["expired token", claims({ exp: NOW - 1 }), "bad_token"],
    ["unverified email", claims({ email_verified: false }), "unverified_email"],
  ];
  for (const [label, c, reason] of cases) {
    it(`${label} → not_verified / ${reason}`, async () => {
      const { output } = await run(params(), google(c));
      expect(output.result).toMatchObject({ status: "not_verified", reason });
      expect(askerVerifies(output).valid).toBe(true); // a genuine, signed "could not verify"
    });
  }

  it("wrong domain shows which domain they really used, and its age", async () => {
    const network = { ...google(claims({ hd: "coinbase-careers.com" })), rdap: { "coinbase-careers.com": rdapRecord("coinbase-careers.com", 12) } };
    const { output } = await run(params(), network);
    expect(output.result).toMatchObject({ actualDomain: "coinbase-careers.com", domainAgeFlag: "new" });
  });

  it("expired link → not_verified / expired, without ever contacting Google or opening the safe", async () => {
    const { output, fetches, decrypts } = await run(params({ expiresAt: NOW - 1 }), google(claims()));
    expect(output.result).toMatchObject({ status: "not_verified", reason: "expired" });
    expect(askerVerifies(output, "coinbase.com", NOW - 1)).toEqual({ valid: true, problems: [] });
    expect(fetches).toEqual([]);
    expect(decrypts).toEqual([]);
  });

  it("Google rejects the code (used twice, or too old) → provider_error with Google's error code", async () => {
    const { output } = await run(params(), { token: { status: 400, body: { error: "invalid_grant", error_description: "Bad Request" } } });
    expect(output.result).toMatchObject({ status: "not_verified", reason: "provider_error", providerError: "google_400_invalid_grant" });
  });

  it("wrong client secret → provider_error / google_401_invalid_client", async () => {
    const { output } = await run(params(), { token: { status: 401, body: { error: "invalid_client", error_description: "Unauthorized" } } });
    expect(output.result.providerError).toBe("google_401_invalid_client");
    expect(JSON.stringify(output)).not.toContain("Unauthorized"); // never Google's free text
  });

  it("an odd error code from Google is replaced by 'unknown'", async () => {
    const { output } = await run(params(), { token: { status: 400, body: { error: "Weird <b>text</b> with spaces" } } });
    expect(output.result.providerError).toBe("google_400_unknown");
  });

  it("Google answers with something that isn't JSON → provider_error", async () => {
    const { output } = await run(params(), { token: { status: 502, body: "<html>Bad Gateway</html>" } });
    expect(output.result.providerError).toBe("google_502_unknown");
  });

  it("Google unreachable → provider_error / google_unreachable", async () => {
    const { output } = await run(params(), { token: new Error("network down") });
    expect(output.result).toMatchObject({ reason: "provider_error", providerError: "google_unreachable" });
  });

  it("no ID token in Google's answer → provider_error / no_id_token", async () => {
    const { output } = await run(params(), { token: { status: 200, body: { access_token: ACCESS_TOKEN } } });
    expect(output.result.providerError).toBe("no_id_token");
  });

  it("garbage ID token → provider_error / bad_id_token", async () => {
    const { output } = await run(params(), { token: { status: 200, body: { id_token: "not.a-jwt" } } });
    expect(output.result).toMatchObject({ reason: "provider_error", providerError: "bad_id_token" });
  });
});

describe("proveit-google.js · bad input (unsigned, exits early)", () => {
  const bad: Array<[string, Record<string, unknown>]> = [
    ["domain is not a domain", { domain: "not a domain" }],
    ["domain has a path", { domain: "coinbase.com/careers" }],
    ["domain without a dot", { domain: "localhost" }],
    ["challengeId too short", { challengeId: "abc" }],
    ["missing code", { code: undefined }],
    ["bad PKCE verifier", { codeVerifier: "short" }],
    ["redirect address not on the allowed list", { redirectUri: "https://evil.example/callback" }],
    ["expiry is not a whole number", { expiresAt: "soon" }],
    ["link lasts longer than 15 minutes", { expiresAt: NOW + 60 * 60 }],
  ];
  for (const [label, override] of bad) {
    it(`${label} → invalid_input, no safe opened, no network, nothing signed`, async () => {
      const { output, fetches, decrypts, keyRequests } = await run(params(override), google(claims()));
      expect(output).toEqual({ ok: false, error: "invalid_input" });
      expect(fetches).toEqual([]);
      expect(decrypts).toEqual([]);
      expect(keyRequests).toBe(0);
    });
  }

  it("safe refuses to open → config_error, Google never contacted", async () => {
    const { output, fetches } = await run(params(), google(claims()), {
      decrypt: () => {
        throw new Error("not permitted");
      },
    });
    expect(output).toEqual({ ok: false, error: "config_error" });
    expect(fetches).toEqual([]);
  });
});

describe("proveit-google.js · privacy and signing", () => {
  const secrets = [CLIENT_SECRET, AUTH_CODE, CODE_VERIFIER, ACCESS_TOKEN, PERSONAL.email, PERSONAL.sub, PERSONAL.name];

  it("never returns or logs the email, name, Google ID, tokens, code or client secret", async () => {
    for (const c of [claims(), claims({ hd: "kraken.com" }), gmailClaims(), claims({ nonce: "x" })]) {
      const { output, logs } = await run(params(), google(c));
      const visible = JSON.stringify(output) + logs.join("\n");
      for (const s of [...secrets, idToken(c)]) expect(visible).not.toContain(s);
    }
  });

  it("signs exactly canonical(result) with the action's own key", async () => {
    const { output } = await run(params(), google(claims()));
    expect(ethers.utils.verifyMessage(canonical(output.result), output.signature)).toBe(TEST_ACTION_KEY.address);
  });

  it("asks Lit for its private key only once, and only at the end", async () => {
    const { keyRequests } = await run(params(), google(claims()));
    expect(keyRequests).toBe(1);
  });

  it("result contains only the documented fields", async () => {
    const { output } = await run(params(), google(claims()));
    expect(Object.keys(output.result).sort()).toEqual(
      ["challengeHash", "claim", "domainAgeFlag", "expiresAt", "issuedAt", "method", "reason", "status", "type", "v"],
    );
  });

  it("the action's copy of canonical() matches shared/canonical.ts", () => {
    const values = [
      { b: 1, a: [true, null, "x"], c: { z: "é ✓", y: -7 } },
      "quote \" and \\ backslash",
      [3, 1, 2],
      { claim: { domain: "coinbase.com" }, v: 1, issuedAt: 1791110400 },
    ];
    for (const v of values) expect(actionCanonical(source, v)).toBe(canonical(v));
  });
});
