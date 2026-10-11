/**
 * How the asker's page finds and judges a result.
 *
 * Every stored result is verified on the asker's device (shared/verify.ts). Anything
 * that fails, including a record too damaged to read, becomes "rejected" and is
 * shown loudly. It is never treated as "no result".
 */
import { verifyResult, type Expected, type SignedResult } from "../../../shared/verify.ts";

export type Outcome = { kind: "valid"; signed: SignedResult } | { kind: "rejected"; problems: string[] };

export const POLL_MS = 3000;
/** Keep asking a little after expiry: a signed "expired" result may still arrive. */
export const GRACE_SEC = 120;
export const DAMAGED = "the stored result is damaged or was edited so it can't be read";

/** Ask the store once. null = nothing stored yet, or the store couldn't be reached. */
export async function fetchOutcome(hash: string, expected: Expected, fetchImpl: typeof fetch = fetch): Promise<Outcome | null> {
  let res: Response;
  try {
    res = await fetchImpl(`/api/results/${hash}`, { cache: "no-store" });
  } catch {
    return null;
  }
  if (res.status !== 200) return null; // the store is having trouble: just try again
  const body = (await res.json().catch(() => null)) as { found?: boolean; corrupt?: boolean; result?: unknown; signature?: unknown } | null;
  if (body && body.found === false) return null; // nothing has arrived yet
  if (!body || body.corrupt) return { kind: "rejected", problems: [DAMAGED] };
  const signed = { result: body.result, signature: body.signature } as SignedResult;
  const v = verifyResult(signed, expected);
  return v.valid ? { kind: "valid", signed } : { kind: "rejected", problems: v.problems };
}

/** Whether a result could still arrive, so it's worth asking again in a few seconds. */
export const keepPolling = (nowSec: number, expiresAt: number) => nowSec <= expiresAt + GRACE_SEC;

/**
 * Check the store right away, even if the link has long expired (results are kept
 * 30 days), then keep checking every few seconds while a result could still
 * arrive. Calls onChecked after each look and onOutcome once a result is found.
 * Returns a function that stops watching.
 */
export function watchForResult(opts: {
  hash: string;
  expected: Expected;
  expiresAt: number;
  nowSec: () => number;
  onOutcome: (o: Outcome) => void;
  onChecked?: () => void;
  fetchImpl?: typeof fetch;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (t: unknown) => void;
}): () => void {
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer ?? ((t) => clearTimeout(t as ReturnType<typeof setTimeout>));
  let stopped = false;
  let timer: unknown;
  async function look() {
    const outcome = await fetchOutcome(opts.hash, opts.expected, opts.fetchImpl);
    if (stopped) return;
    opts.onChecked?.();
    if (outcome) return opts.onOutcome(outcome);
    if (keepPolling(opts.nowSec(), opts.expiresAt)) timer = setTimer(look, POLL_MS);
  }
  void look();
  return () => {
    stopped = true;
    clearTimer(timer);
  };
}
