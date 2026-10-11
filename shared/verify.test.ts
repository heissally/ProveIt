import { ethers } from "ethers";
import { describe, expect, it } from "vitest";
import { canonical } from "./canonical.ts";
import { challengeHashFor, verifyResult, type Expected, type ProveItResult } from "./verify.ts";

// A random local key plays the part of the Lit Action's own key.
const actionKey = ethers.Wallet.createRandom();
const CHALLENGE_ID = "AAAAAAAAAAAAAAAAAAAAAA";
const EXPIRES_AT = 1791111300;

function makeResult(overrides: Partial<ProveItResult> = {}): ProveItResult {
  return {
    v: 1,
    type: "proveit.result.v1",
    method: "google",
    status: "verified",
    reason: "ok",
    claim: { domain: "coinbase.com" },
    challengeHash: challengeHashFor(CHALLENGE_ID),
    issuedAt: EXPIRES_AT - 600,
    expiresAt: EXPIRES_AT,
    domainAgeFlag: "ok",
    ...overrides,
  };
}
async function signed(result: ProveItResult, key = actionKey) {
  return { result, signature: await key.signMessage(canonical(result)) };
}
const expected: Expected = {
  signer: actionKey.address,
  challengeId: CHALLENGE_ID,
  method: "google",
  claim: { domain: "coinbase.com" },
  expiresAt: EXPIRES_AT,
};

describe("verifyResult", () => {
  it("accepts a genuine result for this check", async () => {
    expect(verifyResult(await signed(makeResult()), expected)).toEqual({ valid: true, problems: [] });
  });

  it("accepts a genuine 'not verified' result too (it is real, just negative)", async () => {
    const r = makeResult({ status: "not_verified", reason: "no_hd" });
    expect(verifyResult(await signed(r), expected).valid).toBe(true);
  });

  it("rejects a result that was edited after signing (tampered store)", async () => {
    const s = await signed(makeResult({ status: "not_verified", reason: "no_hd" }));
    s.result.status = "verified";
    s.result.reason = "ok";
    const v = verifyResult(s, expected);
    expect(v.valid).toBe(false);
    expect(v.problems).toContain("signature is not from the published ProveIt Lit Action");
  });

  it("rejects a result signed by any other key (e.g. the operator's)", async () => {
    const v = verifyResult(await signed(makeResult(), ethers.Wallet.createRandom()), expected);
    expect(v.valid).toBe(false);
  });

  it("rejects a genuine result from a different check", async () => {
    const r = makeResult({ challengeHash: challengeHashFor("BBBBBBBBBBBBBBBBBBBBBB") });
    expect(verifyResult(await signed(r), expected).problems).toContain("result belongs to a different check");
  });

  it("rejects a genuine result for a company the asker did not ask about", async () => {
    const r = makeResult({ claim: { domain: "scam-co.com" } });
    expect(verifyResult(await signed(r), expected).problems).toContain(
      "result is for a different claim than you asked for",
    );
  });

  it("rejects a different expiry than the asker's link", async () => {
    const r = makeResult({ expiresAt: EXPIRES_AT + 3600 });
    expect(verifyResult(await signed(r), expected).valid).toBe(false);
  });

  it("rejects a result issued after the link expired", async () => {
    const r = makeResult({ issuedAt: EXPIRES_AT + 1 });
    expect(verifyResult(await signed(r), expected).problems).toContain("result was issued after the link expired");
  });

  it("accepts a genuine 'expired' result, even though it was signed after the expiry", async () => {
    const r = makeResult({ status: "not_verified", reason: "expired", issuedAt: EXPIRES_AT + 60 });
    expect(verifyResult(await signed(r), expected)).toEqual({ valid: true, problems: [] });
  });

  it("rejects a result with no issue time", async () => {
    const r = makeResult({ issuedAt: "soon" as never });
    expect(verifyResult(await signed(r), expected).problems).toContain("result has no issue time");
  });

  it("rejects a result for the other method", async () => {
    const r = makeResult({ method: "discord" });
    expect(verifyResult(await signed(r), expected).problems).toContain("result is for a different method");
  });

  it("rejects an unknown result format", async () => {
    const r = makeResult({ type: "something-else" });
    expect(verifyResult(await signed(r), expected).problems).toContain("unknown result format");
  });

  it("fails cleanly on a malformed signature or empty input", async () => {
    expect(verifyResult({ result: makeResult(), signature: "0x1234" }, expected).problems).toContain(
      "signature is malformed",
    );
    expect(verifyResult({} as never, expected).valid).toBe(false);
  });
});
