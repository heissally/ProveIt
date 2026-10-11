import { describe, expect, it } from "vitest";
import { missingOfficialSource, parseRegistry, registryForAction } from "./registry.ts";

const GUILD = "1100000000000000001";
const good = {
  guildId: GUILD,
  name: "Lit Protocol",
  officialSource: "https://litprotocol.com",
  roles: { "1200000000000000001": "Admin", "1200000000000000002": "Mod" },
};
const reg = (...servers: unknown[]) => ({ servers });

describe("parseRegistry", () => {
  it("accepts a well-formed server", () => {
    expect(parseRegistry(reg(good))).toEqual([good]);
  });

  it("explains an empty template entry (what the file starts as)", () => {
    expect(() => parseRegistry(reg({ guildId: "", name: "", officialSource: "", roles: {} }))).toThrow(/guildId must be the server ID/);
  });

  it("rejects a label other than Admin, Mod, Team or Support", () => {
    expect(() => parseRegistry(reg({ ...good, roles: { "1200000000000000003": "Moderator" } }))).toThrow(/must be one of Admin, Mod, Team, Support/);
  });

  it("rejects the @everyone role (its ID equals the server ID), since everyone has it", () => {
    expect(() => parseRegistry(reg({ ...good, roles: { [GUILD]: "Mod" } }))).toThrow(/@everyone/);
  });

  it("rejects a role ID that isn't a Discord ID", () => {
    expect(() => parseRegistry(reg({ ...good, roles: { "mod-role": "Mod" } }))).toThrow(/17–20 digits/);
  });

  it("rejects the same server listed twice", () => {
    expect(() => parseRegistry(reg(good, good))).toThrow(/listed twice/);
  });

  it("requires the official source to be an https link if one is given", () => {
    expect(() => parseRegistry(reg({ ...good, officialSource: "discord.gg/abc" }))).toThrow(/officialSource/);
  });

  it("allows an empty official source for a test server, and lists it as missing", () => {
    const servers = parseRegistry(reg({ ...good, officialSource: "" }));
    expect(missingOfficialSource(servers)).toEqual(["Lit Protocol"]);
    expect(missingOfficialSource(parseRegistry(reg(good)))).toEqual([]);
  });

  it("rejects a file with no servers", () => {
    expect(() => parseRegistry({ servers: [] })).toThrow(/at least one server/);
  });
});

describe("registryForAction", () => {
  it("keys servers by guild ID and keeps only what the action needs", () => {
    expect(registryForAction([{ ...good, name: " Lit Protocol " }])).toEqual({
      [GUILD]: { name: "Lit Protocol", roles: good.roles },
    });
  });
});
