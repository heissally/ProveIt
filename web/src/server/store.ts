/**
 * Results store and rate limits, on Upstash Redis via its REST API (plain fetch).
 *
 * The store is an UNTRUSTED cache: it holds { result, signature } under the
 * challenge hash for 30 days, and every reader checks the signature itself. If
 * someone edits a stored result, the asker's page rejects it.
 */
import { createHash } from "node:crypto";

export const RESULT_TTL_SEC = 30 * 24 * 60 * 60;
const HASH = /^0x[0-9a-f]{64}$/;

export interface RedisEnv {
  url: string;
  token: string;
}
type Fetch = typeof fetch;

export function redisFromEnv(env: Record<string, string | undefined> = process.env): RedisEnv {
  const url = env.UPSTASH_REDIS_REST_URL?.trim();
  const token = env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) throw new Error("UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not set");
  return { url: url.replace(/\/$/, ""), token };
}

/** Run several Redis commands in one request. Throws on any error. */
export async function redis(env: RedisEnv, commands: (string | number)[][], fetchImpl: Fetch = fetch): Promise<unknown[]> {
  const res = await fetchImpl(`${env.url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands.map((c) => c.map(String))),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Upstash answered HTTP ${res.status}`);
  const out = (await res.json()) as Array<{ result?: unknown; error?: string }>;
  const failed = out.find((r) => r.error);
  if (failed) throw new Error(`Upstash error: ${failed.error}`);
  return out.map((r) => r.result);
}

export const resultKey = (challengeHash: string) => `proveit:result:${challengeHash.toLowerCase()}`;
export const isChallengeHash = (h: string) => HASH.test(h);

export async function saveResult(env: RedisEnv, challengeHash: string, signed: { result: unknown; signature: string }, fetchImpl: Fetch = fetch) {
  if (!isChallengeHash(challengeHash)) throw new Error("bad challenge hash");
  const value = JSON.stringify({ result: signed.result, signature: signed.signature });
  await redis(env, [["SET", resultKey(challengeHash), value, "EX", RESULT_TTL_SEC]], fetchImpl);
}

export type Stored =
  | { status: "missing" }
  | { status: "found"; signed: { result: unknown; signature: unknown } }
  /** Something is stored but it can't be read as { result, signature }. Never hide this: it means tampering or damage. */
  | { status: "damaged" };

export async function loadResult(env: RedisEnv, challengeHash: string, fetchImpl: Fetch = fetch): Promise<Stored> {
  if (!isChallengeHash(challengeHash)) return { status: "missing" };
  const [value] = await redis(env, [["GET", resultKey(challengeHash)]], fetchImpl);
  if (value === null || value === undefined) return { status: "missing" };
  try {
    const parsed = JSON.parse(String(value));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { status: "damaged" };
    return { status: "found", signed: { result: parsed.result, signature: parsed.signature } };
  } catch {
    return { status: "damaged" };
  }
}

/**
 * The answer GET /api/results/<hash> gives. "Nothing yet" is a normal answer
 * (200, found: false), not an error, because the asker's page asks every few seconds.
 */
export function resultsReply(stored: Stored): { status: number; body: Record<string, unknown> } {
  if (stored.status === "missing") return { status: 200, body: { ok: true, found: false } };
  if (stored.status === "damaged") return { status: 200, body: { ok: true, found: true, corrupt: true } };
  return { status: 200, body: { ok: true, found: true, ...stored.signed } };
}

export interface Limits {
  perIpPer10Min: number;
  perDay: number;
}

export function limitsFromEnv(env: Record<string, string | undefined> = process.env): Limits {
  const n = (v: string | undefined, d: number) => (v && Number.isSafeInteger(Number(v)) && Number(v) > 0 ? Number(v) : d);
  return { perIpPer10Min: n(env.PROVEIT_MAX_CHECKS_PER_IP_10MIN, 10), perDay: n(env.PROVEIT_MAX_CHECKS_PER_DAY, 300) };
}

/**
 * Count one check against the limits. Each check costs Lit credits, so this stops
 * anyone burning them. IP addresses are never stored: only a salted hash, inside a
 * counter that deletes itself after 10 minutes.
 */
export async function takeRateLimit(
  env: RedisEnv,
  ip: string,
  limits: Limits,
  nowSec: number,
  fetchImpl: Fetch = fetch,
): Promise<{ ok: true } | { ok: false; reason: "ip" | "daily" }> {
  const window = Math.floor(nowSec / 600);
  const day = new Date(nowSec * 1000).toISOString().slice(0, 10);
  const ipHash = createHash("sha256").update(`proveit-rl|${day}|${ip}`).digest("hex").slice(0, 32);
  const ipKey = `proveit:rl:ip:${ipHash}:${window}`;
  const dayKey = `proveit:rl:day:${day}`;
  const [ipCount, , dayCount] = await redis(
    env,
    [["INCR", ipKey], ["EXPIRE", ipKey, 600], ["INCR", dayKey], ["EXPIRE", dayKey, 2 * 86400]],
    fetchImpl,
  );
  if (Number(ipCount) > limits.perIpPer10Min) return { ok: false, reason: "ip" };
  if (Number(dayCount) > limits.perDay) return { ok: false, reason: "daily" };
  return { ok: true };
}
