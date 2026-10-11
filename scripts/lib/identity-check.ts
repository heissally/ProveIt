import { ethers } from "ethers";

/** What lit-actions/probes/probe-identity.js returns. */
export interface IdentityProbeOutput {
  message: string;
  signature: string;
  signerAddress: string;
  addressFromSelfCid?: string;
  addressFromSelfCidError?: string;
}

/** What lit-actions/proveit-signer-lookup.js returns. */
export interface SignerLookupOutput {
  ok: boolean;
  cid?: string;
  walletAddress?: string;
  publicKey?: string;
  error?: string;
}

export interface Check {
  name: string;
  /** true = passed, false = failed, null = information only (not pass/fail) */
  ok: boolean | null;
  detail: string;
}

function sameAddress(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  try {
    return ethers.utils.getAddress(a) === ethers.utils.getAddress(b);
  } catch {
    return false;
  }
}

/**
 * Decide whether action-identity signing works the way ProveIt needs.
 *
 * This is the same reasoning the result page will use later (shared/verify.ts):
 * recover the address from the signature, then compare it with the address Lit
 * reports for the action's CID. If they match, only that exact code signed it.
 */
export function checkIdentityProbe(
  probe: IdentityProbeOutput,
  lookup: SignerLookupOutput,
  probeCid: string,
): Check[] {
  const checks: Check[] = [];

  let recovered: string | undefined;
  try {
    recovered = ethers.utils.verifyMessage(probe.message, probe.signature);
  } catch (err) {
    checks.push({
      name: "Signature can be read",
      ok: false,
      detail: `ethers could not recover an address: ${(err as Error).message}`,
    });
    return checks;
  }

  checks.push({
    name: "Signature matches the action's own key",
    ok: sameAddress(recovered, probe.signerAddress),
    detail: `recovered ${recovered}, action said it signed as ${probe.signerAddress}`,
  });

  if (!lookup.ok || !lookup.walletAddress) {
    checks.push({
      name: "Signer lookup helper returned an address",
      ok: false,
      detail: `lookup failed: ${lookup.error ?? "no walletAddress in response"}`,
    });
    return checks;
  }

  checks.push({
    name: "Lookup helper names the same signer for this CID",
    ok: sameAddress(recovered, lookup.walletAddress),
    detail: `getLitActionWalletAddress(${probeCid}) = ${lookup.walletAddress}`,
  });

  if (lookup.publicKey) {
    let fromKey = "";
    try {
      fromKey = ethers.utils.computeAddress(lookup.publicKey);
    } catch {
      fromKey = "(not a valid public key)";
    }
    checks.push({
      name: "Lookup helper's public key matches its address",
      ok: sameAddress(fromKey, lookup.walletAddress),
      detail: `address computed from public key = ${fromKey}`,
    });
  }

  // Informational: the escrow project could not get this to work, so we record
  // what happens when an action asks about its own CID. Not a pass/fail check.
  checks.push({
    name: "Action looking up its own CID (escrow issue)",
    ok: null,
    detail: probe.addressFromSelfCidError
      ? `error inside the action: ${probe.addressFromSelfCidError}`
      : sameAddress(probe.addressFromSelfCid, recovered)
        ? `worked, returned ${probe.addressFromSelfCid}`
        : `returned ${probe.addressFromSelfCid}, which does NOT match the signer`,
  });

  return checks;
}
