/**
 * Sanity checks for a pasted OAuth client secret, before it is locked into a safe.
 *
 * The hidden prompt shows nothing while you paste, so it is easy to paste twice
 * or pick up stray characters. These checks catch that and describe the problem
 * without ever showing the secret itself.
 */
export const SECRET_FORMAT = {
  // "GOCSPX-" + 28 characters (35 in total)
  google: { pattern: /^GOCSPX-[A-Za-z0-9_-]{28}$/, expected: '35 characters starting with "GOCSPX-"' },
  // 32 characters (Discord Developer Portal → OAuth2 → Client Secret)
  discord: { pattern: /^[A-Za-z0-9_-]{32}$/, expected: "32 letters, digits, - or _" },
};

/** Remove the invisible markers some terminals wrap around pasted text. */
export function cleanPasted(raw: string): string {
  return raw.replace(/\x1b\[20[01]~/g, "").trim();
}

export function checkSecret(method: "google" | "discord", secret: string): { ok: boolean; summary: string } {
  const format = SECRET_FORMAT[method];
  if (format.pattern.test(secret)) {
    return { ok: true, summary: `${secret.length} characters, as expected (${format.expected})` };
  }
  const notes = [`got ${secret.length} characters, expected ${format.expected}`];
  const pastes = method === "google" ? secret.split("GOCSPX-").length - 1 : 0;
  if (pastes > 1) notes.push(`it contains "GOCSPX-" ${pastes} times, so it was probably pasted more than once`);
  if (/\s/.test(secret)) notes.push("it contains spaces or line breaks");
  if (/[\x00-\x1f\x7f]/.test(secret)) notes.push("it contains invisible control characters");
  return { ok: false, summary: notes.join("; ") };
}
