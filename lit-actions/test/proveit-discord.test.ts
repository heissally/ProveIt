import { ethers } from "ethers";
import { beforeAll, describe, expect, it } from "vitest";
import { canonical } from "../../shared/canonical.ts";
import { verifyResult } from "../../shared/verify.ts";
import { stampConfig } from "../../scripts/lib/action-config.ts";
import { readActionSource } from "../../scripts/lib/lit-api.ts";
import { TEST_ACTION_KEY, actionCanonical, runAction, type RunOptions } from "./harness.ts";
import {
  ACCESS_TOKEN, AUTH_CODE, CHALLENGE_ID, CLIENT_SECRET, CODE_VERIFIER, GUILD_ID, NOW, OTHER_GUILD_ID, PRIVATE,
  REFRESH_TOKEN, ROLE, TEST_CONFIG, USER, fakeDiscord, guildsResponse, meResponse, memberResponse,
  notMemberResponse, params, tokenResponse,
} from "./fixtures/discord.ts";

let source: string;
beforeAll(async () => {
  source = stampConfig(await readActionSource("lit-actions/proveit-discord.js"), TEST_CONFIG);
});

const unlock = (args: { pkpId: string; ciphertext: string }) => {
  if (args.pkpId !== TEST_CONFIG.pkpId || args.ciphertext !== TEST_CONFIG.encryptedClientSecret) throw new Error("wrong safe");
  return CLIENT_SECRET;
};
type Net = Parameters<typeof fakeDiscord>[0];
const signedIn = (extra: Net = {}): Net => ({ token: tokenResponse(), me: meResponse(), ...extra });
function run(p: Record<string, unknown>, network: Net, extra: Partial<RunOptions> = {}) {
  return runAction(source, p, { nowSec: NOW, decrypt: unlock, fetch: fakeDiscord(network), ...extra });
}

/** The asker's side, exactly as the result page will check it. */
function askerVerifies(output: any, roles: string[] = ["Mod", "Team"]) {
  return verifyResult(output, {
    signer: TEST_ACTION_KEY.address, challengeId: CHALLENGE_ID, method: "discord",
    claim: { guildId: GUILD_ID, guildName: "Lit Protocol", roles }, expiresAt: NOW + 14 * 60,
  });
}

describe("proveit-discord.js · verified", () => {
  it("has a role that counts → verified, with username, user ID and the role proved", async () => {
    const { output } = await run(params(), signedIn({ member: memberResponse([ROLE.mod]) }));
    expect(output.result).toMatchObject({
      status: "verified", reason: "ok", method: "discord", provenRole: "Mod",
      subject: { discordUsername: "kai.lit", discordUserId: USER.id },
      claim: { guildId: GUILD_ID, guildName: "Lit Protocol", roles: ["Mod", "Team"] },
    });
    expect(askerVerifies(output)).toEqual({ valid: true, problems: [] });
  });

  it("has several roles → proves the first one that counts", async () => {
    const { output } = await run(params({ roles: ["Team", "Mod"] }), signedIn({ member: memberResponse([ROLE.team, ROLE.mod]) }));
    expect(output.result.provenRole).toBe("Mod");
    expect(output.result.claim.roles).toEqual(["Mod", "Team"]); // claim is always listed in one fixed order
  });

  it("server owner claim → checks ownership via the server list", async () => {
    const { output, fetches } = await run(
      params({ roles: ["Owner"] }),
      signedIn({ guilds: guildsResponse([{ id: OTHER_GUILD_ID, owner: true }, { id: GUILD_ID, owner: true }]) }),
    );
    expect(output.result).toMatchObject({ status: "verified", provenRole: "Owner" });
    expect(fetches.map((f) => f.url)).not.toContain(`https://discord.com/api/v10/users/@me/guilds/${GUILD_ID}/member`);
    expect(askerVerifies(output, ["Owner"]).valid).toBe(true);
  });

  it("owner OR admin claim, account owns the server but has no Admin role → verified as Owner", async () => {
    const { output } = await run(
      params({ roles: ["Admin", "Owner"] }),
      signedIn({ member: memberResponse([]), guilds: guildsResponse([{ id: GUILD_ID, owner: true }]) }),
    );
    expect(output.result).toMatchObject({ status: "verified", provenRole: "Owner" });
  });

  it("role claim works with only identify + guilds.members.read (no list of all servers)", async () => {
    const { output, fetches } = await run(params(), signedIn({ token: tokenResponse("identify guilds.members.read"), member: memberResponse([ROLE.mod]) }));
    expect(output.result.status).toBe("verified");
    expect(fetches.map((f) => f.url)).not.toContain("https://discord.com/api/v10/users/@me/guilds");
  });

  it("owner claim works with only identify + guilds", async () => {
    const { output } = await run(
      params({ roles: ["Owner"] }),
      signedIn({ token: tokenResponse("identify guilds"), guilds: guildsResponse([{ id: GUILD_ID, owner: true }]) }),
    );
    expect(output.result.provenRole).toBe("Owner");
  });

  it("sends Discord exactly what the token exchange needs", async () => {
    const { fetches, decrypts } = await run(params(), signedIn({ member: memberResponse([ROLE.mod]) }));
    expect(decrypts).toEqual([{ pkpId: TEST_CONFIG.pkpId, ciphertext: TEST_CONFIG.encryptedClientSecret }]);
    const tokenCall = fetches.find((f) => f.url.endsWith("/oauth2/token"))!;
    expect(Object.fromEntries(new URLSearchParams(tokenCall.init.body))).toEqual({
      grant_type: "authorization_code", code: AUTH_CODE, code_verifier: CODE_VERIFIER,
      redirect_uri: TEST_CONFIG.redirectUris[0], client_id: TEST_CONFIG.clientId, client_secret: CLIENT_SECRET,
    });
  });
});

describe("proveit-discord.js · could not verify (signed)", () => {
  it("in the server but without a role that counts → role_missing, username shown", async () => {
    const { output } = await run(params(), signedIn({ member: memberResponse([ROLE.artist, ROLE.support]) }));
    expect(output.result).toMatchObject({ status: "not_verified", reason: "role_missing", subject: { discordUsername: "kai.lit" } });
    expect(output.result.provenRole).toBeUndefined();
    expect(askerVerifies(output).valid).toBe(true);
  });

  it("copycat with a lookalike username and no role → role_missing, their real username shown", async () => {
    const { output } = await run(params(), signedIn({ me: meResponse({ id: "1000000000000000777", username: "kai.lit.support" }), member: memberResponse([]) }));
    expect(output.result).toMatchObject({ reason: "role_missing", subject: { discordUsername: "kai.lit.support" } });
  });

  it("a role ID not in the registry never counts, even if it has the right name in a copycat server", async () => {
    const { output } = await run(params(), signedIn({ member: memberResponse(["1299999999999999999"]) }));
    expect(output.result.reason).toBe("role_missing");
  });

  it("not in the server → not_member", async () => {
    const { output } = await run(params(), signedIn({ member: notMemberResponse }));
    expect(output.result).toMatchObject({ status: "not_verified", reason: "not_member" });
  });

  it("owner claim, member but not the owner → not_owner", async () => {
    const { output } = await run(params({ roles: ["Owner"] }), signedIn({ guilds: guildsResponse([{ id: GUILD_ID, owner: false }]) }));
    expect(output.result.reason).toBe("not_owner");
  });

  it("owner claim, not in the server at all → not_member", async () => {
    const { output } = await run(params({ roles: ["Owner"] }), signedIn({ guilds: guildsResponse([{ id: OTHER_GUILD_ID, owner: true }]) }));
    expect(output.result.reason).toBe("not_member");
  });

  it("owner or mod claim, neither → role_missing", async () => {
    const { output } = await run(
      params({ roles: ["Owner", "Mod"] }),
      signedIn({ member: memberResponse([]), guilds: guildsResponse([{ id: GUILD_ID, owner: false }]) }),
    );
    expect(output.result.reason).toBe("role_missing");
  });

  it("expired link → expired, without contacting Discord or opening the safe", async () => {
    const { output, fetches, decrypts } = await run(params({ expiresAt: NOW - 1 }), signedIn());
    expect(output.result).toMatchObject({ status: "not_verified", reason: "expired" });
    expect(fetches).toEqual([]);
    expect(decrypts).toEqual([]);
  });

  const providerCases: Array<[string, Net, string]> = [
    ["Discord rejects the code", { token: { status: 400, body: { error: "invalid_grant", error_description: "Invalid code" } } }, "discord_400_invalid_grant"],
    ["wrong client secret", { token: { status: 401, body: { error: "invalid_client" } } }, "discord_401_invalid_client"],
    ["Discord unreachable", { token: new Error("network down") }, "discord_unreachable"],
    ["no access token in the answer", { token: { status: 200, body: { token_type: "Bearer" } } }, "no_access_token"],
    ["user did not grant the server-roles scope", { token: tokenResponse("identify guilds") }, "missing_scope"],
    ["/users/@me fails", { token: tokenResponse(), me: { status: 500, body: {} } }, "discord_me_500"],
    ["member lookup rate-limited", signedIn({ member: { status: 429, body: { message: "You are being rate limited.", retry_after: 1.5 } } }), "discord_member_429"],
  ];
  for (const [label, network, code] of providerCases) {
    it(`${label} → provider_error / ${code}`, async () => {
      const { output } = await run(params(), network);
      expect(output.result).toMatchObject({ status: "not_verified", reason: "provider_error", providerError: code });
      expect(output.result.subject === undefined || label.includes("member")).toBe(true);
    });
  }

  it("owner claim but the server-list scope wasn't granted → provider_error / missing_scope", async () => {
    const { output } = await run(params({ roles: ["Owner"] }), signedIn({ token: tokenResponse("identify guilds.members.read") }));
    expect(output.result.providerError).toBe("missing_scope");
  });

  it("owner check: server list fails → provider_error", async () => {
    const { output } = await run(params({ roles: ["Owner"] }), signedIn({ guilds: { status: 502, body: "<html>" } }));
    expect(output.result.providerError).toBe("discord_guilds_502");
  });
});

describe("proveit-discord.js · bad input (unsigned, exits early)", () => {
  const bad: Array<[string, Record<string, unknown>]> = [
    ["server not in the registry (copycat server)", { guildId: OTHER_GUILD_ID }],
    ["guildId is not a Discord ID", { guildId: "lit-protocol" }],
    ["guildId tries a prototype trick", { guildId: "__proto__" }],
    ["no roles claimed", { roles: [] }],
    ["roles is not a list", { roles: "Mod" }],
    ["unknown role label", { roles: ["Moderator"] }],
    ["the same role twice", { roles: ["Mod", "Mod"] }],
    ["challengeId too short", { challengeId: "abc" }],
    ["bad PKCE verifier", { codeVerifier: "short" }],
    ["redirect address not on the allowed list", { redirectUri: "https://evil.example/callback/discord" }],
    ["link lasts longer than 15 minutes", { expiresAt: NOW + 3600 }],
  ];
  for (const [label, override] of bad) {
    it(`${label} → invalid_input, no safe opened, no network, nothing signed`, async () => {
      const { output, fetches, decrypts, keyRequests } = await run(params(override), signedIn());
      expect(output).toEqual({ ok: false, error: "invalid_input" });
      expect(fetches).toEqual([]);
      expect(decrypts).toEqual([]);
      expect(keyRequests).toBe(0);
    });
  }

  it("a label this server's registry doesn't define → invalid_input", async () => {
    const config = { ...TEST_CONFIG, servers: { [GUILD_ID]: { name: "Lit Protocol", roles: { [ROLE.mod]: "Mod" } } } };
    const src = stampConfig(await readActionSource("lit-actions/proveit-discord.js"), config);
    const { output } = await runAction(src, params({ roles: ["Admin"] }), { nowSec: NOW, decrypt: unlock, fetch: fakeDiscord(signedIn()) });
    expect(output).toEqual({ ok: false, error: "invalid_input" });
  });

  it("safe refuses to open → config_error, Discord never contacted", async () => {
    const { output, fetches } = await run(params(), signedIn(), { decrypt: () => { throw new Error("not permitted"); } });
    expect(output).toEqual({ ok: false, error: "config_error" });
    expect(fetches).toEqual([]);
  });
});

describe("proveit-discord.js · privacy and signing", () => {
  it("never returns or logs the token, code, client secret, display name, nickname or email", async () => {
    const networks = [
      signedIn({ member: memberResponse([ROLE.mod]) }),
      signedIn({ member: memberResponse([]) }),
      signedIn({ member: notMemberResponse }),
    ];
    for (const n of networks) {
      const { output, logs } = await run(params(), n);
      const visible = JSON.stringify(output) + logs.join("\n");
      for (const s of [ACCESS_TOKEN, REFRESH_TOKEN, AUTH_CODE, CODE_VERIFIER, CLIENT_SECRET, PRIVATE.globalName, PRIVATE.nick, PRIVATE.email]) {
        expect(visible).not.toContain(s);
      }
    }
  });

  it("sends the access token only to discord.com", async () => {
    const { fetches } = await run(params(), signedIn({ member: memberResponse([ROLE.mod]) }));
    for (const f of fetches) expect(new URL(f.url).hostname).toBe("discord.com");
  });

  it("signs exactly canonical(result) with the action's own key, asking for it once", async () => {
    const { output, keyRequests } = await run(params(), signedIn({ member: memberResponse([ROLE.mod]) }));
    expect(ethers.utils.verifyMessage(canonical(output.result), output.signature)).toBe(TEST_ACTION_KEY.address);
    expect(keyRequests).toBe(1);
  });

  it("result contains only the documented fields", async () => {
    const { output } = await run(params(), signedIn({ member: memberResponse([ROLE.mod]) }));
    expect(Object.keys(output.result).sort()).toEqual(
      ["challengeHash", "claim", "expiresAt", "issuedAt", "method", "provenRole", "reason", "status", "subject", "type", "v"],
    );
    expect(Object.keys(output.result.subject).sort()).toEqual(["discordUserId", "discordUsername"]);
  });

  it("the action's copy of canonical() matches shared/canonical.ts", () => {
    for (const v of [{ b: [1, { d: null, c: "✓" }], a: true }, "x\"y", { roles: ["Mod", "Team"], v: 1 }]) {
      expect(actionCanonical(source, v)).toBe(canonical(v));
    }
  });
});
