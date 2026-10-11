import { describe, expect, it } from "vitest";
import { readActionSource } from "./lit-api.ts";
import { readConfig, stampConfig, type GoogleActionConfig } from "./action-config.ts";

const sample: GoogleActionConfig = {
  clientId: "123-abc.apps.googleusercontent.com",
  pkpId: "0x1111111111111111111111111111111111111111",
  encryptedClientSecret: "ciphertext-from-lit",
  redirectUris: ["http://localhost:3000/callback/google"],
};

describe("action CONFIG block", () => {
  it("writes values that can be read back exactly", async () => {
    const source = await readActionSource("lit-actions/proveit-google.js");
    expect(readConfig(stampConfig(source, sample))).toEqual(sample);
  });

  it("changes only the CONFIG block, nothing else in the action", async () => {
    const source = await readActionSource("lit-actions/proveit-google.js");
    const stamped = stampConfig(source, sample);
    const after = (s: string) => s.slice(s.indexOf("// ---- end ProveIt config ----"));
    const before = (s: string) => s.slice(0, s.indexOf("// ---- ProveIt config"));
    expect(after(stamped)).toBe(after(source));
    expect(before(stamped)).toBe(before(source));
  });

  it("gives the same text every time (so the CID is stable)", async () => {
    const source = await readActionSource("lit-actions/proveit-google.js");
    const reordered = { redirectUris: sample.redirectUris, encryptedClientSecret: sample.encryptedClientSecret, pkpId: sample.pkpId, clientId: sample.clientId };
    expect(stampConfig(source, reordered)).toBe(stampConfig(source, sample));
    expect(stampConfig(stampConfig(source, sample), sample)).toBe(stampConfig(source, sample));
  });

  it("writes the Discord server registry the same way whatever order it was listed in", async () => {
    const source = await readActionSource("lit-actions/proveit-discord.js");
    const a = { "1200000000000000002": "Mod", "1200000000000000001": "Admin" };
    const b = { "1200000000000000001": "Admin", "1200000000000000002": "Mod" };
    const one = stampConfig(source, { ...sample, servers: { "1100000000000000001": { name: "Lit", roles: a } } });
    const two = stampConfig(source, { ...sample, servers: { "1100000000000000001": { roles: b, name: "Lit" } } as never });
    expect(one).toBe(two);
    expect(readConfig(one).servers).toEqual({ "1100000000000000001": { name: "Lit", roles: b } });
  });

  it("refuses a file without exactly one config block", () => {
    expect(() => stampConfig("async function main() {}", sample)).toThrow(/config block/);
  });
});
