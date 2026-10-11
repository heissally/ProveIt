/**
 * Loads and saves config/lit.json: ProveIt's public Lit settings (no secrets).
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { REPO_ROOT } from "./lit-api.ts";

export interface MethodConfig {
  /** The safe (PKP) wallet address that holds this method's client secret. */
  pkp: string;
  /** OAuth client ID (public). */
  clientId?: string;
  /** Client secret, locked with the PKP. Safe to publish. */
  encryptedClientSecret?: string;
  /** Redirect addresses the action accepts. */
  redirectUris?: string[];
  /** CID and signer address of the deployed action. */
  actionCid?: string;
  signer?: string;
  /** The CID before the last deploy, so we can remind you to retire it. */
  previousActionCid?: string;
}

export interface LitConfig {
  google: MethodConfig;
  discord: MethodConfig;
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const CONFIG_PATH = join(REPO_ROOT, "config/lit.json");

/** Check the config's shape and explain any problem in plain words. */
export function parseLitConfig(raw: unknown): LitConfig {
  const cfg = raw as Partial<Record<"google" | "discord", MethodConfig>> | null;
  const problems: string[] = [];
  for (const method of ["google", "discord"] as const) {
    const pkp = cfg?.[method]?.pkp;
    if (typeof pkp !== "string" || pkp.trim() === "") {
      problems.push(`${method}.pkp is empty: paste the ${method} safe's wallet address (0x...)`);
    } else if (!ADDRESS.test(pkp.trim())) {
      problems.push(`${method}.pkp "${pkp}" is not a wallet address (0x followed by 40 hex characters)`);
    }
  }
  if (problems.length === 0) {
    const google = { ...cfg!.google!, pkp: cfg!.google!.pkp.trim() };
    const discord = { ...cfg!.discord!, pkp: cfg!.discord!.pkp.trim() };
    if (google.pkp.toLowerCase() === discord.pkp.toLowerCase()) {
      problems.push("google.pkp and discord.pkp are the same address: each method needs its own safe");
    } else {
      return { google, discord };
    }
  }
  throw new Error("config/lit.json needs fixing:\n  - " + problems.join("\n  - "));
}

async function readRaw(): Promise<Record<string, unknown>> {
  const text = await readFile(CONFIG_PATH, "utf8");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("config/lit.json is not valid JSON (check for a missing quote or comma)");
  }
}

export async function loadLitConfig(): Promise<LitConfig> {
  return parseLitConfig(await readRaw());
}

/** Merge new values into one method's section and save, keeping everything else. */
export async function updateMethodConfig(method: "google" | "discord", values: Partial<MethodConfig>) {
  const raw = await readRaw();
  raw[method] = { ...(raw[method] as object), ...values };
  await writeFile(CONFIG_PATH, JSON.stringify(raw, null, 2) + "\n");
}
