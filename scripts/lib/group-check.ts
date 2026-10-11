/**
 * Reads what a Lit group actually contains (free, read-only calls) and compares
 * it with what it SHOULD contain. Used before locking a real secret: any extra
 * action in the group could open the safe.
 */
import { ethers } from "ethers";
import { litRequest } from "./lit-api.ts";

export interface GroupContents {
  groupId: string;
  /** Actions in the group: Lit lists them by hashed CID. */
  actions: Array<{ id: string; name: string }>;
  wallets: string[];
}

/** LIT: groups store keccak256(CID) rather than the CID itself. */
export function cidHash(cid: string): bigint {
  return BigInt(ethers.utils.keccak256(ethers.utils.toUtf8Bytes(cid)));
}

/** How Lit lists a group that allows ALL actions. */
export const ALL_ACTIONS_ID = "n/a";
/** How Lit lists a group that allows ALL wallets. */
export const ALL_WALLETS_ADDRESS = "0x0000000000000000000000000000000000000000";

/**
 * LIT: list_groups returns group ids as 0x-padded hex in API mode (decimal in
 * ChainSecured mode), but list_wallets_in_group only accepts a plain integer.
 * Same conversion the Lit Dashboard uses.
 */
export function normalizeGroupId(id: string): string {
  try {
    return BigInt(id).toString();
  } catch {
    return String(id);
  }
}

function asBigInt(id: string): bigint | null {
  try {
    return BigInt(id); // works for both "0x…" hex and decimal ids
  } catch {
    return null;
  }
}

export async function readGroup(accountKey: string, groupName: string): Promise<GroupContents> {
  const page = { page_number: "0", page_size: "100" };
  const groups = await litRequest("list_groups", { apiKey: accountKey, query: page });
  if (!groups.ok || !Array.isArray(groups.data)) throw new Error(`could not list groups (HTTP ${groups.status})`);
  const matches = (groups.data as Array<{ id: string; name: string }>).filter((g) => g.name === groupName);
  if (matches.length !== 1) {
    throw new Error(`expected exactly one group named "${groupName}", found ${matches.length}`);
  }
  const groupId = normalizeGroupId(matches[0].id);
  const [actions, wallets] = await Promise.all([
    litRequest("list_actions", { apiKey: accountKey, query: { ...page, group_id: groupId } }),
    litRequest("list_wallets_in_group", { apiKey: accountKey, query: { ...page, group_id: groupId } }),
  ]);
  const why = (r: { status: number; data: unknown }) => `HTTP ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}`;
  if (!actions.ok || !Array.isArray(actions.data)) throw new Error(`could not list actions in group ${groupId} (${why(actions)})`);
  if (!wallets.ok || !Array.isArray(wallets.data)) throw new Error(`could not list wallets in group ${groupId} (${why(wallets)})`);
  return {
    groupId,
    actions: (actions.data as Array<{ id: string; name: string }>).map((a) => ({ id: a.id, name: a.name })),
    wallets: (wallets.data as Array<{ wallet_address: string }>).map((w) => w.wallet_address),
  };
}

export interface GroupProblems {
  /** Actions in the group that are not on the allowed list. */
  extraActions: string[];
  /** Allowed actions we required but did not find. */
  missingActions: string[];
  /** Wallets other than the expected safe. */
  extraWallets: string[];
  safeMissing: boolean;
}

export function compareGroup(
  contents: GroupContents,
  expect: { safe: string; allowed: Array<{ name: string; cid: string }>; required: string[] },
): GroupProblems {
  const allowedHashes = new Map(expect.allowed.map((a) => [cidHash(a.cid), a.name]));
  const present = new Set<string>();
  const extraActions: string[] = [];
  for (const a of contents.actions) {
    if (a.id === ALL_ACTIONS_ID) {
      extraActions.push('"All" (ALL actions are allowed: any code could open the safe)');
      continue;
    }
    const name = allowedHashes.get(asBigInt(a.id) ?? -1n);
    if (name) present.add(name);
    else extraActions.push(a.name || a.id);
  }
  const safe = expect.safe.toLowerCase();
  return {
    extraActions,
    missingActions: expect.required.filter((n) => !present.has(n)),
    extraWallets: contents.wallets
      .filter((w) => w.toLowerCase() !== safe)
      .map((w) => (w.toLowerCase() === ALL_WALLETS_ADDRESS ? '"All" (ALL wallets are allowed)' : w)),
    safeMissing: !contents.wallets.some((w) => w.toLowerCase() === safe),
  };
}

export function isClean(p: GroupProblems): boolean {
  return p.extraActions.length === 0 && p.missingActions.length === 0 && p.extraWallets.length === 0 && !p.safeMissing;
}
