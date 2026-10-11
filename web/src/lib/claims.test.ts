import { describe, expect, it } from "vitest";
import type { Check } from "./challenge";
import { claimPhrase, expectedFor, officialServer, pasteMessage, rolesText, whatToDo } from "./claims";
import { PROVEIT } from "./config";

const ID = "Xq3vT9bLm2Rk8WdZp4NcAa";
const server = { guildId: "1373039981890900099", name: "Lit Protocol", officialSource: "", roles: ["Admin", "Mod"] as ("Admin" | "Mod")[] };
const google: Check = { method: "google", challengeId: ID, expiresAt: 100, domain: "coinbase.com" };
const discord: Check = { method: "discord", challengeId: ID, expiresAt: 100, guildId: server.guildId, roles: ["Admin", "Mod"] };

describe("wording", () => {
  it("lists roles naturally", () => {
    expect(rolesText(["Mod"])).toBe("Mod");
    expect(rolesText(["Admin", "Mod"])).toBe("Admin or Mod");
  });

  it("phrases each kind of claim", () => {
    expect(claimPhrase(google)).toBe("work at coinbase.com");
    expect(claimPhrase(discord, server)).toBe("are Admin or Mod in Lit Protocol");
    expect(claimPhrase({ ...discord, roles: ["Mod"] }, server)).toBe("are Mod in Lit Protocol");
  });

  it("names a server without ever doubling the word 'server'", () => {
    expect(officialServer("Lit Protocol")).toBe("the official Lit Protocol server");
    expect(officialServer("heis_sallyy's server")).toBe("the official heis_sallyy's server");
    expect(officialServer(" Gaming Server ")).toBe("the official Gaming Server");
    expect(officialServer("Serverless Devs")).toBe("the official Serverless Devs server");
  });

  it("writes the paste-ready message", () => {
    expect(pasteMessage(google, "proveit.example/v/x")).toBe("Before we continue, please confirm you work at coinbase.com here: proveit.example/v/x");
  });
});

describe("whatToDo", () => {
  it("marks reporting as something to DO, and the rest as things not to do", () => {
    for (const method of ["google", "discord"] as const) {
      const items = whatToDo(method);
      for (const item of items) {
        expect(item.kind, item.text).toBe(/^report/i.test(item.text) ? "do" : "dont");
      }
      expect(items.filter((i) => i.kind === "do")).toHaveLength(1);
    }
  });

  it("never calls anyone 'safe' or 'fake'", () => {
    for (const method of ["google", "discord"] as const) {
      for (const item of whatToDo(method)) expect(item.text).not.toMatch(/\bsafe\b|\bfake\b/i);
    }
  });
});

describe("expectedFor", () => {
  it("expects the domain and the published Google signer", () => {
    expect(expectedFor(google)).toEqual({
      signer: PROVEIT.google.signer, challengeId: ID, method: "google", claim: { domain: "coinbase.com" }, expiresAt: 100,
    });
  });

  it("expects guild, server name and roles exactly as the Discord action signs them", () => {
    expect(expectedFor(discord, server)).toEqual({
      signer: PROVEIT.discord.signer,
      challengeId: ID,
      method: "discord",
      claim: { guildId: server.guildId, guildName: "Lit Protocol", roles: ["Admin", "Mod"] },
      expiresAt: 100,
    });
  });

  it("refuses a Discord check for a server this site doesn't know", () => {
    expect(expectedFor(discord, undefined)).toBeNull();
  });
});
