/**
 * What a check claims, in plain words, and the exact claim object the signed
 * result must contain for the asker's page to accept it.
 */
import { roleName, type RoleLabel } from "../../../shared/discord.ts";
import type { Expected } from "../../../shared/verify.ts";
import type { Check } from "./challenge";
import { PROVEIT, type ServerSettings } from "./config";

/** "Moderator", "Admin or Moderator". */
export function rolesText(roles: RoleLabel[]): string {
  const names = roles.map(roleName);
  return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

/**
 * "the official Lit Protocol server", but "the official ProveIt demo server" when
 * the name already ends in "server", so the word never doubles.
 */
export function officialServer(name: string): string {
  const n = name.trim();
  return /\bserver$/i.test(n) ? `the official ${n}` : `the official ${n} server`;
}

/**
 * Why the asker can trust this is the real server, in plain words instead of a raw link:
 * "Official server, linked from Lit Protocol’s website". Null for test servers with no source.
 */
export function officialSourceText(server?: ServerSettings): { text: string; href: string } | null {
  if (!server?.officialSource) return null;
  let host = "";
  try {
    host = new URL(server.officialSource).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
  const name = server.name.trim();
  const whose = /s$/i.test(name) ? `${name}’` : `${name}’s`;
  const where = host === "x.com" || host === "twitter.com" ? "X account" : "website";
  return { text: `Official server, linked from ${whose} ${where}`, href: server.officialSource };
}

/** Ending for "…prove you ___" / "…confirm you ___". */
export function claimPhrase(check: Check, server?: ServerSettings): string {
  if (check.method === "google") return `work at ${check.domain}`;
  const name = server?.name ?? "this Discord server";
  return `are ${rolesText(check.roles)} in ${name}`;
}

/**
 * "What to do now" after a failed check. "dont" items get a red ✗, things to do
 * (like reporting) get a green ✓, so "report them" never reads as "don't report them".
 */
export function whatToDo(method: Check["method"]): Array<{ text: string; kind: "dont" | "do" }> {
  return method === "google"
    ? [
        { text: "Don't click links they send", kind: "dont" },
        { text: "Don't download or run their files", kind: "dont" },
        { text: "Report and block the account", kind: "do" },
      ]
    : [
        { text: "Don't click links they send", kind: "dont" },
        { text: "Never “verify your wallet” for them", kind: "dont" },
        { text: "Report them to the real moderators", kind: "do" },
      ];
}

/** The message the asker pastes into the chat. */
export function pasteMessage(check: Check, link: string, server?: ServerSettings): string {
  return `Before we continue, please confirm you ${claimPhrase(check, server)} here: ${link}`;
}

/**
 * Everything the asker's page expects inside a genuine result for this check,
 * or null if the Discord server isn't one this site knows.
 */
export function expectedFor(check: Check, server?: ServerSettings): Expected | null {
  if (check.method === "google") {
    return {
      signer: PROVEIT.google.signer,
      challengeId: check.challengeId,
      method: "google",
      claim: { domain: check.domain },
      expiresAt: check.expiresAt,
    };
  }
  if (!server) return null;
  return {
    signer: PROVEIT.discord.signer,
    challengeId: check.challengeId,
    method: "discord",
    claim: { guildId: check.guildId, guildName: server.name, roles: check.roles },
    expiresAt: check.expiresAt,
  };
}
