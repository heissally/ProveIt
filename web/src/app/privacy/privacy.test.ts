import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { DISCORD_SCOPES } from "../../../../shared/discord.ts";
import { RESULT_TTL_SEC } from "../../server/store";

// The privacy page is plain text in its source file. These checks keep its promises
// in step with what the code actually does.
const page = () => readFile(new URL("./page.tsx", import.meta.url), "utf8");

describe("privacy page matches the code", () => {
  it("states the real result retention (30 days)", async () => {
    expect(RESULT_TTL_SEC).toBe(30 * 24 * 60 * 60);
    expect(await page()).toContain("deleted automatically after 30 days");
  });

  it("states the real rate-limit counter lifetime (10 minutes) and that IPs are only hashed", async () => {
    const store = await readFile(new URL("../../server/store.ts", import.meta.url), "utf8");
    expect(store).toContain('["EXPIRE", ipKey, 600]');
    const text = await page();
    expect(text).toContain("salted hash of your IP address");
    expect(text).toContain("deleted automatically after 10 minutes");
  });

  it("matches the Discord permissions actually requested (no server list)", async () => {
    expect(DISCORD_SCOPES).not.toContain("guilds");
    expect(await page()).toContain("It never requests your list of servers");
  });

  it("describes the visitor statistics and the daily totals honestly", async () => {
    const text = await page();
    expect(text).toContain("Vercel Web Analytics");
    expect(text).toContain("without cookies");
    expect(text).toContain("removes check IDs, claimed domains and servers, and");
    expect(text).toContain("sign-in codes from the page address");
    expect(text).toContain("deleted automatically after about 13 months");
    expect(text).not.toMatch(/no ProveIt accounts, cookies, analytics/);
    const { STATS_TTL_SEC } = await import("../../server/stats");
    expect(Math.round(STATS_TTL_SEC / 86400 / 30)).toBe(13);
  });

  it("does not promise that whoever runs ProveIt could never see a sign-in", async () => {
    expect(await page()).not.toMatch(/not even (the )?operator|no one (else )?can see/i);
  });
});
