import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { M1_ACTIONS, M2_ACTIONS, REPO_ROOT, readActionSource, vaultTwinSource } from "./lit-api.ts";

// The code we send to Lit must be byte-for-byte what the Lit Dashboard would
// hash when someone pastes the same file, so that both give the same CID.
describe("readActionSource", () => {
  for (const action of [...M1_ACTIONS, ...M2_ACTIONS]) {
    it(`${action.path} is sent exactly as the Dashboard would hash it`, async () => {
      const raw = await readFile(join(REPO_ROOT, action.path), "utf8");
      const sent = await readActionSource(action.path);
      expect(sent).toBe(raw.trim());
      expect(sent).not.toMatch(/^\s|\s$/);
      expect(sent).not.toContain("\r");
    });
  }
});

describe("vaultTwinSource", () => {
  it("keeps the probe's code unchanged and only adds a comment line", async () => {
    const original = await readActionSource("lit-actions/probes/probe-vault.js");
    const twin = vaultTwinSource(original);
    expect(twin).not.toBe(original);
    expect(twin.startsWith(original + "\n//")).toBe(true);
    expect(twin.split("\n").length).toBe(original.split("\n").length + 1);
  });

  it("is already trimmed, so the Dashboard would hash it the same way", async () => {
    const twin = vaultTwinSource(await readActionSource("lit-actions/probes/probe-vault.js"));
    expect(twin).toBe(twin.trim());
  });
});
