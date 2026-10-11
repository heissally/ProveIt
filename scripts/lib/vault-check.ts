/**
 * How to read the answers from lit-actions/probes/probe-vault.js and
 * lit-actions/proveit-encrypt-secret.js. Kept separate from the network code so
 * the reasoning can be tested with fake Lit answers.
 */
import { describeFailure, type LitActionResult } from "./lit-api.ts";
import type { Check } from "./identity-check.ts";

export type VaultOutcome = { opened: true; sha256: string } | { opened: false; reason: string };

/** Did the safe open? "Refused" covers every failure: HTTP error, thrown error, or Decrypt error. */
export function vaultOutcome(r: LitActionResult): VaultOutcome {
  if (!r.ok) return { opened: false, reason: describeFailure(r) };
  const res = r.response as { decrypted?: unknown; sha256?: unknown; error?: unknown } | null;
  if (res && res.decrypted === true && typeof res.sha256 === "string") {
    return { opened: true, sha256: res.sha256 };
  }
  if (res && res.decrypted === false) {
    return { opened: false, reason: `Decrypt refused: ${String(res.error).slice(0, 300)}` };
  }
  return { opened: false, reason: `unexpected response: ${JSON.stringify(res).slice(0, 200)}` };
}

/** The safe must open AND give back the secret we locked (same fingerprint). */
export function expectOpened(name: string, outcome: VaultOutcome, expectedSha256: string): Check {
  if (!outcome.opened) return { name, ok: false, detail: `did not open: ${outcome.reason}` };
  const same = outcome.sha256 === expectedSha256;
  return {
    name,
    ok: same,
    detail: same
      ? "opened, and the secret inside matches what was locked"
      : `opened, but the secret inside is DIFFERENT (${outcome.sha256})`,
  };
}

/** The safe must stay shut. */
export function expectRefused(name: string, outcome: VaultOutcome): Check {
  return outcome.opened
    ? { name, ok: false, detail: "⚠ IT OPENED. This should have been refused. Stop and tell Claude." }
    : { name, ok: true, detail: `refused: ${outcome.reason}` };
}

/** Pull the ciphertext out of an encrypt-helper answer, or explain why not. */
export function ciphertextFrom(r: LitActionResult): { ciphertext: string } | { error: string } {
  if (!r.ok) return { error: describeFailure(r) };
  const res = r.response as { ok?: unknown; ciphertext?: unknown; error?: unknown } | null;
  if (res && res.ok === true && typeof res.ciphertext === "string" && res.ciphertext.length > 0) {
    return { ciphertext: res.ciphertext };
  }
  return { error: `encrypt helper said: ${JSON.stringify(res).slice(0, 200)}` };
}

/**
 * Change one character in the middle of a ciphertext, staying within the
 * characters it already uses, to simulate someone tampering with stored data.
 */
export function tamper(ciphertext: string): string {
  const i = Math.floor(ciphertext.length / 2);
  const swap = ciphertext[i] === "a" ? "b" : "a";
  return ciphertext.slice(0, i) + swap + ciphertext.slice(i + 1);
}
