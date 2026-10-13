/**
 * Public ProveIt settings, generated from the deployed Lit Actions by `npm run web:sync`.
 *
 * LIT: `signer` is each action's own address, derived from its CID. The result page
 * accepts a result only if its signature recovers to exactly this address. Anyone
 * can re-derive it with lit-actions/proveit-signer-lookup.js (see README).
 */
import generated from "../generated/public-config.json";
import type { RoleLabel } from "../../../shared/discord.ts";

export interface MethodSettings {
  clientId: string;
  actionCid: string;
  signer: string;
}
export interface ServerSettings {
  guildId: string;
  name: string;
  officialSource: string;
  /** Labels this server's registry defines. */
  roles: RoleLabel[];
  /** false = a private test server: checkable, but only offered on /new?test. */
  listed: boolean;
}

export const PROVEIT = generated as unknown as {
  google: MethodSettings;
  discord: MethodSettings;
  servers: ServerSettings[];
};

export function findServer(guildId: string): ServerSettings | undefined {
  return PROVEIT.servers.find((s) => s.guildId === guildId);
}

/** The servers /new offers: listed ones, plus hidden test servers when the page is opened with ?test. */
export function offeredServers(servers: ServerSettings[], search: string): ServerSettings[] {
  const showHidden = new URLSearchParams(search).has("test");
  return servers.filter((s) => s.listed !== false || showHidden);
}

/** Where people ask for their project's Discord server to be added. */
export const ADD_SERVER_HREF = "mailto:salamiademola73@gmail.com?subject=" + encodeURIComponent("Please add our Discord server to ProveIt");
