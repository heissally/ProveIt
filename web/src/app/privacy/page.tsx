/**
 * Privacy policy. Rule: say only what is strictly true about this code.
 * If the code changes what it reads, stores or shares, change this page too.
 */
import type { Metadata } from "next";
import { Card, H1, Screen } from "../../components/ui";

export const metadata: Metadata = { title: "Privacy · ProveIt" };

const CONTACT = "salamiademola73@gmail.com";
const UPDATED = "13 October 2026";

const H2 = ({ children }: { children: React.ReactNode }) => <h2 className="mb-2 font-heading text-xl font-bold">{children}</h2>;
const List = ({ items }: { items: React.ReactNode[] }) => (
  <ul className="list-disc space-y-1.5 pl-5">{items.map((item, i) => <li key={i}>{item}</li>)}</ul>
);

export default function Privacy() {
  return (
    <Screen>
      <H1>Privacy</H1>
      <p className="mt-2 text-sm text-muted">Last updated {UPDATED}</p>

      <p className="mt-5 text-lg">
        ProveIt checks one thing about a person (that they control a work Google account at a company domain, or hold a role in an
        official Discord server) and shares only the result. There are no ProveIt accounts, cookies or ads. Visits are
        counted without cookies, as described below.
      </p>

      <div className="mt-6 space-y-4 leading-relaxed">
        <Card>
          <H2>When you verify with Google</H2>
          <List
            items={[
              "You sign in on Google's own page. Your password goes only to Google.",
              "Google gives the ProveIt Lit Action (a published program running inside Lit Protocol's sealed enclave) a one-time sign-in. The action reads only your account's company domain (Google's “hd” field), whether your email is verified, and a check number that ties the sign-in to this one ProveIt link.",
              "It shares only the result: the company domain (or that there was none), the time, whether the domain was registered in the last 90 days, and a short reason if the check didn't pass. Your name, email address and Google user ID are never shared or stored.",
            ]}
          />
        </Card>

        <Card>
          <H2>When you verify with Discord</H2>
          <List
            items={[
              "You sign in on Discord's own page. Your password goes only to Discord.",
              "Discord asks to let ProveIt know who you are and read your member info in your servers (Discord has no one-server option). The Lit Action looks only at the one server you were asked about. It never requests your list of servers.",
              "It shares only the result: your Discord username and user ID (so the person who asked can match it to the account messaging them), whether you hold the role they asked about in that server, and a short reason if the check didn't pass. Your email, nickname and other servers are never shared or stored.",
            ]}
          />
        </Card>

        <Card>
          <H2>What ProveIt stores, and for how long</H2>
          <List
            items={[
              "The signed result described above, in an Upstash Redis database in Frankfurt, Germany. It is deleted automatically after 30 days.",
              "Anyone who has the ProveIt link for that check (the person who asked, and you) can see its result during those 30 days.",
              "To limit how many checks run, a counter keyed by a salted hash of your IP address (never the address itself). It is deleted automatically after 10 minutes.",
              "While you are away on Google's or Discord's page, your browser tab keeps a temporary note of the check, which is removed when you come back or close the tab.",
              "The one-time sign-in and any Google or Discord tokens are used once inside the Lit enclave and are never stored or returned.",
              "Daily totals of how many ProveIt links were created and how many checks ended Verified or Could not verify, for each method (Google or Discord). These are plain numbers, with no check IDs, domains, usernames or IP addresses, and they are deleted automatically after about 13 months.",
            ]}
          />
        </Card>

        <Card>
          <H2>Visitor statistics</H2>
          <p>
            ProveIt uses Vercel Web Analytics to count visits, without cookies. For each page view it records the type of page,
            the website you came from, your approximate location (country, region and city), and your browser, operating
            system and device type. Before anything is sent, ProveIt removes check IDs, claimed domains and servers, and
            sign-in codes from the page address, so only the page type (for example &ldquo;/v/[id]&rdquo;) is recorded.
            Vercel recognises repeat visits with a hash that is discarded after 24 hours, and the data is not tied to your IP
            address. It is used only for totals.
          </p>
        </Card>

        <Card>
          <H2>Who handles what</H2>
          <List
            items={[
              "Google or Discord: your sign-in.",
              "Lit Protocol: runs the check inside its enclave. ProveIt asks Lit not to keep the request in its server logs.",
              "Vercel: hosts this website, counts visits (Web Analytics, described above) and may keep standard request logs under its own policy.",
              "Upstash: stores the signed results, rate-limit counters and daily totals described above.",
            ]}
          />
          <p className="mt-3">ProveIt does not sell, rent or share data with anyone else.</p>
        </Card>

        <Card>
          <H2>An honest limit</H2>
          <p>
            Your one-time sign-in passes through ProveIt&rsquo;s server on its way to the Lit Action. The published code only forwards
            it and never keeps it. Nobody, including whoever runs ProveIt, can fake a result: only the published Lit Action can sign
            one. But you are trusting that this website runs the published code. Its exact fingerprints are listed on the{" "}
            <a className="text-accent underline" href="/verify">Verify page</a>.
          </p>
        </Card>

        <Card>
          <H2>Google user data</H2>
          <p>
            ProveIt&rsquo;s use of information received from Google APIs adheres to the{" "}
            <a className="text-accent underline" href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements. It is used only to produce the result above, and is never transferred, sold or
            used for anything else.
          </p>
        </Card>

        <Card>
          <H2>Questions or deletion</H2>
          <p>
            Results delete themselves after 30 days. To ask for one to be deleted sooner, or for any question, email{" "}
            <a className="text-accent underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>.
          </p>
        </Card>
      </div>
    </Screen>
  );
}
