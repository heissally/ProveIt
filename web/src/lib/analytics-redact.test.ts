import { describe, expect, it } from "vitest";
import { redactAnalyticsUrl } from "./analytics-redact";

const O = "https://prove-it.com.ng";

describe("redactAnalyticsUrl", () => {
  it("never sends a check ID, claimed domain or server", () => {
    expect(redactAnalyticsUrl(`${O}/v/Xq3vT9bLm2Rk8WdZp4NcAa?m=google&e=1791111300&d=coinbase.com`)).toBe(`${O}/v/[id]`);
    expect(redactAnalyticsUrl(`${O}/r/Xq3vT9bLm2Rk8WdZp4NcAa?m=discord&e=1&g=1373039981890900099&r=Mod`)).toBe(`${O}/r/[id]`);
  });

  it("never sends Google's or Discord's one-time sign-in code or state", () => {
    const sent = redactAnalyticsUrl(`${O}/callback/google?state=abc&code=4/0AeanS0secret&scope=email`);
    expect(sent).toBe(`${O}/callback/google`);
    expect(sent).not.toContain("code");
    expect(redactAnalyticsUrl(`${O}/callback/discord?code=xyz&state=s`)).toBe(`${O}/callback/discord`);
  });

  it("keeps ordinary pages and drops any query string or fragment", () => {
    expect(redactAnalyticsUrl(`${O}/new?utm_source=x#top`)).toBe(`${O}/new`);
    expect(redactAnalyticsUrl(`${O}/privacy`)).toBe(`${O}/privacy`);
    expect(redactAnalyticsUrl(`${O}/verify/`)).toBe(`${O}/verify`);
    expect(redactAnalyticsUrl(`${O}/`)).toBe(`${O}/`);
  });

  it("reports unknown addresses as /other, so nothing a visitor typed is sent", () => {
    expect(redactAnalyticsUrl(`${O}/some/thing/jordan@example.com`)).toBe(`${O}/other`);
    expect(redactAnalyticsUrl(`${O}/callback/unknown?code=1`)).toBe(`${O}/other`);
  });

  it("never reports the private stats page at all", () => {
    expect(redactAnalyticsUrl(`${O}/stats`)).toBeNull();
  });

  it("sends nothing for an unreadable address", () => {
    expect(redactAnalyticsUrl("not a url")).toBeNull();
  });
});
