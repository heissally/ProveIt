import { isChallengeHash, loadResult, redisFromEnv, resultsReply } from "../../../../server/store";

export const dynamic = "force-dynamic";

const json = (status: number, body: unknown) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * GET /api/results/<challengeHash>: { found: false } while nothing has arrived, or
 * the stored { result, signature }. The asker's page verifies the signature itself;
 * nothing here is trusted. A stored record that can't even be read is reported as
 * { corrupt: true } so the page shows "Result rejected" instead of hiding it.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ hash: string }> }) {
  const { hash } = await ctx.params;
  if (!isChallengeHash(hash)) return json(400, { ok: false, error: "bad_hash" });
  let redis;
  try {
    redis = redisFromEnv();
  } catch {
    return json(500, { ok: false, error: "server_not_configured" });
  }
  try {
    const reply = resultsReply(await loadResult(redis, hash));
    return json(reply.status, reply.body);
  } catch {
    return json(502, { ok: false, error: "store_unavailable" });
  }
}
