import { describe, expect, it } from "vitest";
import { parseLitConfig } from "./config.ts";

const G = "0x1111111111111111111111111111111111111111";
const D = "0x2222222222222222222222222222222222222222";

describe("parseLitConfig", () => {
  it("accepts two different wallet addresses", () => {
    expect(parseLitConfig({ google: { pkp: G }, discord: { pkp: D } })).toEqual({
      google: { pkp: G },
      discord: { pkp: D },
    });
  });

  it("ignores spaces around a pasted address", () => {
    expect(parseLitConfig({ google: { pkp: ` ${G} ` }, discord: { pkp: D } }).google.pkp).toBe(G);
  });

  it("says which address is still empty", () => {
    expect(() => parseLitConfig({ google: { pkp: G }, discord: { pkp: "" } })).toThrow(/discord\.pkp is empty/);
  });

  it("rejects something that isn't an address", () => {
    expect(() => parseLitConfig({ google: { pkp: "0x123" }, discord: { pkp: D } })).toThrow(/not a wallet address/);
  });

  it("rejects using the same safe for both methods", () => {
    expect(() => parseLitConfig({ google: { pkp: G }, discord: { pkp: G.toUpperCase().replace("0X", "0x") } })).toThrow(
      /same address/,
    );
  });

  it("rejects a missing or broken file shape", () => {
    expect(() => parseLitConfig(null)).toThrow(/google\.pkp is empty/);
  });
});
