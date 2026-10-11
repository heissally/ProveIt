// ProveIt · Milestone 1 probe: action-identity signing.
//
// Throwaway test action, not part of the product. It checks the trick ProveIt
// is built on: an action can sign with a key derived from its own code (CID),
// and anyone can later look up that key's address from the CID alone.
//
// js_params: { message: string, selfCid: string }
//   message  the text to sign (the script sends a canonical-JSON sample result)
//   selfCid  this file's own CID, computed by the script before the call

async function main({ message, selfCid }) {
  const report = {};

  // 1. Ask Lit for the address that belongs to our own CID. This is the call that
  //    did not work in the escrow project, so we record any error instead of failing.
  try {
    report.addressFromSelfCid = await Lit.Actions.getLitActionWalletAddress({
      ipfsId: selfCid,
    });
  } catch (err) {
    report.addressFromSelfCidError = String((err && err.message) || err);
  }

  // 2. LIT: get this action's own private key. The TEE derives it from this
  //    file's exact bytes, so no other code can ever obtain it.
  const wallet = new ethers.Wallet(await Lit.Actions.getLitActionPrivateKey());

  // 3. Sign the message the same way ProveIt will sign results (EIP-191 signMessage).
  report.signerAddress = wallet.address;
  report.message = message;
  report.signature = await wallet.signMessage(message);
  return report;
}
