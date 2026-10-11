/**
 * npm run lit:account
 *
 * Confirms your Lit account key works and shows what the account already holds.
 * Every call here is a free, read-only call. Nothing is created or changed.
 * No secret values are printed (Lit never returns usage-key values in lists).
 */
import { litRequest, requireEnv } from "../lib/lit-api.ts";

const accountKey = requireEnv("LIT_ACCOUNT_API_KEY");

console.log("\nProveIt · Milestone 1 · Lit account check\n");

// 1. Does the key belong to an account?
const exists = await litRequest("account_exists", { apiKey: accountKey });
if (!exists.ok || exists.data !== true) {
  console.log(`✗ Lit did not recognise this account key (HTTP ${exists.status}).`);
  console.log("  Check LIT_ACCOUNT_API_KEY in .env.local: no spaces, no quotes, the whole key.");
  console.log(`  Lit said: ${JSON.stringify(exists.data)}\n`);
  process.exit(1);
}
console.log("✓ Account key works");

// 2. Credit balance. Lit's sign is inverted: a NEGATIVE balance_cents means credit
//    is available. 1 credit = 1 US cent = about 1 second of action run time.
const bal = await litRequest("billing/balance", { apiKey: accountKey });
const balance = bal.data as { balance_cents?: number; balance_display?: string };
if (bal.ok && typeof balance.balance_cents === "number") {
  const credits = Math.max(0, -balance.balance_cents);
  console.log(`✓ Balance: ${balance.balance_display}  (≈ ${credits} credits)`);
  if (credits < 50) {
    console.log("  ⚠ Under 50 credits. Milestone 1 needs about 20; top up $5 before starting.");
  } else if (credits < 1000) {
    console.log("  Enough for Milestones 1–2. Plan a top-up to ~1,000 credits ($10) before Milestone 3.");
  } else {
    console.log("  Plenty for the whole build and testing.");
  }
} else {
  console.log(`? Could not read balance (HTTP ${bal.status}): ${JSON.stringify(bal.data)}`);
}

// 3. What's already in the account (from your escrow project, for example).
const page = { page_number: "0", page_size: "100" };
const sections: Array<[string, string]> = [
  ["Wallets (PKPs)", "list_wallets"],
  ["Groups", "list_groups"],
  ["Lit Actions", "list_actions"],
  ["Usage keys", "list_api_keys"],
];
for (const [label, path] of sections) {
  const res = await litRequest(path, { apiKey: accountKey, query: page });
  if (!res.ok || !Array.isArray(res.data)) {
    console.log(`? ${label}: could not list (HTTP ${res.status})`);
    continue;
  }
  const items = res.data as Array<{
    id: string;
    name: string;
    wallet_address?: string;
    can_execute_in_groups?: number[];
  }>;
  console.log(`\n${label}: ${items.length}`);
  for (const it of items) {
    const extra = it.wallet_address
      ? `  ${it.wallet_address}`
      : it.can_execute_in_groups
        ? `  can run in groups: [${it.can_execute_in_groups.join(", ") || "none"}]` +
          (it.can_execute_in_groups.map(String).includes("0") ? "  (0 = ALL groups)" : "")
        : "";
    console.log(`  · id ${it.id}  "${it.name || "(no name)"}"${extra}`);
  }
}

console.log("\nNothing was changed. This check is free.\n");
