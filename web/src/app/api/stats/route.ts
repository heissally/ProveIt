import { isMethod, readStats, recordEvent, checkStatsToken } from "../../../server/stats";
import { redisFromEnv } from "../../../server/store";

export const dynamic = "force-dynamic";

const json = (status: number, body: unknown) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });

/**
 * POST /api/stats  { event: "link_created", method }
 * Counts one new ProveIt link. Nothing else is accepted or stored.
 * (Verified / Could not verify are counted by /api/check itself.)
 */
export async function POST(req: Request) {
  const text = await req.text();
  if (text.length > 200) return json(413, { ok: false });
  let body: { event?: unknown; method?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return json(400, { ok: false });
  }
  if (body.event !== "link_created" || !isMethod(body.method)) return json(400, { ok: false });
  try {
    await recordEvent(redisFromEnv(), "link_created", body.method, Math.floor(Date.now() / 1000));
  } catch {
    return json(503, { ok: false });
  }
  return json(200, { ok: true });
}

/**
 * GET /api/stats with "Authorization: Bearer <STATS_PASSWORD>"
 * The last 30 days of counts, for the maintainer's /stats page.
 */
export async function GET(req: Request) {
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!checkStatsToken(given, process.env.STATS_PASSWORD?.trim())) return json(401, { ok: false, error: "wrong_password" });
  try {
    return json(200, { ok: true, ...(await readStats(redisFromEnv(), 30, Math.floor(Date.now() / 1000))) });
  } catch {
    return json(503, { ok: false, error: "store_unavailable" });
  }
}
