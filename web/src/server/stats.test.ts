import { describe, expect, it } from "vitest";
import { REDIS, fakeUpstash } from "./fake-services";
import { STATS_TTL_SEC, checkStatsToken, readStats, recordEvent, statsKey } from "./stats";

const NOW = 1791110400; // 2026-10-04
const DAY = 86400;

describe("private usage counts", () => {
  it("counts per day, per event and per method, and every counter expires", async () => {
    const up = fakeUpstash();
    const f = up.fetch as typeof fetch;
    await recordEvent(REDIS, "link_created", "google", NOW, f);
    await recordEvent(REDIS, "link_created", "google", NOW, f);
    await recordEvent(REDIS, "verified", "discord", NOW, f);
    expect(up.data.get(statsKey("2026-10-04", "link_created", "google"))).toBe("2");
    expect(up.data.get(statsKey("2026-10-04", "verified", "discord"))).toBe("1");
    expect([...up.ttl.values()].every((t) => t === STATS_TTL_SEC)).toBe(true);
  });

  it("stores only a date, an event name, a method and a number", async () => {
    const up = fakeUpstash();
    await recordEvent(REDIS, "not_verified", "google", NOW, up.fetch as typeof fetch);
    for (const [key, value] of up.data) {
      expect(key).toMatch(/^proveit:stats:\d{4}-\d{2}-\d{2}:(link_created|verified|not_verified):(google|discord)$/);
      expect(value).toMatch(/^\d+$/);
    }
  });

  it("reads the last N days newest first, with totals", async () => {
    const up = fakeUpstash();
    const f = up.fetch as typeof fetch;
    await recordEvent(REDIS, "link_created", "google", NOW, f);
    await recordEvent(REDIS, "verified", "google", NOW - DAY, f);
    await recordEvent(REDIS, "not_verified", "discord", NOW - DAY, f);
    await recordEvent(REDIS, "verified", "google", NOW - 40 * DAY, f); // outside the window
    const s = await readStats(REDIS, 30, NOW, f);
    expect(s.perDay).toHaveLength(30);
    expect(s.perDay[0].date).toBe("2026-10-04");
    expect(s.perDay[1].counts.verified.google).toBe(1);
    expect(s.totals).toEqual({
      link_created: { google: 1, discord: 0 },
      verified: { google: 1, discord: 0 },
      not_verified: { google: 0, discord: 1 },
    });
  });
});

describe("stats password", () => {
  const PASSWORD = "a-long-random-stats-password-123";

  it("accepts only the exact configured password", () => {
    expect(checkStatsToken(PASSWORD, PASSWORD)).toBe(true);
    expect(checkStatsToken(PASSWORD + "x", PASSWORD)).toBe(false);
    expect(checkStatsToken("", PASSWORD)).toBe(false);
    expect(checkStatsToken(null, PASSWORD)).toBe(false);
  });

  it("keeps the stats shut when no password (or a too-short one) is configured", () => {
    expect(checkStatsToken("anything", undefined)).toBe(false);
    expect(checkStatsToken("short", "short")).toBe(false);
  });
});
