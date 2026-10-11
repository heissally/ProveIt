import { ethers } from "ethers";
import { describe, expect, it } from "vitest";
import { canonical } from "../../../shared/canonical.ts";
import { challengeHashFor, type Expected } from "../../../shared/verify.ts";
import { DAMAGED, GRACE_SEC, POLL_MS, fetchOutcome, keepPolling, watchForResult, type Outcome } from "./outcome";

const actionKey = ethers.Wallet.createRandom(); // plays the Google action's own key
const ID = "HDNwosNM8IdTM4FFcrCIvw";
const HASH = challengeHashFor(ID);
const EXPIRES = 1791731726;
const expected: Expected = { signer: actionKey.address, challengeId: ID, method: "google", claim: { domain: "prove-it.com.ng" }, expiresAt: EXPIRES };

async function genuine(overrides: Record<string, unknown> = {}) {
  const result = {
    v: 1, type: "proveit.result.v1", method: "google", status: "not_verified", reason: "no_hd",
    claim: { domain: "prove-it.com.ng" }, challengeHash: HASH, issuedAt: EXPIRES - 600, expiresAt: EXPIRES, ...overrides,
  };
  return { result, signature: await actionKey.signMessage(canonical(result)) };
}

/** A fake /api/results endpoint that answers with `answer` and counts calls. */
function store(answer: () => Response | Promise<Response>) {
  const calls: string[] = [];
  const fetchImpl = (async (url: string | URL | Request) => {
    calls.push(String(url));
    return answer();
  }) as typeof fetch;
  return { calls, fetchImpl };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("fetchOutcome", () => {
  it("accepts a genuine result", async () => {
    const signed = await genuine();
    const { fetchImpl, calls } = store(() => json({ ok: true, ...signed }));
    expect(await fetchOutcome(HASH, expected, fetchImpl)).toEqual({ kind: "valid", signed });
    expect(calls).toEqual([`/api/results/${HASH}`]);
  });

  it("rejects the Milestone 5 tamper: status edited to 'verified' in the store", async () => {
    const signed = await genuine();
    const tampered = { ...signed, result: { ...signed.result, status: "verified" } };
    const { fetchImpl } = store(() => json({ ok: true, ...tampered }));
    const outcome = await fetchOutcome(HASH, expected, fetchImpl);
    expect(outcome?.kind).toBe("rejected");
    expect(outcome?.kind === "rejected" && outcome.problems).toContain("signature is not from the published ProveIt Lit Action");
  });

  it("rejects a record the server reports as damaged (unreadable JSON in the store)", async () => {
    const { fetchImpl } = store(() => json({ ok: true, corrupt: true }));
    expect(await fetchOutcome(HASH, expected, fetchImpl)).toEqual({ kind: "rejected", problems: [DAMAGED] });
  });

  it("rejects an answer that isn't JSON at all", async () => {
    const { fetchImpl } = store(() => new Response("<html>oops</html>", { status: 200 }));
    expect(await fetchOutcome(HASH, expected, fetchImpl)).toEqual({ kind: "rejected", problems: [DAMAGED] });
  });

  it("rejects a stored record with the signature removed", async () => {
    const signed = await genuine();
    const { fetchImpl } = store(() => json({ ok: true, result: signed.result }));
    expect((await fetchOutcome(HASH, expected, fetchImpl))?.kind).toBe("rejected");
  });

  it("treats 'nothing stored yet' (a normal 200 answer) as no result: keep waiting", async () => {
    expect(await fetchOutcome(HASH, expected, store(() => json({ ok: true, found: false })).fetchImpl)).toBeNull();
  });

  it("treats store or network trouble as no result too (try again), never as rejected", async () => {
    expect(await fetchOutcome(HASH, expected, store(() => json({ ok: false }, 502)).fetchImpl)).toBeNull();
    expect(await fetchOutcome(HASH, expected, store(() => json({ ok: false }, 404)).fetchImpl)).toBeNull();
    const down = (async () => {
      throw new Error("offline");
    }) as typeof fetch;
    expect(await fetchOutcome(HASH, expected, down)).toBeNull();
  });
});

describe("keepPolling", () => {
  it("keeps asking until 2 minutes after expiry, then stops", () => {
    expect(keepPolling(EXPIRES, EXPIRES)).toBe(true);
    expect(keepPolling(EXPIRES + GRACE_SEC, EXPIRES)).toBe(true);
    expect(keepPolling(EXPIRES + GRACE_SEC + 1, EXPIRES)).toBe(false);
  });
});

describe("watchForResult", () => {
  /** A hand-cranked timer: tests decide when the next look happens. */
  function manualTimer() {
    const queue: Array<{ fn: () => void; ms: number }> = [];
    return {
      queue,
      setTimer: (fn: () => void, ms: number) => queue.push({ fn, ms }),
      clearTimer: () => queue.splice(0),
      async tick() {
        const next = queue.shift();
        next?.fn();
        await new Promise((r) => setTimeout(r, 0));
      },
    };
  }
  const settle = () => new Promise((r) => setTimeout(r, 0));

  it("looks in the store right away even for a link that expired days ago (the Milestone 5 bug)", async () => {
    const signed = await genuine();
    const tampered = { ...signed, result: { ...signed.result, status: "verified" } };
    const s = store(() => json({ ok: true, ...tampered }));
    const outcomes: Outcome[] = [];
    watchForResult({ hash: HASH, expected, expiresAt: EXPIRES, nowSec: () => EXPIRES + 3 * 86400, onOutcome: (o) => outcomes.push(o), fetchImpl: s.fetchImpl });
    await settle();
    expect(s.calls).toHaveLength(1);
    expect(outcomes[0].kind).toBe("rejected");
  });

  it("after expiry with nothing stored, looks once and then stops", async () => {
    const s = store(() => json({ ok: true, found: false }));
    const t = manualTimer();
    let checked = 0;
    watchForResult({ hash: HASH, expected, expiresAt: EXPIRES, nowSec: () => EXPIRES + 3600, onOutcome: () => undefined, onChecked: () => checked++, fetchImpl: s.fetchImpl, ...t });
    await settle();
    expect(s.calls).toHaveLength(1);
    expect(checked).toBe(1);
    expect(t.queue).toHaveLength(0); // nothing scheduled
  });

  it("before expiry, keeps looking every 3 seconds until a result arrives, then stops", async () => {
    const signed = await genuine();
    let stored = false;
    const s = store(() => (stored ? json({ ok: true, found: true, ...signed }) : json({ ok: true, found: false })));
    const t = manualTimer();
    const outcomes: Outcome[] = [];
    watchForResult({ hash: HASH, expected, expiresAt: EXPIRES, nowSec: () => EXPIRES - 300, onOutcome: (o) => outcomes.push(o), fetchImpl: s.fetchImpl, ...t });
    await settle();
    expect(t.queue[0].ms).toBe(POLL_MS);
    await t.tick();
    expect(s.calls).toHaveLength(2);
    stored = true;
    await t.tick();
    expect(outcomes).toEqual([{ kind: "valid", signed }]);
    expect(t.queue).toHaveLength(0);
  });

  it("stops completely when the page closes", async () => {
    const s = store(() => json({ ok: true, found: false }));
    const t = manualTimer();
    const stop = watchForResult({ hash: HASH, expected, expiresAt: EXPIRES, nowSec: () => EXPIRES - 300, onOutcome: () => undefined, fetchImpl: s.fetchImpl, ...t });
    await settle();
    stop();
    expect(t.queue).toHaveLength(0);
  });
});
