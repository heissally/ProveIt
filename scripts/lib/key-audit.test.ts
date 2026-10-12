import { describe, expect, it } from "vitest";
import { auditKeys, type KeyInfo } from "./key-audit.ts";

const executeOnly = (name: string, groups: number[]): KeyInfo => ({
  name,
  can_create_groups: false,
  can_delete_groups: false,
  can_create_pkps: false,
  can_manage_ipfs_ids_in_groups: [],
  can_add_pkp_to_groups: [],
  can_remove_pkp_from_groups: [],
  can_execute_in_groups: groups,
});
const names = { "2": "proveit-google", "3": "proveit-discord", "4": "proveit-tools" };

describe("auditKeys", () => {
  it("passes an execute-only key and names its groups", () => {
    expect(auditKeys([executeOnly("proveit-web-key", [2, 3])], names)).toEqual([
      { name: "proveit-web-key", executesIn: ["proveit-google", "proveit-discord"], problems: [] },
    ]);
  });

  it("flags a wildcard 'all groups' key", () => {
    expect(auditKeys([executeOnly("dev", [0])], names)[0].problems).toContain("can execute in ALL groups (wildcard)");
  });

  it("flags every kind of management power", () => {
    const key: KeyInfo = {
      ...executeOnly("too-strong", [2]),
      can_create_groups: true,
      can_delete_groups: true,
      can_create_pkps: true,
      can_manage_ipfs_ids_in_groups: [2],
      can_add_pkp_to_groups: [2],
      can_remove_pkp_from_groups: [2],
    };
    expect(auditKeys([key], names)[0].problems).toHaveLength(6);
  });

  it("shows groups it can't name instead of hiding them", () => {
    expect(auditKeys([executeOnly("old", [9])], names)[0].executesIn).toEqual(["unknown group 9"]);
  });
});
