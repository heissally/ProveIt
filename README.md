# ProveIt

**A "prove it" link for strangers in your DMs.** Someone claims to work at a company, or to be an
admin or mod in a project's Discord? Send them a ProveIt link. They sign in on Google's or
Discord's own page, a [Lit Protocol](https://developer.litprotocol.com) Lit Action checks the
answer inside a sealed enclave, and you get **Verified** or **Could not verify**. Nobody can
forge a "Verified" result, including whoever runs ProveIt.

**Live:** https://prove-it.com.ng

<!-- Demo videos go here: Google flow and Discord flow (see "Demo" below). -->

---

## The problem

Scammers impersonate company staff and community admins and mods:

- fake support or mods DM people right after they ask a question, then send wallet-drainer links;
- fake recruiters send "take-home projects" that contain wallet-stealing malware;
- fake admins and team members ask for payments or seed phrases.

Names and profile pictures are easy to copy. **Company accounts and real Discord roles are not.**

## What a check proves, and what it doesn't

| Check | Proves | Shows the asker | Does not prove |
| --- | --- | --- | --- |
| **Works at a company** | They control a Google Workspace account whose domain (`hd`) is the domain *you* typed | Only the domain, its age, and the time; never their name or email | Their job title, or that their offer is real |
| **Admin or mod in a Discord server** | Their Discord account holds that role (by role ID) in an official, registered server | Their Discord username and the role | That the account messaging you is this one (compare the username yourself) |

"Could not verify" means they couldn't prove it. If they refuse to try at all, treat it the same
way. See [SECURITY.md](SECURITY.md) for the full threat model and its honest limits.

---

## How Lit Protocol makes this work

ProveIt runs on Lit's **Chipotle** network. Every place in the code where Lit does the work is
marked with a `// LIT:` comment.

```mermaid
sequenceDiagram
    autonumber
    participant A as Asker's browser
    participant V as Verifier's browser
    participant P as Google / Discord
    participant S as ProveIt server function
    participant L as Lit Action (inside Lit's TEE)
    participant R as Results store (untrusted)

    A->>A: make a check: random challengeId + the claim (domain, or server + roles)
    A-->>V: send the link /v/<challengeId>?…
    V->>P: sign in on the provider's own page (PKCE; Google also gets nonce = SHA-256(challengeId))
    P-->>V: one-time code
    V->>S: code + PKCE verifier + the check
    S->>L: run the exact action code (by CID) with the usage key
    Note over L: LIT: decrypt the OAuth client secret (PKP + group)<br/>exchange the code with the provider over TLS<br/>check the answer (hd / role IDs, nonce, expiry)<br/>LIT: sign the result with the action's own key
    L-->>S: { result, signature }
    S->>R: store under SHA-256(challengeId), 30 days
    A->>R: poll
    R-->>A: { result, signature }
    A->>A: verify: signer = published address, same check, same claim and expiry
```

### What runs inside Lit's TEE

| Step | Where | Why it matters |
| --- | --- | --- |
| Opening the OAuth client secret | Lit Action | The plain secret never exists outside the enclave |
| Trading the sign-in code with Google/Discord | Lit Action, over TLS | The answer comes straight from the provider; nobody can feed it a fake one |
| Checking `hd`, `nonce`, expiry, role IDs | Lit Action | The rules are in the action's immutable code |
| Signing the result | Lit Action, with its own key | Only this exact code can produce this signature |
| Creating the check, showing results | Browser | Untrusted; the asker's device re-checks every signature |
| Running the action, storing results | ProveIt server function + Upstash | Untrusted for integrity: they can't create or alter a valid result |

The two actions are short, single files written to be audited:
[`lit-actions/proveit-google.js`](lit-actions/proveit-google.js) and
[`lit-actions/proveit-discord.js`](lit-actions/proveit-discord.js).

### 1. Immutable code, identified by its CID

A Lit Action is identified by its **CID**, a hash of its exact source. Chipotle hashes the code
you send on every call and runs it only if your API key may execute in a group containing that
CID. There is no separate upload: the code in this repo *is* the deployed action. Recompute
the CIDs yourself with `npm run lit:cids`, or paste a file into the Lit Dashboard's Action
Runner and click **Get Lit Action IPFS CID**.

Each action's settings are written into its own code, in the `CONFIG` block at the top:

- the OAuth client ID;
- the PKP address;
- the encrypted client secret;
- the allowed redirect addresses;
- for Discord, the registry of official servers and role IDs.

So they are part of its CID, and nobody calling it can swap them.

### 2. Secrets locked with PKPs and groups

The Google and Discord OAuth client secrets are encrypted once with
`Lit.Actions.Encrypt`, using a **PKP** (a key that lives only inside Lit's TEE) as a safe:

- **One PKP per secret.** The Google safe and the Discord safe are separate.
- **One group per safe.** Each **group** lists exactly one PKP and the one action CID allowed to
  open it. Lit checks this on every `Lit.Actions.Decrypt`.
- **The ciphertext can be public.** It's committed in this repo, because only the listed action
  can decrypt it.
- **Changed code can't open the safe.** A new version has a new CID, which isn't in the group
  until the account owner adds it. Milestone 2's test proves it: an identical copy of a test
  action with one extra comment line was refused.

### 3. Results signed with the action's own key

`Lit.Actions.getLitActionPrivateKey()` returns a key that Lit's key service derives from the
running action's CID. ProveIt signs the canonical JSON of every result with it (EIP-191
`signMessage`). The matching address, the **signer**, can be looked up for any CID with
[`lit-actions/proveit-signer-lookup.js`](lit-actions/proveit-signer-lookup.js)
(`Lit.Actions.getLitActionWalletAddress`). Change the code and the key changes, so a modified
action can never sign as the published one.

### 4. An execute-only usage key

The website's server function holds a Lit **usage key** that may only *execute* in the two
ProveIt groups. It cannot add actions, add PKPs or change settings. It is kept server-side
(not in browsers) only so nobody can spend the project's Lit credits; it gives no power to fake
anything. Calls are sent with `X-Privacy-Mode: true`, so Lit doesn't keep the sign-in code in
its server logs.

---

## Verify a result yourself

You don't have to trust the ProveIt website. Three levels, from quick to fully independent:

1. **In the browser:** paste your ProveIt link into https://prove-it.com.ng/verify. The check runs
   in your browser with [`shared/verify.ts`](shared/verify.ts).
2. **On your own computer, without the website's pages:**
   ```bash
   git clone https://github.com/heissally/ProveIt && cd ProveIt && npm install
   npm run verify:result -- "https://prove-it.com.ng/r/<id>?…"
   ```
   This downloads the stored `{ result, signature }`, then:
   - rebuilds the exact signed text (canonical JSON: sorted keys, integers only);
   - recovers the signer and compares it with the published address;
   - checks the challenge hash, the claim and the expiry against your link.
3. **Re-derive the signer address from the code:**
   1. Run `npm run lit:cids` and compare the production CIDs with the table below.
   2. With your own Lit account, add `proveit-signer-lookup.js`'s CID to a group your key can
      execute in.
   3. Run it in the Dashboard's Action Runner with `{"cid": "<the action CID>"}`. It returns that
      action's `walletAddress`.
   4. Pass it to `npm run verify:result -- "<link>" --signer <address>`.

| Action | CID | Signer address |
| --- | --- | --- |
| Google | `QmUsphNDzVSDQ8m9wE6vRVcZk9PfExQHo1N9S8PQmAJUoh` | `0x961a516123667e47dd7466bbf23ecce0013ecfee` |
| Discord | `QmPRsDgjxDPSY4yAayoWMHa7CFPqxhZrApY5Nh2uknnXSe` | `0x359126777c53be99fb4c97730cd6607e4ed331dd` |

A result counts only if **all** of these hold:

1. its signature recovers to the published signer for its method;
2. `challengeHash = SHA-256(challengeId)` from *your own* link;
3. its claim (domain, or server + roles) and expiry match your link;
4. a "verified" result was issued before the link expired.

### The signed result

```json
{
  "v": 1,
  "type": "proveit.result.v1",
  "method": "google",
  "status": "verified",
  "reason": "ok",
  "claim": { "domain": "coinbase.com" },
  "challengeHash": "0x…",
  "issuedAt": 1791110400,
  "expiresAt": 1791111300,
  "domainAgeFlag": "ok"
}
```

**Discord results** have
`"claim": { "guildId", "guildName", "roles": ["Admin", "Mod"] }`,
`"subject": { "discordUsername", "discordUserId" }` and `"provenRole"`.

**Failed checks** say `"status": "not_verified"`, with one of these reasons:

- `no_hd` (no company account)
- `wrong_domain` (plus `actualDomain`)
- `bad_nonce`
- `bad_token`
- `unverified_email`
- `expired`
- `provider_error` (plus a short `providerError` code)
- `role_missing`
- `not_member`

---

## Demo

<!-- Add the recorded Google and Discord flows here. -->

---

## Repository layout

```
lit-actions/proveit-google.js         Google Workspace check (runs in Lit's TEE)
lit-actions/proveit-discord.js        Discord role check (runs in Lit's TEE)
lit-actions/proveit-signer-lookup.js  CID → signer address (public information only)
lit-actions/proveit-encrypt-secret.js locks an OAuth client secret into a PKP safe
lit-actions/probes/                   small test actions from the setup milestones
lit-actions/test/                     tests that run the real action files with fake Lit/Google/Discord
registry/servers.json                 official Discord servers + role ID → label (Admin, Mod)
config/lit.json                       public Lit settings: PKPs, client IDs, ciphertexts, CIDs, signers
shared/                               canonical JSON, result verification, wording, Discord rules
scripts/                              encrypt a secret, deploy an action, live tests, verify a result
web/                                  Next.js website (/new, /v, /r, /verify, /privacy, API routes)
SECURITY.md                           threat model and residual risks
```

## Tests

```bash
npm install
npm test
```

The tests use Vitest and run every success and failure case against the **real action files**:

- **Google:** right domain, wrong domain, lookalike, no `hd`, wrong nonce, expired, and more;
- **Discord:** has role, missing role, not a member, a copycat role ID, and more;
- **Privacy:** nothing personal or secret ever appears in an action's output;
- **Signing:** the action signs exactly the result it returns;
- **Website:** its verification logic and the server function.

---

## Run your own copy

You'll need:

- Node.js 22.18 or newer;
- a [Lit Chipotle](https://dashboard.chipotle.litprotocol.com/dapps/dashboard/) account with
  credits (about 1 credit, $0.01, per check);
- a Google Cloud project;
- a Discord application;
- an [Upstash](https://upstash.com) Redis database (free tier);
- a [Vercel](https://vercel.com) account (free tier).

1. **Clone and install:**
   1. Run `git clone …` and then `npm install`.
   2. Copy `.env.example` to `.env.local` and add your Lit **account** key.
   3. Make a **dev usage key** that can execute in your two groups and in a `tools` group, and add
      it as `LIT_DEV_USAGE_KEY`.
2. **Lit Dashboard setup:**
   1. Create two wallets (PKPs), one per provider, and put their addresses in `config/lit.json`.
   2. Create the groups `proveit-google` and `proveit-discord`. Each lists only its own PKP plus
      the CID of `proveit-encrypt-secret.js`.
   3. Create a `proveit-tools` group with the CID of `proveit-signer-lookup.js`.

   Use `npm run lit:cids` for the CIDs. Never use the "All" options.
3. **OAuth apps:**
   - **Google:** a "Web application" client with scopes `openid email`, and redirect
     `https://<your-domain>/callback/google` (plus `http://localhost:3000/callback/google`).
   - **Discord:** redirect `https://<your-domain>/callback/discord`. Leave Public Client off.
   - Put your server and its role IDs in `registry/servers.json`.
   - Put your redirect addresses in `config/lit.json` → `redirectUris`.
4. **Lock the secrets and deploy the actions:**
   1. Run `npm run secret:encrypt -- google` (it refuses unless the group is clean), then the same
      with `-- discord`.
   2. Run `npm run action:deploy -- google`, then `-- discord`. Each prints its CID, signer and a
      Dashboard to-do: register the CID, tick it in its group, untick the encrypt helper.
5. **Website:**
   1. Copy `web/.env.example` to `web/.env.local`.
   2. Add a separate **execute-only** usage key for the two groups (not `tools`) and your Upstash
      REST URL and token.
   3. Run `npm run dev` and open http://localhost:3000.
6. **Go live:**
   1. Import the repo into Vercel with **Root Directory = `web`**, and add the same three
      environment variables.
   2. The region is set to Frankfurt in [`web/vercel.json`](web/vercel.json); change it to match
      your Upstash region.
   3. Add your domain.
   4. Publish the Google consent screen. It needs a home page and a privacy policy link.

**Any change to an action's code or `CONFIG` changes its CID and signer.** After any change:

1. run `npm run action:deploy -- <method>`;
2. do the Dashboard to-do;
3. run `npm run web:sync` (it also runs before `npm run dev`);
4. commit, and deploy the website.

Rotating a client secret doesn't need a new PKP: tick the encrypt helper again, run
`secret:encrypt`, then deploy.

### Operations notes

- **Google user cap:** the Google consent screen shows a "user cap". It applies to apps using
  sensitive or restricted scopes. ProveIt uses only `openid` and `email`, which are
  non-sensitive. Keep an eye on the count anyway.
- **Matching scopes:** keep the scopes in the code matching the consent screen. Google shows an
  "unverified app" warning if they differ.
- **Rate limits:** set with `PROVEIT_MAX_CHECKS_PER_IP_10MIN` and `PROVEIT_MAX_CHECKS_PER_DAY` in
  the website's environment.

---

## Ideas for contributors

- GitHub organization membership as a third proof method.
- Telegram and X, through official team lists.
- `/proveit` bots for Discord and Telegram.
- "Official links": verified team members register official promo links, and anyone can check
  whether a link was published by the real team.
- Self-service, signed Discord server registration (today, servers are added by hand to
  `registry/servers.json`).
- A searchable server list and "Don't see your project's server? Ask for it to be added".
- Moving the Lit account to ChainSecured mode so group changes are on-chain and auditable.

## Security, privacy and license

- [SECURITY.md](SECURITY.md): what the result guarantees, the trust model, and residual risks.
  Report vulnerabilities privately to salamiademola73@gmail.com.
- [Privacy](https://prove-it.com.ng/privacy): signed results are kept 30 days; there are no
  accounts, cookies or analytics.
- [MIT License](LICENSE).
