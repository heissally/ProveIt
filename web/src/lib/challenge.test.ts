import { describe, expect, it } from "vitest";
import { askerPath, checkCode, fromQuery, newChallengeId, normalizeDomain, toQuery, verifierPath, type Check } from "./challenge";

const ID = "Xq3vT9bLm2Rk8WdZp4NcAa";
const google: Check = { method: "google", challengeId: ID, expiresAt: 1791111300, domain: "coinbase.com" };
const discord: Check = { method: "discord", challengeId: ID, expiresAt: 1791111300, guildId: "1373039981890900099", roles: ["Admin", "Mod"] };

describe("newChallengeId", () => {
  it("is 22 base64url characters (128 random bits)", () => {
    const id = newChallengeId();
    expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(newChallengeId()).not.toBe(id);
  });

  it("encodes the given bytes exactly", () => {
    expect(newChallengeId(new Uint8Array(16).fill(255))).toBe("_____________________w");
  });
});

describe("checkCode", () => {
  it("looks like WORD-NN and is the same every time for the same check", () => {
    expect(checkCode(ID)).toMatch(/^[A-Z]+-[1-9]\d$/);
    expect(checkCode(ID)).toBe(checkCode(ID));
  });

  it("usually differs between checks", () => {
    const codes = new Set(Array.from({ length: 50 }, () => checkCode(newChallengeId())));
    expect(codes.size).toBeGreaterThan(40);
  });
});

describe("normalizeDomain", () => {
  it.each([
    ["coinbase.com", "coinbase.com"],
    ["  Coinbase.COM ", "coinbase.com"],
    ["https://www.coinbase.com/careers?x=1", "coinbase.com"],
    ["prove-it.com.ng", "prove-it.com.ng"],
    ["coinbase.com.", "coinbase.com"],
  ])("%s → %s", (input, out) => expect(normalizeDomain(input)).toBe(out));

  it.each(["", "coinbase", "not a domain", "coin base.com", "-bad.com", "bad-.com", "a.b"])("rejects %j", (input) => {
    expect(normalizeDomain(input)).toBeNull();
  });
});

describe("links", () => {
  it("round-trips a Google check through the link", () => {
    expect(fromQuery(ID, new URLSearchParams(toQuery(google)))).toEqual(google);
  });

  it("round-trips a Discord check through the link", () => {
    expect(fromQuery(ID, new URLSearchParams(toQuery(discord)))).toEqual(discord);
  });

  it("puts roles in the fixed order", () => {
    expect(fromQuery(ID, new URLSearchParams("m=discord&g=1373039981890900099&r=Mod,Admin&e=5"))).toMatchObject({ roles: ["Admin", "Mod"] });
  });

  it("builds the verifier and asker paths with the same check", () => {
    expect(verifierPath(google)).toBe(`/v/${ID}?m=google&e=1791111300&d=coinbase.com`);
    expect(askerPath(google)).toBe(`/r/${ID}?m=google&e=1791111300&d=coinbase.com`);
  });

  it.each([
    ["unknown method", "m=github&e=5"],
    ["missing expiry", "m=google&d=coinbase.com"],
    ["bad domain", "m=google&e=5&d=not_a_domain"],
    ["bad server id", "m=discord&e=5&g=lit&r=Mod"],
    ["no roles", "m=discord&e=5&g=1373039981890900099&r="],
    ["unknown role", "m=discord&e=5&g=1373039981890900099&r=Mod,Moderator"],
    ["a removed role (Team)", "m=discord&e=5&g=1373039981890900099&r=Mod,Team"],
    ["a removed role (Owner)", "m=discord&e=5&g=1373039981890900099&r=Owner"],
  ])("rejects a link with %s", (_label, q) => {
    expect(fromQuery(ID, new URLSearchParams(q))).toBeNull();
  });

  it("rejects a malformed challenge id", () => {
    expect(fromQuery("short", new URLSearchParams(toQuery(google)))).toBeNull();
  });
});
