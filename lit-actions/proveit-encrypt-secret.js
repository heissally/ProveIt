// ProveIt encrypt helper
//
// Locks one secret (e.g. the Google OAuth client secret) into a PKP "safe" and
// returns only the ciphertext. ProveIt runs it once per secret, then removes it
// from the group again. It never decrypts anything.
//
// js_params: { pkpId: string, secret: string }
//   pkpId   the safe's wallet address (0x...)
//   secret  the text to lock. Sent only over TLS to Lit's TEE, with privacy mode on.

async function main(params) {
  const pkpId = params && params.pkpId;
  const secret = params && params.secret;
  if (typeof pkpId !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(pkpId)) {
    return { ok: false, error: "invalid_pkp_id" };
  }
  if (typeof secret !== "string" || secret.length === 0 || secret.length > 8192) {
    return { ok: false, error: "invalid_secret" };
  }

  // LIT: encrypt with a key derived from this PKP inside the TEE. Lit only allows
  // it if this action's CID and the PKP are in the same group. Only actions in a
  // group with this PKP can ever decrypt the result.
  const ciphertext = await Lit.Actions.Encrypt({ pkpId, message: secret });

  return { ok: true, ciphertext };
}
