import { ethers } from "ethers";
import { describe, expect, it } from "vitest";
import {
  ALL_ACTIONS_ID, ALL_WALLETS_ADDRESS, cidHash, compareGroup, isClean, normalizeGroupId, type GroupContents,
} from "./group-check.ts";

const SAFE = "0xe59e58610d4940b5d35b448b6e2a16b1d58965e3";
const ENCRYPT = { name: "proveit-encrypt-secret", cid: "QmdAc7E21MmGSoTXBpzm1eh5D36YAVESDBENgqebz86uQs" };
const PROBE_CID = "QmRfmr1ZtqvHXMMTijg6KQyko4oenNyBzMMf8cTWDc8xBu";
const hex = (cid: string) => ethers.utils.keccak256(ethers.utils.toUtf8Bytes(cid));

function group(actions: Array<{ id: string; name: string }>, wallets = [SAFE]): GroupContents {
  return { groupId: "2", actions, wallets };
}
const expectation = { safe: SAFE, allowed: [ENCRYPT], required: ["proveit-encrypt-secret"] };

describe("normalizeGroupId", () => {
  it("turns Lit's 0x-padded hex group id into the plain number other endpoints need", () => {
    expect(normalizeGroupId("0x" + "0".repeat(63) + "3")).toBe("3");
  });

  it("leaves a plain decimal id as it is", () => {
    expect(normalizeGroupId("12")).toBe("12");
  });

  it("passes anything unexpected through unchanged instead of crashing", () => {
    expect(normalizeGroupId("not-a-number")).toBe("not-a-number");
  });
});

describe("compareGroup", () => {
  it("is clean when the group holds only the safe and the encrypt helper", () => {
    const p = compareGroup(group([{ id: hex(ENCRYPT.cid), name: "whatever" }]), expectation);
    expect(isClean(p)).toBe(true);
  });

  it("understands ids listed as decimal numbers as well as hex", () => {
    const decimal = cidHash(ENCRYPT.cid).toString();
    expect(isClean(compareGroup(group([{ id: decimal, name: "x" }]), expectation))).toBe(true);
  });

  it("flags a leftover test action that could open the safe", () => {
    const p = compareGroup(
      group([{ id: hex(ENCRYPT.cid), name: "enc" }, { id: hex(PROBE_CID), name: "proveit-m2-probe-vault" }]),
      expectation,
    );
    expect(isClean(p)).toBe(false);
    expect(p.extraActions).toEqual(["proveit-m2-probe-vault"]);
  });

  it("flags a missing encrypt helper", () => {
    const p = compareGroup(group([]), expectation);
    expect(p.missingActions).toEqual(["proveit-encrypt-secret"]);
  });

  it("flags a second wallet, or a missing safe", () => {
    const other = "0xc6f43ac3a9d2515cada59be8b48790cdaabc1e06";
    expect(compareGroup(group([{ id: hex(ENCRYPT.cid), name: "e" }], [SAFE, other]), expectation).extraWallets).toEqual([other]);
    expect(compareGroup(group([{ id: hex(ENCRYPT.cid), name: "e" }], [other]), expectation).safeMissing).toBe(true);
  });

  it("loudly flags a group that allows ALL actions", () => {
    const p = compareGroup(group([{ id: hex(ENCRYPT.cid), name: "e" }, { id: ALL_ACTIONS_ID, name: "" }]), expectation);
    expect(isClean(p)).toBe(false);
    expect(p.extraActions[0]).toContain("ALL actions are allowed");
  });

  it("loudly flags a group that allows ALL wallets", () => {
    const p = compareGroup(group([{ id: hex(ENCRYPT.cid), name: "e" }], [SAFE, ALL_WALLETS_ADDRESS]), expectation);
    expect(p.extraWallets[0]).toContain("ALL wallets are allowed");
  });

  it("matches the safe address regardless of upper/lower case", () => {
    const p = compareGroup(group([{ id: hex(ENCRYPT.cid), name: "e" }], [SAFE.toUpperCase().replace("0X", "0x")]), expectation);
    expect(isClean(p)).toBe(true);
  });
});
