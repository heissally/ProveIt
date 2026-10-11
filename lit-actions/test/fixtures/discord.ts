/**
 * Fake Discord answers for testing proveit-discord.js.
 *
 * Shapes follow Discord's API docs (developers/topics/oauth2.mdx,
 * developers/resources/user.mdx and guild.mdx in github.com/discord/discord-api-docs).
 * We build them instead of recording real ones because real answers contain
 * personal account data.
 */
import type { FakeFetch, FakeResponse } from "../harness.ts";

export const NOW = 1791110400;
export const CLIENT_ID = "1300000000000000001";
export const CLIENT_SECRET = "discord-test-client-secret-never1";
export const REDIRECT_URI = "http://localhost:3000/callback/discord";
export const GUILD_ID = "1100000000000000001";
export const OTHER_GUILD_ID = "1100000000000000999";
export const ROLE = { admin: "1200000000000000001", mod: "1200000000000000002", team: "1200000000000000003", support: "1200000000000000004", artist: "1200000000000000099" };

export const TEST_CONFIG = {
  clientId: CLIENT_ID,
  pkpId: "0xc6f43ac3a9d2515cada59be8b48790cdaabc1e06",
  encryptedClientSecret: "test-ciphertext-for-the-discord-client-secret",
  redirectUris: [REDIRECT_URI],
  servers: {
    [GUILD_ID]: {
      name: "Lit Protocol",
      roles: { [ROLE.admin]: "Admin", [ROLE.mod]: "Mod", [ROLE.team]: "Team", [ROLE.support]: "Support" },
    },
  },
};

export const AUTH_CODE = "discord-test-one-time-code-123";
export const ACCESS_TOKEN = "discord-test-access-token-never-leak";
export const REFRESH_TOKEN = "discord-test-refresh-token-never-leak";
export const CODE_VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
export const CHALLENGE_ID = "Xq3vT9bLm2Rk8WdZp4NcAa";
export const USER = { id: "1000000000000000042", username: "kai.lit" };
// Never in the output: things Discord tells us that ProveIt doesn't need.
export const PRIVATE = { globalName: "Kai (private display name)", email: "kai@example.com", nick: "kai-nickname-in-server" };

export function params(overrides: Record<string, unknown> = {}) {
  return {
    code: AUTH_CODE,
    codeVerifier: CODE_VERIFIER,
    redirectUri: REDIRECT_URI,
    challengeId: CHALLENGE_ID,
    guildId: GUILD_ID,
    roles: ["Mod", "Team"],
    expiresAt: NOW + 14 * 60,
    ...overrides,
  };
}

export function tokenResponse(scope = "identify guilds guilds.members.read"): FakeResponse {
  return {
    status: 200,
    body: { access_token: ACCESS_TOKEN, token_type: "Bearer", expires_in: 604800, refresh_token: REFRESH_TOKEN, scope },
  };
}

export function meResponse(user = USER): FakeResponse {
  return {
    status: 200,
    body: { ...user, discriminator: "0", global_name: PRIVATE.globalName, avatar: null, mfa_enabled: true, locale: "en-US", flags: 0, public_flags: 0 },
  };
}

export function memberResponse(roleIds: string[]): FakeResponse {
  return {
    status: 200,
    body: { user: { id: USER.id, username: USER.username }, nick: PRIVATE.nick, roles: roleIds, joined_at: "2024-01-01T00:00:00.000Z", deaf: false, mute: false, flags: 0, pending: false },
  };
}

export const notMemberResponse: FakeResponse = { status: 404, body: { message: "Unknown Guild", code: 10004 } };

export function guildsResponse(entries: Array<{ id: string; owner: boolean }>): FakeResponse {
  return {
    status: 200,
    body: entries.map((e) => ({ id: e.id, name: "Some server", icon: null, owner: e.owner, permissions: "0", features: [] })),
  };
}

/** Route fake requests to Discord's token, @me, member and guilds endpoints. */
export function fakeDiscord(opts: {
  token?: FakeResponse | Error;
  me?: FakeResponse | Error;
  member?: FakeResponse | Error;
  guilds?: FakeResponse | Error;
}): FakeFetch {
  return (url, init) => {
    const answer = (a: FakeResponse | Error | undefined) => {
      if (a instanceof Error) throw a;
      if (!a) return { status: 500, body: { message: "not set up in this test" } };
      return a;
    };
    const api = "https://discord.com/api/v10";
    if (url === `${api}/oauth2/token`) return answer(opts.token);
    if (init.headers?.Authorization !== `Bearer ${ACCESS_TOKEN}`) return { status: 401, body: { message: "401: Unauthorized", code: 0 } };
    if (url === `${api}/users/@me`) return answer(opts.me);
    if (url === `${api}/users/@me/guilds/${GUILD_ID}/member`) return answer(opts.member);
    if (url === `${api}/users/@me/guilds`) return answer(opts.guilds);
    throw new Error(`unexpected request to ${url}`);
  };
}
