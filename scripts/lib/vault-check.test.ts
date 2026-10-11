import { describe, expect, it } from "vitest";
import type { LitActionResult } from "./lit-api.ts";
import { ciphertextFrom, expectOpened, expectRefused, tamper, vaultOutcome } from "./vault-check.ts";

// Fake answers shaped like what Lit returns, so we can check our reading of them.
const answer = (response: unknown): LitActionResult => ({ status: 200, ok: true, response, logs: "", ms: 10 });
const httpError = (status: number, error: unknown): LitActionResult => ({
  status,
  ok: false,
  response: null,
  logs: "",
  error,
  ms: 10,
});
const SHA = "0x" + "ab".repeat(32);

describe("vaultOutcome", () => {
  it("reads an opened safe", () => {
    expect(vaultOutcome(answer({ decrypted: true, sha256: SHA }))).toEqual({ opened: true, sha256: SHA });
  });

  it("treats a Decrypt error inside the action as refused", () => {
    const out = vaultOutcome(answer({ decrypted: false, error: "PKP not permitted" }));
    expect(out.opened).toBe(false);
    if (!out.opened) expect(out.reason).toContain("PKP not permitted");
  });

  it("treats an HTTP refusal (e.g. 403) as refused", () => {
    const out = vaultOutcome(httpError(403, "not authorized"));
    expect(out.opened).toBe(false);
    if (!out.opened) expect(out.reason).toContain("HTTP 403");
  });

  it("treats a strange answer as refused, never as opened", () => {
    expect(vaultOutcome(answer({ decrypted: true })).opened).toBe(false);
    expect(vaultOutcome(answer(null)).opened).toBe(false);
  });
});

describe("expectOpened / expectRefused", () => {
  it("passes when the safe opens with the right secret", () => {
    expect(expectOpened("x", { opened: true, sha256: SHA }, SHA).ok).toBe(true);
  });

  it("fails when the safe opens but holds a different secret", () => {
    expect(expectOpened("x", { opened: true, sha256: "0x00" }, SHA).ok).toBe(false);
  });

  it("fails when a safe that should open stays shut", () => {
    expect(expectOpened("x", { opened: false, reason: "nope" }, SHA).ok).toBe(false);
  });

  it("passes when a safe that should stay shut is refused", () => {
    expect(expectRefused("x", { opened: false, reason: "nope" }).ok).toBe(true);
  });

  it("fails loudly when a safe that should stay shut opens", () => {
    const check = expectRefused("x", { opened: true, sha256: SHA });
    expect(check.ok).toBe(false);
    expect(check.detail).toContain("IT OPENED");
  });
});

describe("ciphertextFrom", () => {
  it("returns the ciphertext from a good answer", () => {
    expect(ciphertextFrom(answer({ ok: true, ciphertext: "abc" }))).toEqual({ ciphertext: "abc" });
  });

  it("explains a helper error", () => {
    expect(ciphertextFrom(answer({ ok: false, error: "invalid_pkp_id" }))).toHaveProperty("error");
  });

  it("explains an HTTP error", () => {
    const out = ciphertextFrom(httpError(403, "not authorized"));
    expect("error" in out && out.error).toContain("HTTP 403");
  });
});

describe("tamper", () => {
  it("changes exactly one character and keeps the length", () => {
    const original = "abcdefghij";
    const changed = tamper(original);
    expect(changed).toHaveLength(original.length);
    expect([...changed].filter((c, i) => c !== original[i])).toHaveLength(1);
  });
});
