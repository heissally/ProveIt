import { describe, expect, it } from "vitest";
import { challengeHashFor } from "../../../shared/verify.ts";
import type { Check } from "./challenge";
import { PROVEIT } from "./config";
import { makePkce, providerUrl, savePending, takePending } from "./signin";

const ID = "Xq3vT9bLm2Rk8WdZp4NcAa";
const google: Check = { method: "google", challengeId: ID, expiresAt: 1791111300, domain: "coinbase.com" };
const discord: Check = { method: "discord", challengeId: ID, expiresAt: 1791111300, guildId: "1373039981890900099", roles: ["Mod"] };

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
}

describe("makePkce", () => {
  it("matches the example in RFC 7636 (S256)", () => {
    // RFC 7636 appendix B: these 32 bytes give this verifier and challenge.
    const bytes = new Uint8Array([116, 24, 223, 180, 151, 153, 224, 37, 79, 250, 96, 125, 216, 173, 187, 186, 22, 212, 37, 77, 105, 214, 191, 240, 91, 88, 5, 88, 83, 132, 141, 121]);
    expect(makePkce(bytes)).toEqual({ verifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk", challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM" });
  });
});

describe("providerUrl", () => {
  it("asks Google for openid email, with the check's nonce and PKCE", () => {
    const u = new URL(providerUrl(google, { origin: "http://localhost:3000", state: "s1", codeChallenge: "c1" }));
    expect(u.origin + u.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(u.searchParams)).toMatchObject({
      client_id: PROVEIT.google.clientId,
      redirect_uri: "http://localhost:3000/callback/google",
      scope: "openid email",
      nonce: challengeHashFor(ID).slice(2),
      state: "s1",
      code_challenge: "c1",
      code_challenge_method: "S256",
    });
  });

  it("asks Discord only for identify + guilds.members.read, never the server list", () => {
    const u = new URL(providerUrl(discord, { origin: "http://localhost:3000", state: "s", codeChallenge: "c" }));
    expect(u.searchParams.get("scope")).toBe("identify guilds.members.read");
    expect(u.searchParams.get("redirect_uri")).toBe("http://localhost:3000/callback/discord");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
  });
});

describe("pending sign-in", () => {
  it("comes back intact when the provider returns the same state", () => {
    const storage = memoryStorage();
    savePending(storage, discord, { state: "abc", verifier: "v", redirectUri: "http://localhost:3000/callback/discord" });
    expect(takePending(storage, "abc")).toEqual({
      check: discord,
      pending: { challengeId: ID, query: expect.any(String), state: "abc", verifier: "v", redirectUri: "http://localhost:3000/callback/discord" },
    });
  });

  it("is refused for a different state (a forged or stray callback)", () => {
    const storage = memoryStorage();
    savePending(storage, google, { state: "abc", verifier: "v", redirectUri: "x" });
    expect(takePending(storage, "evil")).toBeNull();
  });

  it("can only be used once", () => {
    const storage = memoryStorage();
    savePending(storage, google, { state: "abc", verifier: "v", redirectUri: "x" });
    expect(takePending(storage, "abc")).not.toBeNull();
    expect(takePending(storage, "abc")).toBeNull();
  });
});
