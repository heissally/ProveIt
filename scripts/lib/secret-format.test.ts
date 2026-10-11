import { describe, expect, it } from "vitest";
import { checkSecret, cleanPasted } from "./secret-format.ts";

// A made-up secret in Google's format (not a real one).
const GOOGLE = "GOCSPX-" + "aB3_dE6-gH9jK2mN5pQ8sT1vW4yZ";

describe("checkSecret", () => {
  it("accepts a Google secret in the expected format", () => {
    expect(GOOGLE).toHaveLength(35);
    expect(checkSecret("google", GOOGLE).ok).toBe(true);
  });

  it("catches a secret pasted several times (what happened in Milestone 3)", () => {
    const r = checkSecret("google", GOOGLE.repeat(3));
    expect(r.ok).toBe(false);
    expect(r.summary).toContain('"GOCSPX-" 3 times');
  });

  it("catches spaces or line breaks", () => {
    expect(checkSecret("google", GOOGLE.slice(0, 20) + " " + GOOGLE.slice(21)).summary).toContain("spaces");
  });

  it("catches a secret that is cut short", () => {
    expect(checkSecret("google", GOOGLE.slice(0, 30)).summary).toContain("got 30 characters");
  });

  it("never includes the secret itself in its message", () => {
    expect(checkSecret("google", GOOGLE + "x").summary).not.toContain(GOOGLE.slice(7));
  });

  it("accepts a Discord secret in the expected format", () => {
    expect(checkSecret("discord", "a".repeat(16) + "B-_9".repeat(4)).ok).toBe(true);
    expect(checkSecret("discord", GOOGLE).ok).toBe(false);
  });
});

describe("cleanPasted", () => {
  it("removes bracketed-paste markers and surrounding spaces", () => {
    expect(cleanPasted(`\x1b[200~${GOOGLE}\x1b[201~ \n`)).toBe(GOOGLE);
  });
});
