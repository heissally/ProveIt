/**
 * Plain-English meaning of each `reason` in a signed ProveIt result.
 * Wording rule: say "could not verify", never "fake"; never call anyone "safe".
 */
export const REASONS: Record<string, string> = {
  ok: "Checked and confirmed.",
  no_hd: "They didn't sign in with a company Google account (for example, a personal Gmail).",
  wrong_domain: "They signed in with an account at a different company domain.",
  bad_nonce: "The sign-in doesn't belong to this check.",
  bad_token: "Google's answer wasn't valid for ProveIt.",
  unverified_email: "Google says this account's email address isn't verified.",
  expired: "The link expired before they finished.",
  provider_error: "Google didn't complete the sign-in (cancelled, too slow, or used twice).",
  role_missing: "They're in the server but don't have the role you asked about.",
  not_member: "That account isn't a member of the server.",
  not_owner: "That account doesn't own the server.",
};

export function explainReason(reason: string): string {
  return REASONS[reason] ?? `Could not verify (${reason}).`;
}
