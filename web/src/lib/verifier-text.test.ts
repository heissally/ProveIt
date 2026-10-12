import { describe, expect, it } from "vitest";
import type { ProveItResult } from "../../../shared/verify.ts";
import type { Check } from "./challenge";
import { howItWorks, sharedNote, verifierFailure } from "./verifier-text";

const ID = "Xq3vT9bLm2Rk8WdZp4NcAa";
const google: Check = { method: "google", challengeId: ID, expiresAt: 100, domain: "prove-it.com.ng" };
const discord: Check = { method: "discord", challengeId: ID, expiresAt: 100, guildId: "1373039981890900099", roles: ["Mod"] };
const server = { guildId: discord.guildId, name: "heis_sallyy's server", officialSource: "", roles: ["Mod"] as "Mod"[] };

const result = (fields: Partial<ProveItResult>): ProveItResult =>
  ({ v: 1, type: "proveit.result.v1", method: "google", status: "not_verified", reason: "no_hd", claim: {}, challengeHash: "0x", issuedAt: 1, expiresAt: 100, ...fields }) as ProveItResult;

describe("verifier's 'could not verify' sentence", () => {
  it("says 'You didn't…' for a personal Gmail", () => {
    expect(verifierFailure(google, result({ reason: "no_hd" }))).toMatch(/^You didn't sign in with a company Google account/);
  });

  it("names the domain they actually used, and the one they were asked about", () => {
    expect(verifierFailure({ ...google, domain: "coinbase.com" }, result({ reason: "wrong_domain", actualDomain: "prove-it.com.ng" }))).toBe(
      "You signed in with an account at prove-it.com.ng, not coinbase.com.",
    );
  });
});

describe("lock box: what was shared", () => {
  it("verified: only the domain", () => {
    expect(sharedNote(google, result({ status: "verified", reason: "ok", domainAgeFlag: "ok" }))).toBe(
      "Your name and email stayed inside the enclave. Only “prove-it.com.ng” was shared.",
    );
  });

  it("no company account: does NOT claim a domain was shared", () => {
    const note = sharedNote(google, result({ reason: "no_hd" }));
    expect(note).toContain("No company domain was shared");
    expect(note).not.toMatch(/Only .* domain .* was shared/);
  });

  it("wrong company: says exactly which domain was shared", () => {
    expect(sharedNote({ ...google, domain: "coinbase.com" }, result({ reason: "wrong_domain", actualDomain: "prove-it.com.ng" }))).toContain(
      "(“prove-it.com.ng”)",
    );
  });

  it("expired or Google error: no domain shared", () => {
    for (const reason of ["expired", "provider_error", "bad_nonce"]) {
      expect(sharedNote(google, result({ reason }))).toContain("No company domain was shared");
    }
  });

  it("Discord verified: username and role", () => {
    const r = result({ method: "discord", status: "verified", reason: "ok", provenRole: "Mod", subject: { discordUsername: "sa_llyy", discordUserId: "1" } });
    expect(sharedNote(discord, r)).toBe("Only your username (sa_llyy) and your Mod role were shared. Nothing else from your Discord account was shared.");
  });

  it("Discord role missing: username and the reason, no role", () => {
    const r = result({ method: "discord", reason: "role_missing", subject: { discordUsername: "a second test account", discordUserId: "2" } });
    expect(sharedNote(discord, r)).toBe("Only your username (a second test account) and the reason the check didn’t pass were shared. Nothing else from your Discord account was shared.");
  });

  it("Discord error before sign-in finished: nothing from the account", () => {
    expect(sharedNote(discord, result({ method: "discord", reason: "provider_error" }))).toMatch(/^Nothing from your Discord account was shared/);
  });
});

describe("'How this works' points", () => {
  it("Google: own page, password, domain only, 30 days", () => {
    const text = howItWorks(google).join(" ");
    expect(text).toContain("You sign in on Google’s own page");
    expect(text).toContain("ProveIt never sees it");
    expect(text).toContain("checks only which company domain");
    expect(text).toContain("kept for 30 days");
  });

  it("Discord: says honestly what Discord's screen asks for, and that only one server is checked", () => {
    const text = howItWorks(discord, server).join(" ");
    expect(text).toContain("You sign in on Discord’s own page");
    expect(text).toContain("read your member info in your servers");
    expect(text).toContain("looks only at heis_sallyy's server");
    expect(text).toContain("whether you have Mod in heis_sallyy's server");
  });

  it("never promises that whoever runs the website can't see a sign-in", () => {
    for (const text of [...howItWorks(google), ...howItWorks(discord, server)]) {
      expect(text).not.toMatch(/operator|no one can see|nobody can see|not even/i);
    }
  });
});
