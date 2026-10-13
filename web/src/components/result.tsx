/** The asker's outcome screens (mockup screens 6 and 7, for both methods). */
import type { ProveItResult } from "../../../shared/verify.ts";
import { roleName } from "../../../shared/discord.ts";
import { explainReason } from "../../../shared/reasons.ts";
import type { Check } from "../lib/challenge";
import { checkCode } from "../lib/challenge";
import type { ServerSettings } from "../lib/config";
import { rolesText, whatToDo } from "../lib/claims";
import { ButtonLink, Card, Label, Notice, Row, ShieldIcon, ShieldXIcon, Tick } from "./ui";

export function timeAgo(issuedAt: number, nowSec: number): string {
  const s = nowSec - issuedAt;
  if (s < 60) return "Just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  return new Date(issuedAt * 1000).toLocaleString();
}

const ageText = { ok: "Older than 90 days", new: "Less than 90 days old", unknown: "Unknown" } as Record<string, string>;
const mono = "font-mono";

type Subject = { discordUsername?: string; discordUserId?: string };

export function Verified({ check, result, server, nowSec }: { check: Check; result: ProveItResult; server?: ServerSettings; nowSec: number }) {
  const subject = (result.subject ?? {}) as Subject;
  return (
    <>
      <div className="rounded-3xl border-2 border-success bg-success-soft p-6 text-center">
        <ShieldIcon className="mx-auto h-14 w-14 text-success" />
        <p className="mt-2 font-heading text-5xl font-bold text-success">Verified</p>
        {check.method === "google" ? (
          <>
            <p className="mt-3 text-success">This person controls a work account at</p>
            <p className={`${mono} mt-2 break-all text-3xl font-semibold text-ink`}>{check.domain}</p>
          </>
        ) : (
          <>
            <p className="mt-3 text-success">{`${roleName(result.provenRole)} in the official server`}</p>
            <p className="mt-1 font-heading text-2xl font-bold text-ink">{server?.name}</p>
          </>
        )}
      </div>

      {check.method === "google" && result.domainAgeFlag === "new" && (
        <div className="mt-4">
          <Notice tone="danger">
            <b>{check.domain}</b> was registered less than 90 days ago. Make sure this is really the company's domain. Lookalike domains are a common scam trick.
          </Notice>
        </div>
      )}

      <Card className="mt-4 py-1">
        {check.method === "discord" && (
          <>
            <Row label="Discord username"><span className={mono}>{subject.discordUsername}</span></Row>
            <Row label="Role">{roleName(result.provenRole)}</Row>
          </>
        )}
        <Row label="Check code"><span className={mono}>{checkCode(check.challengeId)} · matches</span></Row>
        <Row label="Verified">{timeAgo(result.issuedAt, nowSec)}</Row>
        {check.method === "google" && <Row label="Domain age">{ageText[String(result.domainAgeFlag)] ?? "Unknown"}</Row>}
        <Row label="Signature"><span className="text-success">Valid · ProveIt Lit Action</span></Row>
      </Card>

      {check.method === "discord" && (
        <div className="mt-4">
          <Notice tone="info">
            Make sure <b className={mono}>{subject.discordUsername}</b> is the exact account messaging you. Copycats use lookalike names such as {subject.discordUsername}.support.
          </Notice>
        </div>
      )}

      <Card className="mt-4">
        <Label>What this does not prove</Label>
        <p>That their offer is real. This proves who they are, not that what they're asking for is safe. Still never share your seed phrase or run files you weren't expecting.</p>
      </Card>
    </>
  );
}

export function CouldNotVerify({ check, result, server }: { check: Check; result: ProveItResult; server?: ServerSettings }) {
  const subject = (result.subject ?? {}) as Subject;
  const who = subject.discordUsername ? <b className={mono}>{subject.discordUsername}</b> : "This account";
  const serverName = server?.name ?? "the server";
  let detail: React.ReactNode = explainReason(result.reason, check.method);
  if (result.reason === "wrong_domain" && check.method === "google" && result.actualDomain) {
    detail = <>They signed in with an account at <b className={mono}>{String(result.actualDomain)}</b>, not {check.domain}.</>;
  } else if (check.method === "discord" && result.reason === "role_missing") {
    detail = <>{who} is in the server, but has no {rolesText(check.roles)} role.</>;
  } else if (check.method === "discord" && result.reason === "not_member") {
    detail = <>{who} isn&rsquo;t a member of {serverName}.</>;
  }
  return (
    <>
      <div className="rounded-3xl border-2 border-danger bg-danger-soft p-6 text-center">
        <ShieldXIcon className="mx-auto h-14 w-14 text-danger" />
        <p className="mt-2 font-heading text-[2.6rem] font-bold leading-tight text-danger">Could not verify</p>
        <p className="mt-3 text-danger">{detail}</p>
      </div>

      {result.reason === "wrong_domain" && result.domainAgeFlag === "new" && (
        <div className="mt-4">
          <Notice tone="warn">{String(result.actualDomain)} was registered less than 90 days ago. Lookalike domains are a common scam trick.</Notice>
        </div>
      )}
      {check.method === "discord" && (result.reason === "role_missing" || result.reason === "not_member") && (
        <div className="mt-4">
          <Notice tone="warn">Copycats often join the real server and copy a moderator's name and picture. They can't copy the role.</Notice>
        </div>
      )}

      <Card className="mt-4">
        <Label>What to do now</Label>
        <ul>{whatToDo(check.method).map((item) => <Tick key={item.text} ok={item.kind === "do"}>{item.text}</Tick>)}</ul>
      </Card>
      <p className="mt-4 text-sm text-muted">&ldquo;Could not verify&rdquo; means they couldn&rsquo;t prove it. If they refuse to try at all, treat it the same way.</p>
      <div className="mt-auto pt-8"><ButtonLink href="/new">Start a new check</ButtonLink></div>
    </>
  );
}

/** A result whose signature or contents don't check out. Never show its claims. */
export function Rejected({ problems }: { problems: string[] }) {
  return (
    <>
      <div className="rounded-3xl border-2 border-danger bg-danger-soft p-6 text-center">
        <ShieldXIcon className="mx-auto h-14 w-14 text-danger" />
        <p className="mt-2 font-heading text-3xl font-bold text-danger">Result rejected</p>
        <p className="mt-3 text-danger">A result arrived, but it was not genuinely signed by the ProveIt Lit Action for this check. Treat this as &ldquo;could not verify&rdquo;.</p>
      </div>
      <Card className="mt-4">
        <Label>What failed</Label>
        <ul>{problems.map((p) => <Tick key={p} ok={false}>{p}</Tick>)}</ul>
      </Card>
      <div className="mt-auto pt-8"><ButtonLink href="/new">Start a new check</ButtonLink></div>
    </>
  );
}
