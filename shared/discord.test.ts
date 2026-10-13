import { describe, expect, it } from "vitest";
import { callActionFunction } from "../lit-actions/test/harness.ts";
import { readActionSource } from "../scripts/lib/lit-api.ts";
import { DISCORD_SCOPES, ROLE_ORDER, roleName, sortRoles } from "./discord.ts";

/** Read one of the Discord action's top-level constants, inside its sandbox. */
async function actionConstant(name: string): Promise<unknown> {
  const source = await readActionSource("lit-actions/proveit-discord.js");
  return callActionFunction(`${source}\nfunction __read() { return ${name}; }`, "__read", null);
}

describe("Discord rules", () => {
  it("ask only for identify + guilds.members.read, never the server list", () => {
    expect(DISCORD_SCOPES).toEqual(["identify", "guilds.members.read"]);
    expect(DISCORD_SCOPES).not.toContain("guilds");
  });

  it("put roles in the one fixed order and drop anything that isn't Admin or Mod", () => {
    expect(sortRoles(["Mod", "Team", "Admin", "Owner"])).toEqual(["Admin", "Mod"]);
  });

  it("match the Discord Lit Action's own scopes exactly", async () => {
    expect(await actionConstant("SCOPES")).toEqual(DISCORD_SCOPES);
  });

  it("match the Discord Lit Action's own role labels and order exactly", async () => {
    expect(await actionConstant("LABELS")).toEqual(ROLE_ORDER);
  });
});

describe("roleName", () => {
  it("spells out Moderator for people, while the signed code word stays Mod", () => {
    expect(roleName("Mod")).toBe("Moderator");
    expect(roleName("Admin")).toBe("Admin");
    expect(ROLE_ORDER).toEqual(["Admin", "Mod"]);
  });

  it("shows anything unexpected as it is", () => {
    expect(roleName("Owner")).toBe("Owner");
  });
});
