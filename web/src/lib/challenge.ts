/**
 * A "check": what the asker asked for, plus a random challenge ID. It lives only in
 * the links (/v/<id>?… for the verifier, /r/<id>?… for the asker). The asker's own
 * /r/ link is what their result page trusts; nothing is stored server-side until a
 * signed result comes back from Lit.
 */
import { ethers } from "ethers";
import { sortRoles, type RoleLabel } from "../../../shared/discord.ts";

export const LINK_LIFETIME_SEC = 15 * 60;
const CHALLENGE_ID = /^[A-Za-z0-9_-]{22}$/;
const SNOWFLAKE = /^\d{17,20}$/;
const DOMAIN = /^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/;

export type Check =
  | { method: "google"; challengeId: string; expiresAt: number; domain: string }
  | { method: "discord"; challengeId: string; expiresAt: number; guildId: string; roles: RoleLabel[] };

export function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 128 random bits, as 22 base64url characters. */
export function newChallengeId(bytes: Uint8Array = crypto.getRandomValues(new Uint8Array(16))): string {
  if (bytes.length !== 16) throw new Error("challenge needs exactly 16 random bytes");
  return base64url(bytes);
}

const WORDS = [
  "TIGER", "WOLF", "OTTER", "EAGLE", "FALCON", "BEAR", "LYNX", "HERON", "RAVEN", "BISON", "MOOSE", "PANDA",
  "KOALA", "LEMUR", "GECKO", "COBRA", "SHARK", "WHALE", "ORCA", "CRANE", "ROBIN", "FINCH", "HARE", "BADGER",
  "FERRET", "CAMEL", "LLAMA", "ZEBRA", "RHINO", "HIPPO", "BEAVER", "MARTEN", "OWL", "HAWK", "SWAN", "GOOSE",
  "PUFFIN", "TOUCAN", "PARROT", "IBEX", "YAK", "BOAR", "STAG", "FOX", "MINK", "SEAL", "WALRUS", "MANTA",
  "SQUID", "CRAB", "LOBSTER", "SALMON", "TROUT", "PIKE", "HORNET", "BEETLE", "MOTH", "CRICKET", "MANTIS", "SPARROW",
  "CONDOR", "JAGUAR", "PUMA", "COYOTE",
];

/**
 * The human check code (e.g. "TIGER-42"), derived from the challenge ID. The asker
 * and the verifier both see it, so they can tell they are looking at the same check.
 */
export function checkCode(challengeId: string): string {
  const h = ethers.utils.arrayify(ethers.utils.sha256(ethers.utils.toUtf8Bytes(challengeId)));
  return `${WORDS[h[0] % WORDS.length]}-${10 + (h[1] % 90)}`;
}

/**
 * Turn what the asker typed into a bare domain: "https://www.Coinbase.com/careers" → "coinbase.com".
 * Returns null if it isn't a domain.
 */
export function normalizeDomain(input: string): string | null {
  let d = input.trim().toLowerCase();
  d = d.replace(/^[a-z]+:\/\//, "").replace(/[/?#].*$/, "").replace(/:\d+$/, "").replace(/\.$/, "");
  d = d.replace(/^www\./, "");
  return d.length <= 253 && DOMAIN.test(d) ? d : null;
}

export function toQuery(check: Check): string {
  const q = new URLSearchParams({ m: check.method, e: String(check.expiresAt) });
  if (check.method === "google") q.set("d", check.domain);
  else {
    q.set("g", check.guildId);
    q.set("r", check.roles.join(","));
  }
  return q.toString();
}

/** Read a check back out of a link. Returns null for anything malformed. */
export function fromQuery(challengeId: string, q: URLSearchParams): Check | null {
  if (!CHALLENGE_ID.test(challengeId)) return null;
  const expiresAt = Number(q.get("e"));
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= 0) return null;
  if (q.get("m") === "google") {
    const domain = normalizeDomain(q.get("d") ?? "");
    return domain ? { method: "google", challengeId, expiresAt, domain } : null;
  }
  if (q.get("m") === "discord") {
    const guildId = q.get("g") ?? "";
    const raw = (q.get("r") ?? "").split(",").filter(Boolean);
    const roles = sortRoles(raw);
    if (!SNOWFLAKE.test(guildId) || roles.length === 0 || roles.length !== raw.length) return null;
    return { method: "discord", challengeId, expiresAt, guildId, roles };
  }
  return null;
}

export const verifierPath = (c: Check) => `/v/${c.challengeId}?${toQuery(c)}`;
export const askerPath = (c: Check) => `/r/${c.challengeId}?${toQuery(c)}`;
