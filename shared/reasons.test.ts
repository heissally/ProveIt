import { describe, expect, it } from "vitest";
import { explainReason, explainReasonToVerifier } from "./reasons.ts";

const FAILURES = ["no_hd", "wrong_domain", "bad_nonce", "bad_token", "unverified_email", "expired", "provider_error", "role_missing", "not_member"];

describe("reason texts", () => {
  it("speak to the verifier as 'you', never 'they'", () => {
    for (const r of FAILURES) {
      const text = explainReasonToVerifier(r, "google");
      expect(text, r).not.toMatch(/\bthey\b|\bthey're\b|\btheir\b/i);
    }
    expect(explainReasonToVerifier("no_hd")).toBe("You didn't sign in with a company Google account (for example, you used a personal Gmail).");
    expect(explainReasonToVerifier("role_missing", "discord")).toMatch(/^Your account is in the server/);
  });

  it("speak to the asker about the stranger", () => {
    expect(explainReason("no_hd")).toMatch(/^They didn't sign in/);
    expect(explainReason("expired")).toBe("The link expired before they finished.");
  });

  it("name the right provider for provider errors", () => {
    expect(explainReason("provider_error", "discord")).toMatch(/^Discord didn't complete/);
    expect(explainReasonToVerifier("provider_error", "discord")).toMatch(/^Discord didn't complete/);
    expect(explainReason("provider_error", "google")).toMatch(/^Google didn't complete/);
  });

  it("never say 'fake' or call anyone 'safe'", () => {
    for (const r of FAILURES) {
      for (const text of [explainReason(r), explainReasonToVerifier(r), explainReason(r, "discord"), explainReasonToVerifier(r, "discord")]) {
        expect(text).not.toMatch(/\bfake\b|\bsafe\b/i);
      }
    }
  });

  it("still explain an unknown reason without crashing", () => {
    expect(explainReasonToVerifier("something_new")).toBe("Could not verify (something_new).");
  });
});
