/**
 * Checks a ProveIt result. The results store, the website and whoever runs
 * ProveIt are all untrusted, so this runs on the asker's own device.
 *
 * A result is trustworthy only if ALL of these hold:
 *   1. its signature recovers to the PUBLISHED signer address of that method's
 *      Lit Action. That address comes from the action's CID, so only that exact
 *      code could have signed it.
 *   2. challengeHash = SHA-256(challengeId from the asker's own link), so it
 *      answers THIS check and not some other one.
 *   3. the claim and expiry are the ones the asker asked for (the stranger
 *      could otherwise edit the link to a different company before signing in).
 *   4. if it says "verified", it was issued before the link expired.
 *
 * Note: "valid" means the result is genuine. It can still say "not_verified".
 */
import { ethers } from "ethers";
import { canonical } from "./canonical.ts";

export const RESULT_TYPE = "proveit.result.v1";

export interface ProveItResult {
  v: number;
  type: string;
  method: "google" | "discord";
  status: "verified" | "not_verified";
  reason: string;
  claim: Record<string, unknown>;
  challengeHash: string;
  issuedAt: number;
  expiresAt: number;
  [extra: string]: unknown;
}

export interface SignedResult {
  result: ProveItResult;
  signature: string;
}

export interface Expected {
  /** Published signer address of the action for this method. */
  signer: string;
  /** The challengeId from the asker's own link. */
  challengeId: string;
  method: "google" | "discord";
  /** What the asker asked for, e.g. { domain: "company.com" }. */
  claim: Record<string, unknown>;
  /** The expiry the asker's link was created with. */
  expiresAt: number;
}

export interface Verification {
  valid: boolean;
  problems: string[];
}

/** SHA-256 of the challengeId as 0x-hex. The Google nonce is the same value without "0x". */
export function challengeHashFor(challengeId: string): string {
  return ethers.utils.sha256(ethers.utils.toUtf8Bytes(challengeId));
}

export function verifyResult(signed: SignedResult, expected: Expected): Verification {
  const problems: string[] = [];
  const r = signed?.result;
  if (!r || typeof r !== "object") return { valid: false, problems: ["no result"] };

  let message: string;
  try {
    message = canonical(r);
  } catch {
    return { valid: false, problems: ["result is not canonical JSON"] };
  }

  try {
    // LIT: the expected signer is the address of the action's own key, which Lit
    // derives from the action's CID. Only that exact code can sign as this address.
    const recovered = ethers.utils.verifyMessage(message, signed.signature);
    if (recovered.toLowerCase() !== expected.signer.toLowerCase()) {
      problems.push("signature is not from the published ProveIt Lit Action");
    }
  } catch {
    problems.push("signature is malformed");
  }

  if (r.type !== RESULT_TYPE || r.v !== 1) problems.push("unknown result format");
  if (r.method !== expected.method) problems.push("result is for a different method");
  if (r.challengeHash !== challengeHashFor(expected.challengeId)) {
    problems.push("result belongs to a different check");
  }
  if (!sameValue(r.claim, expected.claim)) problems.push("result is for a different claim than you asked for");
  if (r.expiresAt !== expected.expiresAt) problems.push("result has a different expiry than your link");
  // A late "verified" must never count. A negative result (e.g. reason "expired",
  // which the action signs AFTER the expiry by definition) can't make anyone trust
  // a stranger, so it may be issued late.
  if (typeof r.issuedAt !== "number") problems.push("result has no issue time");
  else if (r.status === "verified" && r.issuedAt > r.expiresAt) {
    problems.push("result was issued after the link expired");
  }

  return { valid: problems.length === 0, problems };
}

function sameValue(a: unknown, b: unknown): boolean {
  try {
    return canonical(a) === canonical(b);
  } catch {
    return false;
  }
}
