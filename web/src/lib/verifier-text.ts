/**
 * What the verifier is told. Rule: say only what is strictly true.
 *
 * True: the password goes only to Google/Discord; the Lit Action uses the one-time
 * sign-in once inside Lit's enclave and returns only what's listed; nobody can fake
 * a result. NOT claimed: that whoever runs this website could never see a sign-in.
 * The one-time code passes through the website on its way to Lit (see SECURITY.md).
 */
import type { ProveItResult } from "../../../shared/verify.ts";
import { explainReasonToVerifier } from "../../../shared/reasons.ts";
import type { Check } from "./challenge";
import type { ServerSettings } from "./config";
import { rolesText } from "./claims";

/** Why the check didn't pass, in the verifier's own voice ("You…"). */
export function verifierFailure(check: Check, result: ProveItResult): string {
  if (check.method === "google" && result.reason === "wrong_domain" && typeof result.actualDomain === "string") {
    return `You signed in with an account at ${result.actualDomain}, not ${check.domain}.`;
  }
  return explainReasonToVerifier(result.reason, check.method);
}

/** Exactly what left the enclave, based on what is in the signed result. */
export function sharedNote(check: Check, result: ProveItResult): string {
  const verified = result.status === "verified";
  if (check.method === "google") {
    const kept = "Your name and email stayed inside the enclave.";
    if (verified) return `${kept} Only “${check.domain}” was shared.`;
    if (typeof result.actualDomain === "string") {
      return `${kept} Only the company domain of the account you used (“${result.actualDomain}”) and the reason the check didn’t pass were shared.`;
    }
    return `${kept} No company domain was shared, only the reason the check didn’t pass.`;
  }
  const username = (result.subject as { discordUsername?: unknown } | undefined)?.discordUsername;
  const rest = "Nothing else from your Discord account was shared.";
  if (verified && typeof username === "string") {
    return `Only your username (${username}) and your ${String(result.provenRole)} role were shared. ${rest}`;
  }
  if (typeof username === "string") return `Only your username (${username}) and the reason the check didn’t pass were shared. ${rest}`;
  return "Nothing from your Discord account was shared, only the reason the check didn’t pass.";
}

/** The "How this works" points on the verifier's page. */
export function howItWorks(check: Check, server?: ServerSettings): string[] {
  const enclave = "ProveIt’s published Lit Action (its exact code fingerprint is listed on the Verify page) uses your one-time sign-in once, inside Lit’s sealed enclave (TEE), then throws it away. Nobody can fake its result.";
  if (check.method === "google") {
    return [
      "You sign in on Google’s own page. Your password goes only to Google; ProveIt never sees it.",
      `${enclave} It checks only which company domain your account belongs to.`,
      "Only the result (the company domain and the time) is shared, and kept for 30 days so the person who asked can see it. Your name and email are never shared or stored.",
    ];
  }
  const name = server?.name ?? "this server";
  return [
    "You sign in on Discord’s own page. Your password goes only to Discord; ProveIt never sees it.",
    `Discord’s screen will ask to let ProveIt read your member info in your servers, because Discord has no one-server option. The check looks only at ${name}, and never sees your list of servers.`,
    enclave,
    `Only your username and whether you have ${rolesText(check.roles)} in ${name} are shared, and kept for 30 days so the person who asked can see it. Nothing else from your Discord account.`,
  ];
}
