"use client";

/**
 * Verify a ProveIt result by hand: paste the asker's own ProveIt link (/r/...) and,
 * optionally, a { result, signature } JSON. With only the link, this fetches the
 * stored result. Either way the check runs in your browser with shared/verify.ts.
 */
import { useState } from "react";
import { canonical } from "../../../../shared/canonical.ts";
import { challengeHashFor, verifyResult, type SignedResult } from "../../../../shared/verify.ts";
import { Button, Card, H1, Label, Screen, Tick } from "../../components/ui";
import { fromQuery } from "../../lib/challenge";
import { expectedFor } from "../../lib/claims";
import { fetchOutcome } from "../../lib/outcome";
import { PROVEIT, findServer } from "../../lib/config";

export default function VerifyByHand() {
  const [link, setLink] = useState("");
  const [pasted, setPasted] = useState("");
  const [out, setOut] = useState<{ valid: boolean; problems: string[]; signed?: SignedResult } | { error: string } | null>(null);

  async function run() {
    setOut(null);
    let url: URL;
    try {
      url = new URL(link.trim());
    } catch {
      return setOut({ error: "Paste your full ProveIt result link (it starts with https:// and contains /r/)." });
    }
    const id = url.pathname.match(/\/[rv]\/([A-Za-z0-9_-]{22})$/)?.[1];
    const check = id ? fromQuery(id, url.searchParams) : null;
    if (!check) return setOut({ error: "That isn't a complete ProveIt link." });
    const server = check.method === "discord" ? findServer(check.guildId) : undefined;
    const expected = expectedFor(check, server);
    if (!expected) return setOut({ error: "This link is for a Discord server this site doesn't know." });

    if (!pasted.trim()) {
      const outcome = await fetchOutcome(challengeHashFor(check.challengeId), expected);
      if (!outcome) return setOut({ error: "No stored result for this check (yet)." });
      return setOut(outcome.kind === "valid" ? { valid: true, problems: [], signed: outcome.signed } : { valid: false, problems: outcome.problems });
    }
    let signed: SignedResult;
    try {
      signed = JSON.parse(pasted);
    } catch {
      return setOut({ error: "The pasted result isn't valid JSON." });
    }
    const v = verifyResult({ result: signed?.result, signature: signed?.signature }, expected);
    setOut({ ...v, signed });
  }

  return (
    <Screen>
      <H1>Verify a result by hand</H1>
      <p className="mt-3 text-muted">
        Everything runs in your browser. A result is genuine only if its signature recovers to the published signer address of the
        ProveIt Lit Action, and it matches the check in your link.
      </p>
      <Card className="mt-6 space-y-4">
        <div>
          <label htmlFor="link" className="mb-2 block font-semibold">Your ProveIt result link</label>
          <input id="link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…/r/…" className="w-full rounded-2xl border-2 border-line px-4 py-3 font-mono text-sm outline-none focus:border-accent" />
        </div>
        <div>
          <label htmlFor="json" className="mb-2 block font-semibold">Signed result JSON (optional)</label>
          <textarea id="json" value={pasted} onChange={(e) => setPasted(e.target.value)} rows={5} placeholder='{"result": {...}, "signature": "0x..."}' className="w-full rounded-2xl border-2 border-line px-4 py-3 font-mono text-xs outline-none focus:border-accent" />
        </div>
        <Button onClick={run}>Verify</Button>
      </Card>

      {out && "error" in out && <p className="mt-4 font-semibold text-danger">{out.error}</p>}
      {out && "valid" in out && (
        <Card className="mt-4">
          <Label>{out.valid ? "Genuine ProveIt result" : "Not a genuine result for this check"}</Label>
          <ul>
            {out.valid ? <Tick ok>Signature valid, matches this check</Tick> : out.problems.map((p) => <Tick key={p} ok={false}>{p}</Tick>)}
          </ul>
          {out.valid && out.signed && (
            <>
              <p className="mt-3 text-sm text-muted">Signed message (canonical JSON):</p>
              <pre className="mt-1 overflow-x-auto rounded-xl bg-slate-100 p-3 text-xs">{canonical(out.signed.result)}</pre>
            </>
          )}
        </Card>
      )}

      <Card className="mt-6">
        <Label>Published signer addresses</Label>
        <p className="break-all font-mono text-xs">Google: {PROVEIT.google.signer} (CID {PROVEIT.google.actionCid})</p>
        <p className="mt-2 break-all font-mono text-xs">Discord: {PROVEIT.discord.signer} (CID {PROVEIT.discord.actionCid})</p>
        <p className="mt-2 text-sm text-muted">Don&rsquo;t just trust this page: re-derive them from the CIDs with the signer-lookup Lit Action (see the README).</p>
      </Card>
    </Screen>
  );
}
