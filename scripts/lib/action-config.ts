/**
 * Reads and writes the CONFIG block at the top of a ProveIt Lit Action.
 *
 * LIT: the client ID, safe address, encrypted secret (and for Discord, the server
 * registry) are written INTO the action's code, so they become part of its CID.
 * Whoever calls the action cannot swap them, and anyone reading the file sees
 * exactly which values it uses.
 */
const START = "// ---- ProveIt config: public values only, written by scripts/deploy-action.ts ----";
const END = "// ---- end ProveIt config ----";

export interface ActionConfig {
  clientId: string;
  pkpId: string;
  encryptedClientSecret: string;
  redirectUris: string[];
  /** Discord only: the server registry, keyed by guild ID. */
  servers?: Record<string, { name: string; roles: Record<string, string> }>;
}
/** Kept for the Google action and its tests. */
export type GoogleActionConfig = ActionConfig;

// The first keys always come in this order. This keeps the Google action's bytes
// (and therefore its CID) exactly as they were before Discord was added.
const FIXED_ORDER = ["clientId", "pkpId", "encryptedClientSecret", "redirectUris"] as const;

/** Nested objects with keys sorted, so the text never depends on input order. */
function sortedDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as object)
        .sort()
        .map((k) => [k, sortedDeep((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

function blockBounds(source: string): { from: number; to: number } {
  const from = source.indexOf(START);
  const to = source.indexOf(END);
  if (from === -1 || to === -1 || to < from || source.indexOf(START, from + 1) !== -1) {
    throw new Error("action file must contain exactly one ProveIt config block");
  }
  return { from: from + START.length, to };
}

/** Replace the CONFIG block's contents. Output is stable for the same values. */
export function stampConfig(source: string, config: ActionConfig): string {
  const all = config as unknown as Record<string, unknown>;
  const ordered: Record<string, unknown> = {};
  for (const k of FIXED_ORDER) ordered[k] = sortedDeep(all[k]);
  for (const k of Object.keys(all).filter((k) => !(FIXED_ORDER as readonly string[]).includes(k)).sort()) {
    if (all[k] !== undefined) ordered[k] = sortedDeep(all[k]);
  }
  const { from, to } = blockBounds(source);
  return source.slice(0, from) + `\nconst CONFIG = ${JSON.stringify(ordered, null, 2)};\n` + source.slice(to);
}

/** Read the CONFIG values currently written in an action file. */
export function readConfig(source: string): ActionConfig {
  const { from, to } = blockBounds(source);
  const match = source.slice(from, to).match(/const CONFIG = ([\s\S]*);\s*$/);
  if (!match) throw new Error("could not read the CONFIG block");
  return JSON.parse(match[1]) as ActionConfig;
}
