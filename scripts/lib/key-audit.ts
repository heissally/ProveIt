/**
 * Checks Lit usage keys for more power than ProveIt needs. Every ProveIt key
 * should be execute-only, in named groups, with no wildcards.
 */
export interface KeyInfo {
  name: string;
  can_create_groups: boolean;
  can_delete_groups: boolean;
  can_create_pkps: boolean;
  can_manage_ipfs_ids_in_groups: number[];
  can_add_pkp_to_groups: number[];
  can_remove_pkp_from_groups: number[];
  can_execute_in_groups: number[];
}

export interface KeyReport {
  name: string;
  executesIn: string[];
  problems: string[];
}

/** groupNames: decimal group id → group name. Group 0 means "all groups". */
export function auditKeys(keys: KeyInfo[], groupNames: Record<string, string>): KeyReport[] {
  return keys.map((k) => {
    const problems: string[] = [];
    const ids = (k.can_execute_in_groups ?? []).map(String);
    if (ids.includes("0")) problems.push("can execute in ALL groups (wildcard)");
    if (k.can_create_groups) problems.push("can create groups");
    if (k.can_delete_groups) problems.push("can delete groups");
    if (k.can_create_pkps) problems.push("can create PKPs");
    if ((k.can_manage_ipfs_ids_in_groups ?? []).length) problems.push("can add/remove actions in groups");
    if ((k.can_add_pkp_to_groups ?? []).length) problems.push("can add PKPs to groups");
    if ((k.can_remove_pkp_from_groups ?? []).length) problems.push("can remove PKPs from groups");
    const executesIn = ids.filter((id) => id !== "0").map((id) => groupNames[id] ?? `unknown group ${id}`);
    return { name: k.name || "(no name)", executesIn, problems };
  });
}
