import { describe, expect, it } from "vitest";
import { REDIS, fakeUpstash } from "./fake-services";
import { RESULT_TTL_SEC, limitsFromEnv, loadResult, redisFromEnv, resultKey, resultsReply, saveResult, takeRateLimit } from "./store";

const HASH = "0x" + "ab".repeat(32);

describe("results store", () => {
  it("saves under the challenge hash for 30 days, and reads it back", async () => {
    const up = fakeUpstash();
    await saveResult(REDIS, HASH, { result: { v: 1 }, signature: "0xsig" }, up.fetch as typeof fetch);
    expect(up.ttl.get(resultKey(HASH))).toBe(RESULT_TTL_SEC);
    expect(await loadResult(REDIS, HASH, up.fetch as typeof fetch)).toEqual({ status: "found", signed: { result: { v: 1 }, signature: "0xsig" } });
  });

  it("reports a record edited into unreadable JSON as damaged, never as missing", async () => {
    const up = fakeUpstash();
    up.data.set(resultKey(HASH), '{"result": {"status": "verified"'); // a quote and braces deleted by hand
    expect(await loadResult(REDIS, HASH, up.fetch as typeof fetch)).toEqual({ status: "damaged" });
  });

  it("reports a record that isn't a { result, signature } object as damaged", async () => {
    const up = fakeUpstash();
    for (const junk of ["42", '"just text"', "[1,2]", "null"]) {
      up.data.set(resultKey(HASH), junk);
      expect(await loadResult(REDIS, HASH, up.fetch as typeof fetch)).toEqual({ status: "damaged" });
    }
  });

  it("stores only the result and its signature, nothing else", async () => {
    const up = fakeUpstash();
    await saveResult(REDIS, HASH, { result: { v: 1 }, signature: "0xsig", extra: "x" } as never, up.fetch as typeof fetch);
    expect(JSON.parse(up.data.get(resultKey(HASH))!)).toEqual({ result: { v: 1 }, signature: "0xsig" });
  });

  it("says 'missing' for an unknown or malformed hash", async () => {
    const up = fakeUpstash();
    expect(await loadResult(REDIS, HASH, up.fetch as typeof fetch)).toEqual({ status: "missing" });
    expect(await loadResult(REDIS, "../../etc", up.fetch as typeof fetch)).toEqual({ status: "missing" });
    await expect(saveResult(REDIS, "nope", { result: {}, signature: "" }, up.fetch as typeof fetch)).rejects.toThrow();
  });

  it("throws if Upstash rejects the token", async () => {
    const up = fakeUpstash();
    await expect(loadResult({ ...REDIS, token: "wrong" }, HASH, up.fetch as typeof fetch)).rejects.toThrow(/401/);
  });
});

describe("GET /api/results reply", () => {
  it("answers 'nothing yet' as a normal 200, not a 404 error", () => {
    expect(resultsReply({ status: "missing" })).toEqual({ status: 200, body: { ok: true, found: false } });
  });

  it("passes on a found result as it is stored", () => {
    expect(resultsReply({ status: "found", signed: { result: { v: 1 }, signature: "0xsig" } })).toEqual({
      status: 200,
      body: { ok: true, found: true, result: { v: 1 }, signature: "0xsig" },
    });
  });

  it("reports a damaged record so the page can reject it", () => {
    expect(resultsReply({ status: "damaged" })).toEqual({ status: 200, body: { ok: true, found: true, corrupt: true } });
  });
});

describe("rate limits", () => {
  const limits = { perIpPer10Min: 3, perDay: 5 };

  it("allows a few checks per IP, then refuses", async () => {
    const up = fakeUpstash();
    const take = () => takeRateLimit(REDIS, "1.2.3.4", limits, 1791110400, up.fetch as typeof fetch);
    expect((await take()).ok).toBe(true);
    expect((await take()).ok).toBe(true);
    expect((await take()).ok).toBe(true);
    expect(await take()).toEqual({ ok: false, reason: "ip" });
  });

  it("caps the whole site per day, across IPs", async () => {
    const up = fakeUpstash();
    for (let i = 0; i < 5; i++) expect((await takeRateLimit(REDIS, `10.0.0.${i}`, limits, 1791110400, up.fetch as typeof fetch)).ok).toBe(true);
    expect(await takeRateLimit(REDIS, "10.0.0.99", limits, 1791110400, up.fetch as typeof fetch)).toEqual({ ok: false, reason: "daily" });
  });

  it("never stores the IP address itself", async () => {
    const up = fakeUpstash();
    await takeRateLimit(REDIS, "203.0.113.77", limits, 1791110400, up.fetch as typeof fetch);
    expect(JSON.stringify(up.calls)).not.toContain("203.0.113.77");
    expect([...up.ttl.values()].every((t) => t > 0)).toBe(true); // every counter expires
  });
});

describe("settings", () => {
  it("reads Upstash settings and explains when they're missing", () => {
    expect(redisFromEnv({ UPSTASH_REDIS_REST_URL: "https://x.upstash.io/", UPSTASH_REDIS_REST_TOKEN: "t" })).toEqual({ url: "https://x.upstash.io", token: "t" });
    expect(() => redisFromEnv({})).toThrow(/UPSTASH_REDIS_REST_URL/);
  });

  it("uses default limits unless valid numbers are given", () => {
    expect(limitsFromEnv({})).toEqual({ perIpPer10Min: 10, perDay: 300 });
    expect(limitsFromEnv({ PROVEIT_MAX_CHECKS_PER_IP_10MIN: "4", PROVEIT_MAX_CHECKS_PER_DAY: "abc" })).toEqual({ perIpPer10Min: 4, perDay: 300 });
  });
});
