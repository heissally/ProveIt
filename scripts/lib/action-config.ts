/**
 * Reads and writes the CONFIG block at the top of a ProveIt Lit Action.
 *
 * LIT: the client ID, safe address and encrypted secret are written INTO the
 * action's code, so they become part of its CID. Whoever calls the action cannot
 * swap them, and anyone reading the file sees exactly which values it uses.
 */
const START = "// ---- ProveIt config: public values only, written by scripts/deploy-action.ts ----";
const END = "// ---- end ProveIt config ----";

export interface GoogleActionConfig {
  clientId: string;
  pkpId: string;
  encryptedClientSecret: string;
  redirectUris: string[];
}

function blockBounds(source: string): { from: number; to: number } {
  const from = source.indexOf(START);
  const to = source.indexOf(END);
  if (from === -1 || to === -1 || to < from || source.indexOf(START, from + 1) !== -1) {
    throw new Error("action file must contain exactly one ProveIt config block");
  }
  return { from: from + START.length, to };
}

/** Replace the CONFIG block's contents. Key order is fixed, so output is stable. */
export function stampConfig(source: string, config: GoogleActionConfig): string {
  const ordered = {
    clientId: config.clientId,
    pkpId: config.pkpId,
    encryptedClientSecret: config.encryptedClientSecret,
    redirectUris: [...config.redirectUris],
  };
  const { from, to } = blockBounds(source);
  return source.slice(0, from) + `\nconst CONFIG = ${JSON.stringify(ordered, null, 2)};\n` + source.slice(to);
}

/** Read the CONFIG values currently written in an action file. */
export function readConfig(source: string): GoogleActionConfig {
  const { from, to } = blockBounds(source);
  const match = source.slice(from, to).match(/const CONFIG = ([\s\S]*);\s*$/);
  if (!match) throw new Error("could not read the CONFIG block");
  return JSON.parse(match[1]) as GoogleActionConfig;
}
