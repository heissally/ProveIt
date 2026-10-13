/**
 * What Vercel Web Analytics is allowed to see of a page address.
 *
 * ProveIt's addresses carry private things: check IDs (/v/<id>, /r/<id>), the
 * claimed domain or server in the query string, and Google's or Discord's
 * one-time sign-in code (/callback/...?code=...). None of that may leave the
 * browser. Every page view is reduced to its page type, from a fixed list, with
 * no query string and no #fragment. Anything not on the list becomes "/other".
 */
const KNOWN: Array<[RegExp, string]> = [
  [/^\/$/, "/"],
  [/^\/new\/?$/, "/new"],
  [/^\/verify\/?$/, "/verify"],
  [/^\/privacy\/?$/, "/privacy"],
  [/^\/v\/[^/]+\/?$/, "/v/[id]"],
  [/^\/r\/[^/]+\/?$/, "/r/[id]"],
  [/^\/callback\/google\/?$/, "/callback/google"],
  [/^\/callback\/discord\/?$/, "/callback/discord"],
];

/** Pages never reported at all. */
const NEVER = [/^\/stats\/?$/];

/** Returns the address to report, or null to send nothing. */
export function redactAnalyticsUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (NEVER.some((re) => re.test(u.pathname))) return null;
  const page = KNOWN.find(([re]) => re.test(u.pathname))?.[1] ?? "/other";
  return u.origin + page;
}
