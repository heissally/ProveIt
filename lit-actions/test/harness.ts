/**
 * Runs a ProveIt Lit Action on your own computer, for tests.
 *
 * The action file is executed exactly as written, in a sealed JavaScript sandbox
 * (node:vm), with stand-ins for what Lit's TEE normally provides:
 *   - Lit.Actions.Decrypt / getLitActionPrivateKey  → fake safe + a fixed test key
 *   - fetch                                         → recorded fake Google/RDAP answers
 *   - Date                                          → a fixed "now"
 *   - ethers v5, atob, AbortSignal                  → the real ones
 * Everything the action does is recorded, so tests can check what it sent and
 * that nothing secret leaked into its output or logs.
 */
import vm from "node:vm";
import { ethers } from "ethers";

/** Plays the part of the action's own Lit key in tests. */
export const TEST_ACTION_KEY = new ethers.Wallet("0x" + "42".repeat(32));

export interface FakeResponse {
  status: number;
  body: unknown;
}
export type FakeFetch = (url: string, init: RequestInitLike) => FakeResponse | Promise<FakeResponse>;
export interface RequestInitLike {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface RunOptions {
  nowSec: number;
  fetch?: FakeFetch;
  /** Return the plaintext, or throw to simulate Lit refusing to decrypt. */
  decrypt?: (args: { pkpId: string; ciphertext: string }) => string;
}

export interface RunRecord {
  output: any;
  fetches: Array<{ url: string; init: RequestInitLike }>;
  decrypts: Array<{ pkpId: string; ciphertext: string }>;
  keyRequests: number;
  logs: string[];
}

function sandbox(opts: RunOptions, record: RunRecord) {
  const nowMs = opts.nowSec * 1000;
  class FixedDate extends Date {
    constructor(...args: any[]) {
      if (args.length === 0) super(nowMs);
      else super(...(args as [number]));
    }
    static now() {
      return nowMs;
    }
  }
  const fakeFetch = async (url: string, init: RequestInitLike = {}) => {
    record.fetches.push({ url, init });
    if (!opts.fetch) throw new Error("network not available in this test");
    const res = await opts.fetch(url, init);
    const text = typeof res.body === "string" ? res.body : JSON.stringify(res.body);
    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      json: async () => JSON.parse(text),
      text: async () => text,
    };
  };
  const log = (...a: unknown[]) => record.logs.push(a.map(String).join(" "));
  const Lit = {
    Actions: {
      Decrypt: async (args: { pkpId: string; ciphertext: string }) => {
        record.decrypts.push({ ...args });
        if (!opts.decrypt) throw new Error("Decrypt not permitted in this test");
        return opts.decrypt(args);
      },
      getLitActionPrivateKey: async () => {
        record.keyRequests++;
        return TEST_ACTION_KEY.privateKey;
      },
    },
  };
  return vm.createContext({
    Lit,
    LitActions: Lit.Actions,
    ethers,
    fetch: fakeFetch,
    Date: FixedDate,
    atob,
    AbortSignal,
    console: { log, info: log, warn: log, error: log, debug: log },
  });
}

/** Execute `main(params)` from an action's source, the way Lit would. */
export async function runAction(source: string, params: unknown, opts: RunOptions): Promise<RunRecord> {
  const record: RunRecord = { output: undefined, fetches: [], decrypts: [], keyRequests: 0, logs: [] };
  const context = sandbox(opts, record);
  vm.runInContext(source, context);
  // Params go in as JSON and the result comes out as JSON, just like Lit's API.
  context.__params = JSON.stringify(params);
  const raw = await vm.runInContext("main(JSON.parse(__params))", context);
  record.output = JSON.parse(JSON.stringify(raw));
  return record;
}

/** Call one of the action's own top-level helpers (e.g. canonical) on a value, inside its sandbox. */
export function callActionFunction(source: string, name: string, value: unknown): unknown {
  if (!/^[A-Za-z_$][\w$]*$/.test(name)) throw new Error("bad function name");
  const context = sandbox({ nowSec: 0 }, { output: undefined, fetches: [], decrypts: [], keyRequests: 0, logs: [] });
  vm.runInContext(source, context);
  context.__value = JSON.stringify(value);
  return JSON.parse(JSON.stringify(vm.runInContext(`${name}(JSON.parse(__value))`, context)));
}

/** Call the action's own canonical() function on a value, inside its sandbox. */
export function actionCanonical(source: string, value: unknown): string {
  return callActionFunction(source, "canonical", value) as string;
}
