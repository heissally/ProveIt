import actionCode from "../../../generated/action-code.json";
import { PROVEIT } from "../../../lib/config";
import { handleCheck } from "../../../server/check";
import { limitsFromEnv, redisFromEnv } from "../../../server/store";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 8 * 1024;

function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip") || "unknown";
}

const json = (status: number, body: unknown) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  const usageKey = process.env.LIT_USAGE_KEY?.trim();
  let redis;
  try {
    redis = redisFromEnv();
  } catch {
    return json(500, { ok: false, error: "server_not_configured" });
  }
  if (!usageKey) return json(500, { ok: false, error: "server_not_configured" });

  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) return json(413, { ok: false, error: "too_large" });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json(400, { ok: false, error: "bad_request" });
  }

  const reply = await handleCheck(body, clientIp(req), {
    usageKey,
    redis,
    limits: limitsFromEnv(),
    actions: {
      google: { code: actionCode.google, signer: PROVEIT.google.signer },
      discord: { code: actionCode.discord, signer: PROVEIT.discord.signer },
    },
    nowSec: () => Math.floor(Date.now() / 1000),
  });
  return json(reply.status, reply.body);
}
