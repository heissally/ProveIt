"use client";

/** Private usage counts for the maintainer. Needs the STATS_PASSWORD set in Vercel. */
import { useState } from "react";
import { Button, Card, H1, Label, Screen } from "../../components/ui";

type Counts = Record<"link_created" | "verified" | "not_verified", Record<"google" | "discord", number>>;
interface Stats {
  days: number;
  totals: Counts;
  perDay: Array<{ date: string; counts: Counts }>;
}

const sum = (c: Counts, e: keyof Counts) => c[e].google + c[e].discord;

export function StatsView() {
  const [password, setPassword] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    const res = await fetch("/api/stats", { headers: { Authorization: `Bearer ${password}` }, cache: "no-store" }).catch(() => null);
    if (!res) return setError("Couldn't reach ProveIt.");
    if (res.status === 401) return setError("That password isn't right, or STATS_PASSWORD isn't set in Vercel yet.");
    if (!res.ok) return setError("The stats store didn't answer. Try again in a minute.");
    setStats(await res.json());
  }

  return (
    <Screen>
      <H1>ProveIt stats</H1>
      <p className="mt-2 text-muted">Private. Daily counts only: no IDs, domains, usernames or IP addresses.</p>

      {!stats ? (
        <Card className="mt-6 space-y-3">
          <label htmlFor="stats-password" className="block font-semibold">Stats password</label>
          <input
            id="stats-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
            className="w-full rounded-2xl border-2 border-line px-4 py-3 outline-none focus:border-accent"
          />
          <Button onClick={load} disabled={!password}>Show stats</Button>
          {error && <p className="font-semibold text-danger">{error}</p>}
        </Card>
      ) : (
        <>
          <Card className="mt-6">
            <Label>Last {stats.days} days</Label>
            <div className="grid grid-cols-3 gap-3 text-center">
              {(
                [
                  ["Links created", "link_created"],
                  ["Verified", "verified"],
                  ["Could not verify", "not_verified"],
                ] as const
              ).map(([label, key]) => (
                <div key={key} className="rounded-2xl bg-page p-3">
                  <p className="font-heading text-3xl font-bold tabular-nums">{sum(stats.totals, key)}</p>
                  <p className="text-sm text-muted">{label}</p>
                  <p className="mt-1 text-xs text-muted tabular-nums">G {stats.totals[key].google} · D {stats.totals[key].discord}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="mt-4 overflow-x-auto">
            <Label>By day (G = Google, D = Discord)</Label>
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="text-left text-muted">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Links</th>
                  <th className="py-2 pr-3">Verified</th>
                  <th className="py-2">Could not verify</th>
                </tr>
              </thead>
              <tbody>
                {stats.perDay
                  .filter((d) => sum(d.counts, "link_created") + sum(d.counts, "verified") + sum(d.counts, "not_verified") > 0)
                  .map((d) => (
                    <tr key={d.date} className="border-t border-line">
                      <td className="py-2 pr-3">{d.date}</td>
                      {(["link_created", "verified", "not_verified"] as const).map((e) => (
                        <td key={e} className="py-2 pr-3">{sum(d.counts, e)} <span className="text-muted">(G {d.counts[e].google} · D {d.counts[e].discord})</span></td>
                      ))}
                    </tr>
                  ))}
              </tbody>
            </table>
            {stats.perDay.every((d) => sum(d.counts, "link_created") + sum(d.counts, "verified") + sum(d.counts, "not_verified") === 0) && (
              <p className="py-2 text-muted">Nothing counted yet.</p>
            )}
          </Card>
          <p className="mt-4 text-sm text-muted">Page views and visitors are in Vercel: your project → Analytics.</p>
        </>
      )}
    </Screen>
  );
}
