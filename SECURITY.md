# Security

ProveIt answers one question about a stranger: *do they control a work Google account at this
company domain*, or *do they hold this role in this official Discord server?* This page explains
what that answer guarantees, what it does not, and how each part is protected.

Report a vulnerability privately to **salamiademola73@gmail.com**. Please don't open a public
issue for security problems.

---

## The core guarantee

**Only the published ProveIt Lit Actions can produce a valid signed result.**

- Each check runs inside a Lit Action, an immutable JavaScript program executed in
  [Lit Protocol](https://developer.litprotocol.com)'s TEE (a sealed, attested enclave).
- The action signs its result with its **own key**, which Lit's key service derives from the
  action's CID (a hash of its exact code). Change one byte of the code and the key changes.
  No person, including whoever runs ProveIt, ever holds this key.
- The asker's device checks the signature against the **published signer address** for that
  action, and checks that the result belongs to *their* check (`shared/verify.ts`).

So a "Verified" result cannot be forged: not by the stranger, not by the results database, and
not by the ProveIt operator.

**What that guarantee is about:** the *signed result*. The asker's result page is served by the
ProveIt website. A dishonest operator could serve a page that *displays* "Verified" without a
real result. The defences are that the code is source-available (anyone may read it, see
[LICENSE](LICENSE)), the signer addresses are published
(README, `/verify`), and anyone can verify a result by hand without trusting this website (see
the README).

### Current actions

| Method | CID | Signer address |
| --- | --- | --- |
| Google | `QmUsphNDzVSDQ8m9wE6vRVcZk9PfExQHo1N9S8PQmAJUoh` | `0x961a516123667e47dd7466bbf23ecce0013ecfee` |
| Discord | `QmZkED3sSjvo31mQioqasBEaPU8twyJRTT5VTM8mjPYZFg` | `0x140ffa2e09f023f7c390f1f2cba49e728c87d7bf` |

These change whenever an action's code or settings change. `config/lit.json` always holds the
current values.

---

## Who is trusted for what

| Part | Trusted for | Not trusted for |
| --- | --- | --- |
| The published Lit Actions (by CID) | Doing the check correctly and signing only what they checked | — |
| Lit Protocol's TEE and key service | Running exactly that code; keeping action keys and PKP keys secret | — |
| Google / Discord | Telling the truth about the account that signed in | — |
| ProveIt website + server function (operator) | Privacy: forwarding the sign-in to Lit without keeping it; serving the published page code | Result integrity: it cannot sign results |
| Upstash results store | Availability | Anything else: every read is signature-checked |
| rdap.org / domain registries | A domain-age *hint* only | Never decides Verified / Could not verify |

---

## Attacks ProveIt is designed to stop

| Attack | Defence |
| --- | --- |
| Faking a "Verified" result | Only the action's CID-derived key can sign; the asker checks the signer address |
| Editing a stored result (e.g. "not_verified" → "verified") | The signature no longer matches; the page shows **Result rejected** (also for unreadable records) |
| Reusing a genuine result from another check | `challengeHash = SHA-256(challengeId)` must match the asker's own link |
| Google sign-in made for a different check | The Google sign-in `nonce` must equal `SHA-256(challengeId)` |
| The stranger edits the link to their own company or server | The asker's page compares the signed claim and expiry with the asker's own link |
| Personal Gmail registered with a `@company.com` email | Only Google's `hd` (Workspace domain) claim counts, never the email suffix |
| Lookalike domains (`coinbase-careers.com`) | Exact `hd` match; the actual domain and its age are shown, with a red warning under 90 days |
| Copycat Discord server | Only servers in `registry/servers.json`, written into the action's code, can be checked |
| Copycat role named "Mod" | Roles count only by their registered **role ID**, never by name |
| Lookalike Discord username (`kai.lit.support`) | The real username is in the signed result, with a warning to compare it with the account messaging you |
| Stealing the OAuth client secrets | They exist only encrypted with a PKP; Lit decrypts them only for the action CIDs in that PKP's group |
| Swapping the secret, client ID or registry at call time | They are written into the action's code (part of its CID), not passed by the caller |
| Using the website's Lit usage key to run other code | A usage key can run only the CIDs in its groups; it is execute-only and held server-side |
| Burning Lit credits | Rate limits per (hashed) IP and per day before Lit is called |
| Expired links | Links last 15 minutes; the action refuses later expiry and signs "expired" |

---

## Residual risks (honest limits)

- **A real insider is the scammer.** ProveIt proves *who* someone is, not that what they want is
  safe. A real employee or real mod can still be a scammer.
- **A real employee or mod is tricked into verifying for someone else.** A scammer can forward the
  link to a real person and pass their result off as their own.
  - **Discord:** the signed result shows the username, so the asker can see it isn't the account
    messaging them. There is no Discord equivalent of Google's nonce, so this check by eye is the
    protection.
  - **Google:** results show only the company domain, so this attack is harder to spot. The
    verifier page warns "Only continue if you are personally talking with the person who sent you
    this link", and both sides see the same check code.
- **A compromised Google or Discord account** passes the check like the real one.
- **The domain is only as meaningful as the domain.** "Works at a company" means "controls an
  account in that Google Workspace". Anyone can create a Workspace for a domain they own, so the
  asker must type the real company domain themselves (the page tells them to).
- **Domain age is advisory.** It comes from rdap.org and domain registries, outside the TEE's trust
  boundary, and a failed lookup shows "unknown".
- **Roles can change.** A result says what was true at sign-in time.
- **Privacy depends on the website running the published code.** The one-time sign-in code passes
  through ProveIt's server function on its way to Lit. The operator also controls the Google and
  Discord OAuth apps (and could create new client secrets). A dishonest operator could therefore
  use a sign-in code first and learn who signed in. Lit's check would then fail, but the privacy
  would already be lost. Integrity is unaffected: they still cannot sign a result.
- **The Lit account owner** can add other action CIDs to the PKP groups. Such code could open the
  locked OAuth client secrets, but it cannot sign as the published ProveIt actions. Moving the
  account to Lit's ChainSecured mode (on-chain, multisig-controlled groups) would make such
  changes publicly auditable.
- **Discord's `guilds.members.read` scope** lets the access token read member info in every server
  the user is in. The token stays inside the TEE, and the action reads only the one registered
  server.
- **The actions also accept `localhost` callbacks**, so developers can run ProveIt locally against
  the same actions. This does not weaken result integrity.
- **Availability** depends on Lit, Vercel, Upstash, Google and Discord.

---

## Data

See the [privacy page](https://prove-it.com.ng/privacy). In short:

- Signed results are kept for 30 days.
- Rate-limit counters hold a salted IP hash for 10 minutes.
- There are no accounts or cookies.
- Visits are counted with cookieless Vercel Web Analytics. Check IDs, claimed domains and servers,
  and sign-in codes are removed from page addresses in the browser before anything is sent
  (`web/src/lib/analytics-redact.ts`).
- Daily totals of links created and Verified / Could not verify results are kept as plain numbers
  for about 13 months, viewable only with the maintainer's stats password.
- Names, emails, Google IDs, tokens and passwords are never stored or shared.
