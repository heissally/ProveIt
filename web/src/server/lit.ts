/**
 * Runs a ProveIt Lit Action on Lit's Chipotle network.
 *
 * LIT: we send the action's full source code. Chipotle hashes it to its CID and
 * runs it inside the TEE only if our usage key may execute in a group containing
 * that CID. The usage key can't run any other code and can't change any settings.
 */
export const LIT_ACTION_URL = "https://api.chipotle.litprotocol.com/core/v1/lit_action";

export interface LitRun {
  /** true only if Lit ran the action and the action itself didn't crash */
  ok: boolean;
  status: number;
  response: unknown;
}

/** No automatic retry: a sign-in code works once, so a second run would always fail. */
export async function runLitAction(
  usageKey: string,
  code: string,
  jsParams: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<LitRun> {
  let res: Response;
  try {
    res = await fetchImpl(LIT_ACTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": usageKey,
        // LIT: keep js_params (they carry the one-time sign-in code) out of Lit's server logs.
        "X-Privacy-Mode": "true",
      },
      body: JSON.stringify({ code, js_params: jsParams }),
      cache: "no-store",
    });
  } catch {
    return { ok: false, status: 0, response: null };
  }
  const body = (await res.json().catch(() => null)) as { response?: unknown; has_error?: boolean } | null;
  if (!res.ok || !body || body.has_error) return { ok: false, status: res.status, response: null };
  return { ok: true, status: res.status, response: body.response };
}
