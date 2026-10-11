"use client";

/** Screen 3 (verifier): what is being asked, what is shared, then sign in on the provider's own page. */
import { useMemo, useState } from "react";
import { Button, Card, H1, Label, Notice, Screen, Tick } from "../../../components/ui";
import { base64url, checkCode, fromQuery } from "../../../lib/challenge";
import { rolesText } from "../../../lib/claims";
import { findServer } from "../../../lib/config";
import { callbackPath, makePkce, providerUrl, savePending } from "../../../lib/signin";
import { howItWorks } from "../../../lib/verifier-text";

export function VerifierView({ id, query }: { id: string; query: string }) {
  const check = useMemo(() => fromQuery(id, new URLSearchParams(query)), [id, query]);
  const server = check?.method === "discord" ? findServer(check.guildId) : undefined;
  const [now] = useState(() => Math.floor(Date.now() / 1000));
  const [busy, setBusy] = useState(false);

  if (!check || (check.method === "discord" && !server)) {
    return (
      <Screen role="verifier">
        <H1>This link isn&rsquo;t valid</H1>
        <p className="mt-3 text-muted">Ask the person who sent it for a new ProveIt link.</p>
      </Screen>
    );
  }
  if (check.expiresAt <= now) {
    return (
      <Screen role="verifier">
        <H1>This link has expired</H1>
        <p className="mt-3 text-muted">ProveIt links last 15 minutes. Ask the person who sent it for a new one.</p>
      </Screen>
    );
  }

  function start() {
    setBusy(true);
    const pkce = makePkce();
    const state = base64url(crypto.getRandomValues(new Uint8Array(16)));
    const origin = window.location.origin;
    savePending(sessionStorage, check!, { state, verifier: pkce.verifier, redirectUri: origin + callbackPath(check!.method) });
    window.location.assign(providerUrl(check!, { origin, state, codeChallenge: pkce.challenge }));
  }


  return (
    <Screen role="verifier">
      <H1>
        Someone asked you to prove{" "}
        {check.method === "google" ? "you work at" : `you’re ${rolesText(check.roles)} in`}
      </H1>
      <p className="mt-4 inline-block self-start break-all rounded-2xl border-2 border-ink px-4 py-2 font-mono text-2xl font-semibold">
        {check.method === "google" ? check.domain : server!.name}
      </p>

      <div className="mt-6">
        <Notice tone="warn">Only continue if you are personally talking with the person who sent you this link.</Notice>
      </div>

      <Card className="mt-4">
        <Label>They will see</Label>
        <ul>
          {check.method === "google" ? (
            <>
              <Tick ok>The company domain of the account you sign in with</Tick>
              <Tick ok>The time you verified</Tick>
            </>
          ) : (
            <>
              <Tick ok>Your Discord username (so they can match it to the account messaging them)</Tick>
              <Tick ok>Whether you have {rolesText(check.roles)} in this one server</Tick>
            </>
          )}
        </ul>
        <div className="mt-3"><Label>They will never see</Label></div>
        <ul>
          {check.method === "google" ? <Tick ok={false}>Your name or email</Tick> : <Tick ok={false}>Your email, nickname or other servers</Tick>}
          <Tick ok={false}>Your password (ProveIt never gets it)</Tick>
        </ul>
      </Card>

      <Card className="mt-4">
        <Label>How this works</Label>
        <ol className="list-decimal space-y-2 pl-5 text-[15px] leading-snug">
          {howItWorks(check, server).map((point) => <li key={point}>{point}</li>)}
        </ol>
        <a href="/verify" className="mt-3 inline-block text-sm font-semibold text-accent underline">See the Lit Action fingerprints</a>
      </Card>

      <p className="mt-4 text-center text-muted">
        Check code <span className="font-mono font-semibold text-ink">{checkCode(check.challengeId)}</span>: the person who sent this sees the same code.
      </p>

      <div className="mt-auto pt-8">
        <Button onClick={start} disabled={busy}>
          {check.method === "google" ? "Continue with your work Google account" : "Continue with Discord"}
        </Button>
        <p className="mt-3 text-center text-muted">No ProveIt account needed. Takes about 30 seconds.</p>
      </div>
    </Screen>
  );
}
