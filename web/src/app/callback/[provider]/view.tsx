"use client";

/**
 * Screen 5 (verifier): send the one-time code to /api/check, which runs the
 * ProveIt Lit Action, then show what was checked inside Lit and what was shared.
 */
import { useEffect, useRef, useState } from "react";
import { roleName } from "../../../../../shared/discord.ts";
import { verifyResult, type ProveItResult } from "../../../../../shared/verify.ts";
import { sharedNote, verifierFailure } from "../../../lib/verifier-text";
import { ButtonLink, Card, H1, LockIcon, Screen, Tick } from "../../../components/ui";
import { checkCode, verifierPath, type Check } from "../../../lib/challenge";
import { expectedFor, officialServer, rolesText } from "../../../lib/claims";
import { findServer } from "../../../lib/config";
import { takePending } from "../../../lib/signin";

const PROBLEMS: Record<string, string> = {
  cancelled: "You cancelled the sign-in. Nothing was shared.",
  lost: "This sign-in can't be matched to a ProveIt check. It may have been opened in another tab or browser. Open the ProveIt link again.",
  rate_limited: "Too many checks are running right now. Wait a few minutes, then open the link again.",
  invalid_input: "ProveIt couldn't use this sign-in. The link may have expired or been changed. Ask for a new link.",
  lit_unavailable: "Lit's network didn't answer. Open the link again in a minute.",
  network: "Couldn't reach ProveIt. Check your connection and open the link again.",
  unexpected: "Something went wrong while checking. Open the link again.",
};

type State =
  | { phase: "checking" }
  | { phase: "problem"; problem: string; check?: Check }
  | { phase: "done"; check: Check; result: ProveItResult; valid: boolean; stored: boolean };

export function CallbackView({ provider, code, state, error }: { provider: string; code: string | null; state: string | null; error: string | null }) {
  const [s, setS] = useState<State>({ phase: "checking" });
  const ran = useRef(false); // the one-time code must be sent exactly once

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    window.history.replaceState(null, "", window.location.pathname); // drop ?code= from the address bar
    const taken = takePending(sessionStorage, state);
    if (error) return setS({ phase: "problem", problem: error === "access_denied" ? "cancelled" : "unexpected", check: taken?.check });
    if (!taken || taken.check.method !== provider || !code) return setS({ phase: "problem", problem: "lost" });
    const c = taken.check;
    const body = {
      method: c.method,
      code,
      codeVerifier: taken.pending.verifier,
      redirectUri: taken.pending.redirectUri,
      challengeId: c.challengeId,
      expiresAt: c.expiresAt,
      ...(c.method === "google" ? { domain: c.domain } : { guildId: c.guildId, roles: c.roles }),
    };
    fetch("/api/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(async (res) => {
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j.ok) return setS({ phase: "problem", problem: PROBLEMS[j.error] ? j.error : "unexpected", check: c });
        const server = c.method === "discord" ? findServer(c.guildId) : undefined;
        const expected = expectedFor(c, server);
        const valid = !!expected && verifyResult({ result: j.result, signature: j.signature }, expected).valid;
        setS({ phase: "done", check: c, result: j.result, valid, stored: j.stored !== false });
      })
      .catch(() => setS({ phase: "problem", problem: "network", check: c }));
  }, [provider, code, state, error]);

  if (s.phase === "checking") {
    return (
      <Screen role="verifier">
        <H1>Checking inside Lit&hellip;</H1>
        <p className="mt-3 text-lg text-muted">The ProveIt Lit Action is checking your sign-in in a sealed enclave. This takes a few seconds.</p>
        <span className="mt-8 h-4 w-4 animate-pulse rounded-full bg-accent" />
      </Screen>
    );
  }
  if (s.phase === "problem") {
    return (
      <Screen role="verifier">
        <H1>{s.problem === "cancelled" ? "Sign-in cancelled" : "That didn’t work"}</H1>
        <p className="mt-3 text-lg text-muted">{PROBLEMS[s.problem]}</p>
        {s.check && <div className="mt-8"><ButtonLink href={verifierPath(s.check)}>Back to the ProveIt link</ButtonLink></div>}
      </Screen>
    );
  }

  const { check, result } = s;
  const server = check.method === "discord" ? findServer(check.guildId) : undefined;
  const code_ = checkCode(check.challengeId);
  const username = (result.subject as { discordUsername?: string } | undefined)?.discordUsername;
  const verified = result.status === "verified" && s.valid;

  return (
    <Screen role="verifier">
      <H1>{verified ? "Checked inside Lit" : "Could not verify"}</H1>
      <p className="mt-3 text-lg text-muted">
        {verified
          ? `The ProveIt${check.method === "discord" ? " Discord" : ""} Lit Action ran these checks in a sealed enclave.`
          : `${verifierFailure(check, result)} The person who asked will see this result too.`}
      </p>
      {verified && (
        <Card className="mt-6">
          <ul className="divide-y divide-line">
            {check.method === "google" ? (
              <Tick ok>Google confirmed the account belongs to {check.domain}</Tick>
            ) : (
              <>
                <Tick ok>Discord confirmed the account is {username}</Tick>
                <Tick ok>
                  {`Has the ${roleName(result.provenRole)} role in ${officialServer(server?.name ?? "")}`}
                </Tick>
              </>
            )}
            <Tick ok>Result is tied to this exact check ({code_})</Tick>
            <Tick ok>The link had not expired</Tick>
            <Tick ok>Result signed with the ProveIt Lit Action&rsquo;s own key</Tick>
          </ul>
        </Card>
      )}
      <div className="mt-4 flex gap-3 rounded-3xl bg-accent-soft p-5 text-accent-ink">
        <LockIcon className="h-6 w-6 shrink-0" />
        <p>{sharedNote(check, result)}</p>
      </div>
      {!s.stored && (
        <p className="mt-4 font-semibold text-danger">ProveIt couldn&rsquo;t save the result, so the person who asked won&rsquo;t see it. Ask them for a new link.</p>
      )}
      {!s.valid && <p className="mt-4 font-semibold text-danger">This result didn&rsquo;t pass the signature check on your device.</p>}
      <p className="mt-auto pt-10 text-center text-lg font-semibold">Done. You can go back to your chat.</p>
      {check.method === "discord" && !verified && check.roles.length > 0 && (
        <p className="mt-2 text-center text-sm text-muted">Asked for: {rolesText(check.roles)} in {server?.name}</p>
      )}
    </Screen>
  );
}
