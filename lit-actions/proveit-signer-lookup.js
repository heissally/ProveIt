// ProveIt signer lookup
//
// Given any Lit Action's CID, returns the address and public key of that action's
// own signing key. ProveIt uses it to find and publish the "signer address" of
// proveit-google.js and proveit-discord.js, and anyone can run it to check them.
//
// It reads only public information. It touches no secrets and no PKP wallets.
//
// js_params: { cid: string }   a CIDv0 such as "Qm..."

async function main(params) {
  const cid = params && params.cid;
  if (typeof cid !== "string" || !/^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(cid)) {
    return { ok: false, error: "invalid_cid" };
  }

  // LIT: the TEE's key service derives an action's key from its CID, so the
  // matching public key and address can be looked up for any CID, by anyone.
  const walletAddress = await Lit.Actions.getLitActionWalletAddress({ ipfsId: cid });
  const publicKey = await Lit.Actions.getLitActionPublicKey({ ipfsId: cid });

  return { ok: true, cid, walletAddress, publicKey };
}
