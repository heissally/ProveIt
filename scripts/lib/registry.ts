/**
 * Loads and checks registry/servers.json: the official Discord servers ProveIt
 * can check, and which role IDs count as Admin or Mod.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { REPO_ROOT } from "./lit-api.ts";

export const ROLE_LABELS = ["Admin", "Mod"] as const;
const SNOWFLAKE = /^\d{17,20}$/;

export interface RegistryServer {
  guildId: string;
  name: string;
  /** Where people can confirm this is the real server (official website or X). */
  officialSource: string;
  /** role ID → label */
  roles: Record<string, string>;
  /**
   * false = still checkable, but left out of the website's server list (for a private test
   * server; it appears only on /new?test). Website-only: it does not change the action's CID.
   */
  listed?: boolean;
}

/** Check every entry and explain any problem in plain words. */
export function parseRegistry(raw: unknown): RegistryServer[] {
  const servers = (raw as { servers?: unknown })?.servers;
  if (!Array.isArray(servers) || servers.length === 0) {
    throw new Error("registry/servers.json needs a \"servers\" list with at least one server");
  }
  const problems: string[] = [];
  const seen = new Set<string>();
  servers.forEach((s: Partial<RegistryServer>, i) => {
    const where = `server ${i + 1}${s?.name ? ` ("${s.name}")` : ""}`;
    if (typeof s?.guildId !== "string" || !SNOWFLAKE.test(s.guildId)) {
      problems.push(`${where}: guildId must be the server ID (17–20 digits)`);
    } else if (seen.has(s.guildId)) {
      problems.push(`${where}: guildId ${s.guildId} is listed twice`);
    } else seen.add(s.guildId);
    if (typeof s?.name !== "string" || s.name.trim() === "" || s.name.length > 100) {
      problems.push(`${where}: name must be 1–100 characters`);
    }
    // Empty is allowed for private test servers; see missingOfficialSource().
    if (typeof s?.officialSource !== "string" || (s.officialSource !== "" && !/^https:\/\/\S+$/.test(s.officialSource))) {
      problems.push(`${where}: officialSource must be an https:// link to the project's official site or X (or "" for a test server)`);
    }
    if (s?.listed !== undefined && typeof s.listed !== "boolean") {
      problems.push(`${where}: listed must be true or false (or left out, which means true)`);
    }
    const roles = s?.roles;
    if (!roles || typeof roles !== "object" || Array.isArray(roles)) {
      problems.push(`${where}: roles must be an object of role ID → label`);
      return;
    }
    for (const [id, label] of Object.entries(roles)) {
      if (!SNOWFLAKE.test(id)) problems.push(`${where}: role ID "${id}" must be 17–20 digits`);
      if (!(ROLE_LABELS as readonly string[]).includes(label as string)) {
        problems.push(`${where}: role ${id} has label "${label}", but it must be one of ${ROLE_LABELS.join(", ")}`);
      }
      if (id === s.guildId) {
        problems.push(`${where}: role ${id} is the @everyone role (same as the server ID), which everyone has`);
      }
    }
  });
  if (problems.length) throw new Error("registry/servers.json needs fixing:\n  - " + problems.join("\n  - "));
  return servers as RegistryServer[];
}

/** Shown in the website's server list unless marked "listed": false. */
export function isListed(server: RegistryServer): boolean {
  return server.listed !== false;
}

/** Listed servers with no official source yet: fine for testing, not for a public release. */
export function missingOfficialSource(servers: RegistryServer[]): string[] {
  return servers.filter((s) => isListed(s) && s.officialSource === "").map((s) => s.name);
}

/** The registry in the shape the Discord action carries in its CONFIG. */
export function registryForAction(servers: RegistryServer[]) {
  return Object.fromEntries(servers.map((s) => [s.guildId, { name: s.name.trim(), roles: { ...s.roles } }]));
}

export async function loadRegistry(): Promise<RegistryServer[]> {
  const text = await readFile(join(REPO_ROOT, "registry/servers.json"), "utf8");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("registry/servers.json is not valid JSON (check for a missing quote or comma)");
  }
  return parseRegistry(raw);
}
