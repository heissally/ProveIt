import { describe, expect, it } from "vitest";
import { ADD_SERVER_HREF, offeredServers, type ServerSettings } from "./config";

const lit: ServerSettings = { guildId: "1100000000000000001", name: "Lit Protocol", officialSource: "https://developer.litprotocol.com", roles: ["Admin", "Mod"], listed: true };
const demo: ServerSettings = { guildId: "1100000000000000002", name: "ProveIt demo server", officialSource: "", roles: ["Admin", "Mod"], listed: false };

describe("offeredServers", () => {
  it("leaves hidden test servers out of the public list", () => {
    expect(offeredServers([lit, demo], "")).toEqual([lit]);
    expect(offeredServers([lit, demo], "?method=discord")).toEqual([lit]);
  });

  it("offers hidden test servers too when /new is opened with ?test", () => {
    expect(offeredServers([lit, demo], "?test")).toEqual([lit, demo]);
    expect(offeredServers([lit, demo], "?test=1")).toEqual([lit, demo]);
  });
});

describe("ADD_SERVER_HREF", () => {
  it("emails the maintainer with a clear subject", () => {
    expect(ADD_SERVER_HREF).toMatch(/^mailto:salamiademola73@gmail\.com\?subject=/);
    expect(decodeURIComponent(ADD_SERVER_HREF)).toContain("Please add our Discord server to ProveIt");
  });
});
