/**
 * Minimal client for Lit's Chipotle REST API, used by our scripts.
 *
 * Plain fetch, no SDK, matching Lit's own examples. Docs:
 * https://developer.litprotocol.com/management/api_direct
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const LIT_API_BASE = process.env.LIT_API_BASE || "https://api.chipotle.litprotocol.com";

/** Absolute path to the repo root, so scripts work from any folder. */
export const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** Read a required setting from .env.local, with a friendly message if missing. */
export function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(
      `\n✗ ${name} is not set.\n` +
        `  Open .env.local in the ProveIt folder and fill in ${name}=...\n` +
        `  (If .env.local doesn't exist yet: cp .env.example .env.local)\n`,
    );
    process.exit(1);
  }
  return value;
}

export interface LitResponse {
  status: number;
  ok: boolean;
  data: unknown;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Call one /core/v1 endpoint. Retries network errors, 429 and 5xx a few times,
 * as Lit's API guide recommends. Never retries 4xx: those are real answers.
 */
export async function litRequest(
  path: string,
  opts: { method?: "GET" | "POST"; apiKey?: string; body?: unknown; query?: Record<string, string> } = {},
): Promise<LitResponse> {
  const url = new URL(`/core/v1/${path}`, LIT_API_BASE);
  for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);

  const headers: Record<string, string> = {
    // LIT: ask Chipotle not to write this request (js_params, output) to its
    // server logs. ProveIt's real calls will carry OAuth codes, so we always send it.
    "X-Privacy-Mode": "true",
  };
  if (opts.apiKey) headers["X-Api-Key"] = opts.apiKey;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";

  const attempts = 4;
  for (let i = 1; ; i++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: opts.method ?? "GET",
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      });
    } catch (err) {
      if (i >= attempts) throw err;
      await wait(1500 * i);
      continue;
    }
    if ((res.status === 429 || res.status >= 500) && i < attempts) {
      await wait(1500 * i);
      continue;
    }
    const text = await res.text();
    let data: unknown = text;
    try {
      data = JSON.parse(text);
    } catch {
      // not JSON; keep the text
    }
    return { status: res.status, ok: res.ok, data };
  }
}

export interface LitActionResult {
  status: number;
  /** true only if the HTTP call succeeded AND the action itself didn't throw */
  ok: boolean;
  response: unknown;
  logs: string;
  error?: unknown;
  ms: number;
}

/**
 * Run a Lit Action by sending its full source code.
 * LIT: Chipotle hashes the code to its CID and only runs it if this API key may
 * execute in a group that contains that CID. There is no IPFS upload step.
 */
export async function runLitAction(
  apiKey: string,
  code: string,
  jsParams: Record<string, unknown> | null,
): Promise<LitActionResult> {
  const t0 = Date.now();
  const res = await litRequest("lit_action", {
    method: "POST",
    apiKey,
    body: { code, js_params: jsParams },
  });
  const ms = Date.now() - t0;
  const env = res.data as { response?: unknown; logs?: string; has_error?: boolean } | null;
  if (res.ok && env && typeof env === "object" && "has_error" in env) {
    return { status: res.status, ok: !env.has_error, response: env.response, logs: env.logs ?? "", ms };
  }
  return { status: res.status, ok: false, response: null, logs: "", error: res.data, ms };
}

/**
 * Ask Lit for the CID of some action code. Free, no API key needed.
 * (Later we will also compute this locally, as Lit recommends for production.)
 */
export async function getActionCid(code: string): Promise<string> {
  const res = await litRequest("get_lit_action_ipfs_id", { method: "POST", body: code });
  if (!res.ok || typeof res.data !== "string" || !res.data.startsWith("Qm")) {
    throw new Error(`Could not get CID from Lit (HTTP ${res.status}): ${JSON.stringify(res.data)}`);
  }
  return res.data;
}

/**
 * Read an action file (path relative to the repo root) as the exact code we send.
 *
 * LIT: the CID is a hash of these exact bytes. We trim leading/trailing whitespace
 * because the Lit Dashboard's Action Runner trims pasted code before hashing it.
 * Trimming here means pasting a file into the Dashboard and clicking
 * "Get Lit Action IPFS CID" gives the same CID that ProveIt publishes, and an
 * editor adding a final newline can never change an action's identity.
 */
export async function readActionSource(relPath: string): Promise<string> {
  return (await readFile(join(REPO_ROOT, relPath), "utf8")).trim();
}

/** One-line description of a failed or refused action call. */
export function describeFailure(r: LitActionResult): string {
  const why = r.error !== undefined ? JSON.stringify(r.error) : r.logs.slice(0, 300);
  return `HTTP ${r.status}: ${String(why).slice(0, 300)}`;
}

/** The three actions used in Milestone 1, in the order you register them. */
export const M1_ACTIONS = [
  { name: "proveit-m1-probe-runtime", path: "lit-actions/probes/probe-runtime.js" },
  { name: "proveit-m1-probe-identity", path: "lit-actions/probes/probe-identity.js" },
  { name: "proveit-signer-lookup", path: "lit-actions/proveit-signer-lookup.js" },
] as const;

/** The two action files used in Milestone 2. */
export const M2_ACTIONS = [
  { name: "proveit-encrypt-secret", path: "lit-actions/proveit-encrypt-secret.js" },
  { name: "proveit-m2-probe-vault", path: "lit-actions/probes/probe-vault.js" },
] as const;

export const VAULT_TWIN_NAME = "proveit-m2-probe-vault-twin";

/**
 * The "twin" of the vault probe: identical logic plus one comment line, so it has
 * a different CID. Milestone 2 lists the twin for the Discord safe only, to show
 * that a PKP opens for exact fingerprints, not for "code that looks the same".
 */
export function vaultTwinSource(vaultProbeCode: string): string {
  return vaultProbeCode + "\n// Twin copy: same logic as probe-vault.js, different CID. Milestone 2 test.";
}
