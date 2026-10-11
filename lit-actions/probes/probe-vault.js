// ProveIt · Milestone 2 probe: can this exact code open this PKP safe?
//
// Throwaway test action, not part of the product. It tries to decrypt a
// ciphertext and, like a well-behaved action, never returns the plaintext.
// It returns only a SHA-256 fingerprint so the script can check the result.
//
// js_params: { pkpId: string, ciphertext: string }

async function main({ pkpId, ciphertext }) {
  try {
    // LIT: decryption is allowed only if this action's CID and the PKP share a group.
    const plaintext = await Lit.Actions.Decrypt({ pkpId, ciphertext });
    return {
      decrypted: true,
      sha256: ethers.utils.sha256(ethers.utils.toUtf8Bytes(plaintext)),
    };
  } catch (err) {
    return { decrypted: false, error: String((err && err.message) || err) };
  }
}
