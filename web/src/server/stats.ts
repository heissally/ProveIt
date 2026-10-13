/**
 * Private usage counts for the maintainer: per day and per method, how many
 * ProveIt links were created and how many checks ended Verified or Could not
 * verify. Plain numbers only, never IDs, domains, usernames or IP addresses.
 * Counters delete themselves after about 13 months.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { redis, type RedisEnv } from "./store";

export const STATS_TTL_SEC = 400 * 24 * 60 * 60;
export const METHODS = ["google", "discord"] as const;
export const EVENTS = ["link_created", "verified", "not_verified"] as const;
export type Method = (typeof METHODS)[number];
export type StatsEvent = (typeof EVENTS)[number];

const day = (nowSec: number) => new Date(nowSec * 1000).toISOString().slice(0, 10);
export const statsKey = (date: string, event: StatsEvent, method: Method) => `proveit:stats:${date}:${event}:${method}`;

export function isMethod(v: unknown): v is Method {
  return typeof v === "string" && (METHODS as readonly string[]).includes(v);
}

/** Add one to today's counter for this event and method. */
export async function recordEvent(env: RedisEnv, event: StatsEvent, method: Method, nowSec: number, fetchImpl: typeof fetch = fetch) {
  const key = statsKey(day(nowSec), event, method);
  await redis(env, [["INCR", key], ["EXPIRE", key, STATS_TTL_SEC]], fetchImpl);
}

export interface DayStats {
  date: string;
  counts: Record<StatsEvent, Record<Method, number>>;
}

/** The last `days` days, newest first, plus totals. */
export async function readStats(env: RedisEnv, days: number, nowSec: number, fetchImpl: typeof fetch = fetch) {
  const dates = Array.from({ length: days }, (_, i) => day(nowSec - i * 86400));
  const keys = dates.flatMap((d) => EVENTS.flatMap((e) => METHODS.map((m) => statsKey(d, e, m))));
  const [values] = await redis(env, [["MGET", ...keys]], fetchImpl);
  const list = (Array.isArray(values) ? values : []) as Array<string | null>;
  let i = 0;
  const empty = () => Object.fromEntries(EVENTS.map((e) => [e, Object.fromEntries(METHODS.map((m) => [m, 0]))])) as DayStats["counts"];
  const totals = empty();
  const perDay: DayStats[] = dates.map((date) => {
    const counts = empty();
    for (const e of EVENTS) {
      for (const m of METHODS) {
        const n = Number(list[i++] ?? 0) || 0;
        counts[e][m] = n;
        totals[e][m] += n;
      }
    }
    return { date, counts };
  });
  return { days, totals, perDay };
}

/**
 * Is this the right stats password? Compares fixed-length hashes in constant
 * time. Returns false when no password is configured, so the page stays shut.
 */
export function checkStatsToken(given: string | null | undefined, configured: string | undefined): boolean {
  if (!configured || configured.length < 16 || !given) return false;
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(configured).digest();
  return timingSafeEqual(a, b);
}
