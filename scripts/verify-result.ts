/**
 * npm run verify:result -- "<your ProveIt link>" [--signer 0x...] [--file result.json]
 *
 * Checks a ProveIt result on YOUR computer, without trusting the ProveIt website's
 * pages. Paste the asker's /r/... link (or the verifier's /v/... link: same check).
 *
 *   1. downloads the stored { result, signature } (or reads it from --file)
 *   2. rebuilds the exact signed text (canonical JSON) and recovers who signed it
 *   3. compares that with the published signer address for the method
 *      (from config/lit.json, or --signer to supply one you derived yourself)
 *   4. checks it answers this check (challenge hash), for this claim and expiry
 *
 * LIT: only the Lit Action whose CID gives that signer address can produce the signature.
 */
import { readFile } from "node:fs/promises";
import { sortRoles } from "../shared/discord.ts";
import { canonical } from "../shared/canonical.ts";
import { challengeHashFor, verifyResult, type Expected, type SignedResult } from "../shared/verify.ts";
import { loadLitConfig } from "./lib/config.ts";
import { loadRegistry } from "./lib/registry.ts";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const link = args.find((a) => /^https?:\/\//.test(a));
if (!link) {
  console.error('\nUsage: npm run verify:result -- "https://prove-it.com.ng/r/<id>?…" [--signer 0x…] [--file result.json]\n');
  process.exit(1);
}

const url = new URL(link);
const id = url.pathname.match(/\/[rv]\/([A-Za-z0-9_-]{22})$/)?.[1];
const method = url.searchParams.get("m");
const expiresAt = Number(url.searchParams.get("e"));
if (!id || (method !== "google" && method !== "discord") || !Number.isSafeInteger(expiresAt)) {
  console.error("\n✗ That isn't a complete ProveIt link.\n");
  process.exit(1);
}

let claim: Record<string, unknown>;
if (method === "google") {
  claim = { domain: String(url.searchParams.get("d") ?? "").toLowerCase() };
} else {
  const guildId = url.searchParams.get("g") ?? "";
  const server = (await loadRegistry()).find((s) => s.guildId === guildId);
  if (!server) {
    console.error(`\n✗ Server ${guildId} is not in registry/servers.json.\n`);
    process.exit(1);
  }
  claim = { guildId, guildName: server.name.trim(), roles: sortRoles((url.searchParams.get("r") ?? "").split(",")) };
}

const signer = flag("--signer") ?? (await loadLitConfig())[method].signer;
if (!signer) {
  console.error(`\n✗ No published signer for ${method} in config/lit.json (pass --signer 0x…).\n`);
  process.exit(1);
}

const hash = challengeHashFor(id);
let signed: SignedResult;
if (flag("--file")) {
  signed = JSON.parse(await readFile(flag("--file")!, "utf8"));
} else {
  const res = await fetch(`${url.origin}/api/results/${hash}`);
  const body = (await res.json().catch(() => null)) as (SignedResult & { found?: boolean; corrupt?: boolean }) | null;
  if (!res.ok || !body || body.found === false) {
    console.error(`\n✗ No stored result for this check (HTTP ${res.status}).\n`);
    process.exit(1);
  }
  if (body.corrupt) {
    console.error("\n✗ The stored result is damaged or was edited so it can't be read. Treat as \"could not verify\".\n");
    process.exit(1);
  }
  signed = { result: body.result, signature: body.signature };
}

const expected: Expected = { signer, challengeId: id, method, claim, expiresAt };
const v = verifyResult(signed, expected);

console.log(`\nProveIt · verify a result yourself\n`);
console.log(`  check id        ${id}`);
console.log(`  challenge hash  ${hash}`);
console.log(`  expected signer ${signer}${flag("--signer") ? " (you supplied it)" : " (from config/lit.json)"}`);
try {
  console.log(`  signed text     ${canonical(signed.result)}`);
} catch {
  console.log("  signed text     (not valid canonical JSON)");
}
console.log("");
if (v.valid) {
  const r = signed.result;
  console.log(`✓ Genuine ProveIt result for this check: ${r.status.toUpperCase()} (reason: ${r.reason})`);
} else {
  console.log("✗ NOT a genuine result for this check:");
  for (const p of v.problems) console.log(`  · ${p}`);
}
console.log("");
process.exit(v.valid ? 0 : 1);
