/**
 * POST /api/check: the verifier's browser hands over the one-time sign-in code;
 * this runs the matching ProveIt Lit Action and stores the signed result.
 *
 * This server is NOT trusted. It holds the usage key only so browsers can't burn
 * our Lit credits, and it rate-limits. It can't create or alter a valid result:
 * only the Lit Action's own key can sign, and the asker's page checks the
 * signature itself. Checking it here too just keeps junk out of the store.
 */
import { ethers } from "ethers";
import { canonical } from "../../../shared/canonical.ts";
import { challengeHashFor } from "../../../shared/verify.ts";
import { runLitAction } from "./lit";
import { saveResult, takeRateLimit, type Limits, type RedisEnv } from "./store";

export interface CheckDeps {
  usageKey: string;
  redis: RedisEnv;
  limits: Limits;
  /** The deployed action code and published signer for each method. */
  actions: Record<"google" | "discord", { code: string; signer: string }>;
  nowSec: () => number;
  fetch?: typeof fetch;
}

export interface Reply {
  status: number;
  body: Record<string, unknown>;
}

const str = (v: unknown, max: number) => typeof v === "string" && v.length > 0 && v.length <= max;

/** Only these fields are ever forwarded to the Lit Action. */
function pickParams(body: Record<string, unknown>): Record<string, unknown> | null {
  const common = ["code", "codeVerifier", "redirectUri", "challengeId"] as const;
  if (!common.every((k) => str(body[k], 2048)) || !Number.isSafeInteger(body.expiresAt)) return null;
  const base: Record<string, unknown> = Object.fromEntries(common.map((k) => [k, body[k]]));
  base.expiresAt = body.expiresAt;
  if (body.method === "google") return str(body.domain, 253) ? { ...base, domain: body.domain } : null;
  if (body.method === "discord") {
    const roles = body.roles;
    if (!str(body.guildId, 20) || !Array.isArray(roles) || roles.length === 0 || roles.length > 5) return null;
    if (!roles.every((r) => str(r, 10))) return null;
    return { ...base, guildId: body.guildId, roles };
  }
  return null;
}

export async function handleCheck(body: unknown, ip: string, deps: CheckDeps): Promise<Reply> {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const params = pickParams(b);
  if (!params) return { status: 400, body: { ok: false, error: "bad_request" } };
  const method = b.method as "google" | "discord";

  const limit = await takeRateLimit(deps.redis, ip, deps.limits, deps.nowSec(), deps.fetch);
  if (!limit.ok) return { status: 429, body: { ok: false, error: "rate_limited", scope: limit.reason } };

  const action = deps.actions[method];
  const run = await runLitAction(deps.usageKey, action.code, params, deps.fetch);
  if (!run.ok) return { status: 502, body: { ok: false, error: "lit_unavailable", litStatus: run.status } };

  const out = run.response as { ok?: boolean; error?: string; result?: Record<string, unknown>; signature?: string } | null;
  if (!out || out.ok !== true) {
    const error = out?.error === "invalid_input" ? "invalid_input" : out?.error === "config_error" ? "config_error" : "unexpected";
    return { status: error === "invalid_input" ? 400 : 500, body: { ok: false, error } };
  }

  // Sanity check before storing (the asker's page repeats this independently).
  // LIT: a genuine result is signed by the action's CID-derived key (its published signer).
  const challengeHash = challengeHashFor(String(params.challengeId));
  let genuine = false;
  try {
    const recovered = ethers.utils.verifyMessage(canonical(out.result), String(out.signature));
    genuine =
      recovered.toLowerCase() === action.signer.toLowerCase() &&
      out.result?.challengeHash === challengeHash &&
      out.result?.method === method;
  } catch {
    genuine = false;
  }
  if (!genuine) return { status: 502, body: { ok: false, error: "unexpected" } };

  const signed = { result: out.result, signature: String(out.signature) };
  let stored = true;
  try {
    await saveResult(deps.redis, challengeHash, signed, deps.fetch);
  } catch {
    stored = false; // the verifier still sees their result; the asker would not
  }
  return { status: 200, body: { ok: true, ...signed, stored } };
}
