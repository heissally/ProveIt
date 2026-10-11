/**
 * Plain-English meaning of each `reason` in a signed ProveIt result, in two voices:
 * for the asker ("They…") and for the verifier ("You…").
 * Wording rule: say "could not verify", never "fake"; never call anyone "safe".
 */
type Method = "google" | "discord";
const provider = (m: Method) => (m === "discord" ? "Discord" : "Google");

/** For the asker, about the stranger. */
export function explainReason(reason: string, method: Method = "google"): string {
  const p = provider(method);
  const text: Record<string, string> = {
    ok: "Checked and confirmed.",
    no_hd: "They didn't sign in with a company Google account (for example, a personal Gmail).",
    wrong_domain: "They signed in with an account at a different company domain.",
    bad_nonce: "The sign-in doesn't belong to this check.",
    bad_token: `${p}'s answer wasn't valid for ProveIt.`,
    unverified_email: "Google says this account's email address isn't verified.",
    expired: "The link expired before they finished.",
    provider_error: `${p} didn't complete the sign-in (cancelled, too slow, or used twice).`,
    role_missing: "They're in the server but don't have the role you asked about.",
    not_member: "That account isn't a member of the server.",
  };
  return text[reason] ?? `Could not verify (${reason}).`;
}

/** For the verifier, about their own sign-in. */
export function explainReasonToVerifier(reason: string, method: Method = "google"): string {
  const p = provider(method);
  const text: Record<string, string> = {
    ok: "Checked and confirmed.",
    no_hd: "You didn't sign in with a company Google account (for example, you used a personal Gmail).",
    wrong_domain: "You signed in with an account at a different company domain than the one you were asked about.",
    bad_nonce: "This sign-in doesn't belong to this check.",
    bad_token: `${p}'s answer wasn't valid for ProveIt.`,
    unverified_email: "Google says your account's email address isn't verified.",
    expired: "The link expired before you finished.",
    provider_error: `${p} didn't complete the sign-in (cancelled, too slow, or used twice).`,
    role_missing: "Your account is in the server, but doesn't have the role you were asked about.",
    not_member: "Your account isn't a member of that server.",
  };
  return text[reason] ?? `Could not verify (${reason}).`;
}
