"use client";

/** Screen 1 (asker): choose what the stranger claims, then create the ProveIt link. */
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { roleName, sortRoles, type RoleLabel } from "../../../../shared/discord.ts";
import { Button, Card, LockIcon, Screen, H1 } from "../../components/ui";
import { LINK_LIFETIME_SEC, askerPath, newChallengeId, normalizeDomain, type Check } from "../../lib/challenge";
import { officialSourceText } from "../../lib/claims";
import { ADD_SERVER_HREF, PROVEIT, offeredServers } from "../../lib/config";

type Method = "google" | "discord";

function Choice({ selected, onSelect, title, hint, disabled }: { selected: boolean; onSelect: () => void; title: string; hint: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={`flex w-full items-center gap-4 rounded-2xl border-2 p-4 text-left disabled:opacity-50 ${selected ? "border-accent bg-accent-soft/50" : "border-line"}`}
    >
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${selected ? "border-accent" : "border-slate-400"}`}>
        {selected && <span className="h-3 w-3 rounded-full bg-accent" />}
      </span>
      <span>
        <span className="block text-lg font-semibold">{title}</span>
        <span className="block text-muted">{hint}</span>
      </span>
    </button>
  );
}

export default function NewCheck() {
  const router = useRouter();
  // Hidden test servers appear only on /new?test (read after load, so the page stays static).
  const [servers, setServers] = useState(() => offeredServers(PROVEIT.servers, ""));
  const [method, setMethod] = useState<Method>("google");
  const [domainInput, setDomainInput] = useState("");
  const [guildId, setGuildId] = useState(servers[0]?.guildId ?? "");
  const server = servers.find((s) => s.guildId === guildId);
  const source = officialSourceText(server);
  const [roles, setRoles] = useState<RoleLabel[]>(server?.roles ?? []);
  const [error, setError] = useState("");

  const pickServer = (id: string) => {
    setGuildId(id);
    setRoles(PROVEIT.servers.find((s) => s.guildId === id)?.roles ?? []);
  };
  useEffect(() => {
    const offered = offeredServers(PROVEIT.servers, window.location.search);
    setServers(offered);
    if (!guildId && offered[0]) pickServer(offered[0].guildId);
    // Runs once on load: ?test never changes without a page load.
  }, []);
  const toggleRole = (r: RoleLabel) => setRoles((cur) => sortRoles(cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]));

  function create() {
    setError("");
    const challengeId = newChallengeId();
    const expiresAt = Math.floor(Date.now() / 1000) + LINK_LIFETIME_SEC;
    let check: Check;
    if (method === "google") {
      const domain = normalizeDomain(domainInput);
      if (!domain) return setError("Type a company domain, like company.com.");
      check = { method, challengeId, expiresAt, domain };
    } else {
      if (!server) return setError("Pick an official server.");
      if (roles.length === 0) return setError("Pick at least one role that counts.");
      check = { method, challengeId, expiresAt, guildId: server.guildId, roles };
    }
    // Private daily count of links created (just the method, nothing about the check).
    fetch("/api/stats", { method: "POST", body: JSON.stringify({ event: "link_created", method }), keepalive: true }).catch(() => undefined);
    router.push(askerPath(check));
  }

  return (
    <Screen role="asker">
      <H1>Is this person really who they say?</H1>
      <p className="mt-3 text-lg text-muted">
        Got a DM from a &ldquo;recruiter&rdquo;, &ldquo;moderator&rdquo; or &ldquo;support agent&rdquo;? Check them before you click anything they send.
      </p>

      <Card className="mt-7">
        <p className="mb-3 font-semibold">What are they claiming?</p>
        <div className="space-y-3">
          <Choice selected={method === "google"} onSelect={() => setMethod("google")} title="Works at a company" hint="Proved with their work Google account" />
          <Choice
            selected={method === "discord"}
            onSelect={() => setMethod("discord")}
            title="Admin or Moderator in a Discord server"
            hint={servers.length ? "Proved with their role in the official server" : "No official servers registered yet"}
            disabled={servers.length === 0}
          />
        </div>

        {method === "google" ? (
          <div className="mt-6">
            <label htmlFor="domain" className="mb-2 block font-semibold">Company website</label>
            <input
              id="domain"
              value={domainInput}
              onChange={(e) => setDomainInput(e.target.value)}
              placeholder="company.com"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="url"
              className="w-full rounded-2xl border-2 border-line px-4 py-3.5 font-mono text-xl outline-none focus:border-accent"
            />
            <p className="mt-2 text-muted">Type the real company domain yourself. Never use one they gave you.</p>
          </div>
        ) : (
          <div className="mt-6">
            <label htmlFor="server" className="mb-2 block font-semibold">Official Discord server</label>
            <select
              id="server"
              value={guildId}
              onChange={(e) => pickServer(e.target.value)}
              className="w-full rounded-2xl border-2 border-line bg-white px-4 py-3.5 text-lg outline-none focus:border-accent"
            >
              {servers.map((s) => <option key={s.guildId} value={s.guildId}>{s.name}</option>)}
            </select>
            {source && (
              <p className="mt-2">
                <a className="font-semibold text-success underline-offset-2 hover:underline" href={source.href} target="_blank" rel="noreferrer">
                  {source.text} <span aria-hidden="true">↗</span>
                </a>
              </p>
            )}
            <p className="mt-3 text-muted">
              For your safety, you can only choose from official servers we&rsquo;ve checked. Invite links from the
              person messaging you are never used, because scammers can copy any server.{" "}
              Don&rsquo;t see your project&rsquo;s server? <a className="text-accent underline" href={ADD_SERVER_HREF}>Ask for it to be added.</a>
            </p>
            <p className="mt-4 mb-2 font-semibold">Roles that count</p>
            <div className="flex flex-wrap gap-2">
              {(server?.roles ?? []).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => toggleRole(r)}
                  aria-pressed={roles.includes(r)}
                  className={`rounded-full px-4 py-2 font-semibold ${roles.includes(r) ? "bg-accent text-white" : "bg-slate-100 text-ink"}`}
                >
                  {roleName(r)}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && <p className="mt-4 font-semibold text-danger">{error}</p>}
        <div className="mt-6"><Button onClick={create}>Create ProveIt link</Button></div>
      </Card>

      <p className="mt-auto flex items-center gap-3 pt-10 text-muted">
        <LockIcon className="h-6 w-6 shrink-0" />
        {method === "google" ? "Their email is never shown to you, or to us." : "Only their username and role are shared."}
      </p>
    </Screen>
  );
}
