"use client";

/**
 * Asker: share the link, wait, then show the result (screens 2, 6 and 7).
 *
 * Every result fetched from the store is verified HERE, on the asker's device,
 * against the published signer address and this page's own check (shared/verify.ts).
 * A result that fails is shown as "rejected", never as its claimed outcome.
 */
import { useEffect, useMemo, useState } from "react";
import { challengeHashFor } from "../../../../../shared/verify.ts";
import { CouldNotVerify, Rejected, Verified } from "../../../components/result";
import { Button, Card, ClockIcon, H1, Label, Screen, ButtonLink } from "../../../components/ui";
import { checkCode, fromQuery, verifierPath } from "../../../lib/challenge";
import { expectedFor, pasteMessage, rolesText } from "../../../lib/claims";
import { findServer } from "../../../lib/config";
import { keepPolling, watchForResult, type Outcome } from "../../../lib/outcome";

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;

export function AskerView({ id, query }: { id: string; query: string }) {
  const check = useMemo(() => fromQuery(id, new URLSearchParams(query)), [id, query]);
  const server = check?.method === "discord" ? findServer(check.guildId) : undefined;
  const expected = useMemo(() => (check ? expectedFor(check, server) : null), [check, server]);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [checked, setChecked] = useState(false); // has the store been asked at least once?
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState<"" | "link" | "message">("");

  useEffect(() => setOrigin(window.location.origin), []);
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  // Always look in the store as soon as the page opens, even for an old, expired
  // link (results are kept 30 days). Keep looking only while one could still arrive.
  useEffect(() => {
    if (!check || !expected) return;
    return watchForResult({
      hash: challengeHashFor(check.challengeId),
      expected,
      expiresAt: check.expiresAt,
      nowSec: () => Math.floor(Date.now() / 1000),
      onOutcome: setOutcome,
      onChecked: () => setChecked(true),
    });
  }, [check, expected]);

  if (!check || !expected) {
    return (
      <Screen role="asker">
        <H1>This link isn&rsquo;t valid</H1>
        <p className="mt-3 text-muted">It may be incomplete, or for a Discord server this site doesn&rsquo;t know.</p>
        <div className="mt-8"><ButtonLink href="/new">Start a new check</ButtonLink></div>
      </Screen>
    );
  }

  if (outcome?.kind === "valid") {
    const r = outcome.signed.result;
    return (
      <Screen role="asker">
        {r.status === "verified" ? <Verified check={check} result={r} server={server} nowSec={now} /> : <CouldNotVerify check={check} result={r} server={server} />}
      </Screen>
    );
  }
  if (outcome?.kind === "rejected") return <Screen role="asker"><Rejected problems={outcome.problems} /></Screen>;

  const listening = keepPolling(now, check.expiresAt);
  const link = origin + verifierPath(check);
  const left = check.expiresAt - now;
  const copy = async (what: "link" | "message", text: string) => {
    await navigator.clipboard.writeText(text).catch(() => undefined);
    setCopied(what);
    setTimeout(() => setCopied(""), 2000);
  };
  const title = check.method === "google" ? `Check for ${check.domain}` : `Check for ${rolesText(check.roles)} in ${server?.name}`;

  return (
    <Screen role="asker">
      <H1>Send this link to them</H1>
      <Card className="mt-6">
        <Label>{title}</Label>
        <p className="break-all rounded-2xl bg-slate-100 px-4 py-3 font-mono text-[15px]">{link.replace(/^https?:\/\//, "")}</p>
        <div className="mt-3"><Button onClick={() => copy("link", link)} disabled={left <= 0}>{copied === "link" ? "Copied" : "Copy link"}</Button></div>
        <p className="mt-3 flex items-center gap-2 text-muted">
          <ClockIcon className="h-5 w-5" />
          {left > 0 ? `Expires in ${mmss(left)}` : "This link has expired"}
        </p>
      </Card>

      <Card className="mt-4">
        <Label>Your check code</Label>
        <p className="font-mono text-5xl font-semibold tracking-wider">{checkCode(check.challengeId)}</p>
        <p className="mt-2 text-muted">The result will show this code. If a result shows a different code, ignore it.</p>
      </Card>

      <p className="mt-5 mb-2 text-sm font-semibold text-muted">Message you can paste</p>
      <button
        type="button"
        onClick={() => copy("message", pasteMessage(check, link, server))}
        className="w-full min-w-0 rounded-3xl border-2 border-dashed border-slate-300 bg-white p-4 text-left text-lg [overflow-wrap:anywhere]"
      >
        {pasteMessage(check, link.replace(/^https?:\/\//, ""), server)}
        <span className="mt-2 block text-sm font-semibold text-accent">{copied === "message" ? "Copied" : "Tap to copy"}</span>
      </button>

      <p className="mt-auto flex items-center gap-3 pt-8 text-lg">
        {!checked ? (
          <>Checking for a result&hellip;</>
        ) : listening ? (
          <><span className="h-3.5 w-3.5 animate-pulse rounded-full bg-orange-600" /> Waiting for them to verify&hellip;</>
        ) : (
          <>No result arrived before the link expired. If they didn&rsquo;t try, treat it as &ldquo;could not verify&rdquo;.</>
        )}
      </p>
      {checked && !listening && <div className="mt-4"><ButtonLink href="/new">Start a new check</ButtonLink></div>}
    </Screen>
  );
}
