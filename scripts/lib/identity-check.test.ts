import { ethers } from "ethers";
import { describe, expect, it } from "vitest";
import { checkIdentityProbe, type Check } from "./identity-check.ts";

// These tests stand in for Lit: a random local wallet plays the part of the
// action's own key, so we can check our verification logic without the network.
const CID = "QmNvjVqV9HnPhHtqDmj6X4dYShnYk1SyW9C6ZGhd8M7qYE";

async function fakeLitOutputs(message = '{"method":"google","v":1}') {
  const actionKey = ethers.Wallet.createRandom();
  const probe = {
    message,
    signature: await actionKey.signMessage(message),
    signerAddress: actionKey.address,
    addressFromSelfCid: actionKey.address,
  };
  const lookup = {
    ok: true,
    cid: CID,
    walletAddress: actionKey.address,
    publicKey: actionKey.publicKey,
  };
  return { actionKey, probe, lookup };
}

const failures = (checks: Check[]) => checks.filter((c) => c.ok === false);

describe("checkIdentityProbe", () => {
  it("passes when the signature, the action and the lookup all agree", async () => {
    const { probe, lookup } = await fakeLitOutputs();
    const checks = checkIdentityProbe(probe, lookup, CID);
    expect(failures(checks)).toEqual([]);
    expect(checks.filter((c) => c.ok === true)).toHaveLength(3);
  });

  it("fails if the signed message was changed afterwards", async () => {
    const { probe, lookup } = await fakeLitOutputs();
    probe.message = probe.message.replace("google", "discord");
    const failed = failures(checkIdentityProbe(probe, lookup, CID));
    expect(failed.map((c) => c.name)).toContain("Lookup helper names the same signer for this CID");
  });

  it("fails if the lookup names a different signer (e.g. different code)", async () => {
    const { probe, lookup } = await fakeLitOutputs();
    lookup.walletAddress = ethers.Wallet.createRandom().address;
    const failed = failures(checkIdentityProbe(probe, lookup, CID));
    expect(failed.map((c) => c.name)).toContain("Lookup helper names the same signer for this CID");
  });

  it("fails if someone else's key signed it", async () => {
    const { probe, lookup } = await fakeLitOutputs();
    probe.signature = await ethers.Wallet.createRandom().signMessage(probe.message);
    expect(failures(checkIdentityProbe(probe, lookup, CID)).length).toBeGreaterThan(0);
  });

  it("fails cleanly on a malformed signature instead of crashing", async () => {
    const { probe, lookup } = await fakeLitOutputs();
    probe.signature = "0x1234";
    const checks = checkIdentityProbe(probe, lookup, CID);
    expect(checks).toHaveLength(1);
    expect(checks[0].ok).toBe(false);
  });

  it("fails if the lookup helper returned an error", async () => {
    const { probe } = await fakeLitOutputs();
    const failed = failures(checkIdentityProbe(probe, { ok: false, error: "invalid_cid" }, CID));
    expect(failed[0].detail).toContain("invalid_cid");
  });

  it("only reports (does not fail) when the action can't look up its own CID", async () => {
    const { probe, lookup } = await fakeLitOutputs();
    delete (probe as { addressFromSelfCid?: string }).addressFromSelfCid;
    (probe as { addressFromSelfCidError?: string }).addressFromSelfCidError = "could not determine";
    const checks = checkIdentityProbe(probe, lookup, CID);
    expect(failures(checks)).toEqual([]);
    const info = checks.find((c) => c.ok === null);
    expect(info?.detail).toContain("could not determine");
  });
});
