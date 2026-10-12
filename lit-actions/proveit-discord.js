// ProveIt · Discord role check
//
// Proves "this Discord account has <role> in <official server>". Runs inside Lit's TEE:
//   1. check the inputs; the server must be in the registry written into this file
//   2. LIT: open the PKP safe that holds our Discord client secret
//   3. trade the one-time sign-in code for a Discord access token, directly over TLS
//   4. ask Discord who signed in (user ID and username)
//   5. ask Discord for that account's roles in that one server
//   6. LIT: sign the result with this action's own key
// The username and user ID are returned ON PURPOSE, so the asker can check it is the
// exact account messaging them. Nothing else is returned, and never the token.
//
// js_params: { code, codeVerifier, redirectUri, challengeId, guildId, roles, expiresAt }
//   roles: the labels that count: ["Mod"], ["Admin"] or ["Admin", "Mod"]

// ---- ProveIt config: public values only, written by scripts/deploy-action.ts ----
const CONFIG = {
  "clientId": "1558835182889467954",
  "pkpId": "0xc6f43ac3a9d2515cada59be8b48790cdaabc1e06",
  "encryptedClientSecret": "70ea928ce47197791e6a277f517dc0791d3bdd580be38704fd110275dba93d2b865bd6cfa7ee5669b5dd473abdf04b020654aa3d916d3b5ca262acae",
  "redirectUris": [
    "http://localhost:3000/callback/discord",
    "https://prove-it.com.ng/callback/discord"
  ],
  "servers": {
    "1373039981890900099": {
      "name": "heis_sallyy's server",
      "roles": {
        "1558833453292724345": "Mod",
        "1558963704240930896": "Admin"
      }
    }
  }
};
// ---- end ProveIt config ----

const RESULT_TYPE = "proveit.result.v1";
const MAX_LINK_LIFETIME_SEC = 15 * 60;
const CLOCK_SKEW_SEC = 60;
const LABELS = ["Admin", "Mod"]; // also the order claimed roles are listed in
// Who you are, and your member info (roles) in servers. Never the list of your servers.
const SCOPES = ["identify", "guilds.members.read"];
const API = "https://discord.com/api/v10";
const UA = { "User-Agent": "ProveIt/0.1 (Lit Action)" };
const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

async function main(params) {
  const input = validateInput(params);
  if (!input) return { ok: false, error: "invalid_input" };

  const now = Math.floor(Date.now() / 1000);
  if (input.expiresAt > now + MAX_LINK_LIFETIME_SEC + CLOCK_SKEW_SEC) return { ok: false, error: "invalid_input" };
  const server = CONFIG.servers[input.guildId];
  const base = {
    claim: { guildId: input.guildId, guildName: server.name, roles: input.roles },
    challengeHash: ethers.utils.sha256(ethers.utils.toUtf8Bytes(input.challengeId)),
    issuedAt: now,
    expiresAt: input.expiresAt,
  };
  if (input.expiresAt <= now) return sign(base, "not_verified", "expired");

  // LIT: decrypt the Discord client secret. Lit allows this only because this
  // exact code's CID is in a group with this PKP. The secret never leaves the TEE.
  let clientSecret;
  try {
    clientSecret = await Lit.Actions.Decrypt({ pkpId: CONFIG.pkpId, ciphertext: CONFIG.encryptedClientSecret });
  } catch (err) {
    return { ok: false, error: "config_error" };
  }

  const token = await exchangeCode(input, clientSecret);
  const fail = (providerError) => sign({ ...base, providerError }, "not_verified", "provider_error");
  if (token.error) return fail(token.error);

  const me = await discordGet("/users/@me", token.accessToken);
  if (!me.ok || typeof me.body.id !== "string" || typeof me.body.username !== "string") {
    return fail(`discord_me_${me.status}`);
  }
  const who = { ...base, subject: { discordUserId: me.body.id, discordUsername: me.body.username } };

  // Roles in this one server. Discord returns role IDs only; the registry says which
  // IDs mean what, so a role merely NAMED "Mod" in a copycat server never counts.
  const member = await discordGet(`/users/@me/guilds/${input.guildId}/member`, token.accessToken);
  if (member.status === 404) return sign(who, "not_verified", "not_member");
  if (!member.ok || !Array.isArray(member.body.roles)) return fail(`discord_member_${member.status}`);
  const held = member.body.roles.map((id) => (has(server.roles, id) ? server.roles[id] : null));
  const proven = input.roles.find((l) => held.includes(l));
  if (proven) return sign({ ...who, provenRole: proven }, "verified", "ok");
  return sign(who, "not_verified", "role_missing");
}

function validateInput(p) {
  if (!p || typeof p !== "object") return null;
  if (typeof p.guildId !== "string" || !/^\d{17,20}$/.test(p.guildId) || !has(CONFIG.servers, p.guildId)) return null;
  const offered = Object.values(CONFIG.servers[p.guildId].roles);
  const r = p.roles;
  if (!Array.isArray(r) || r.length === 0 || new Set(r).size !== r.length) return null;
  // Every claimed label must be one this server's registry defines.
  if (!r.every((l) => LABELS.includes(l) && offered.includes(l))) return null;
  if (typeof p.challengeId !== "string" || !/^[A-Za-z0-9_-]{22}$/.test(p.challengeId)) return null;
  if (typeof p.code !== "string" || p.code.length < 10 || p.code.length > 2048) return null;
  if (typeof p.codeVerifier !== "string" || !/^[A-Za-z0-9._~-]{43,128}$/.test(p.codeVerifier)) return null;
  if (!CONFIG.redirectUris.includes(p.redirectUri)) return null;
  if (!Number.isSafeInteger(p.expiresAt)) return null;
  const roles = LABELS.filter((l) => r.includes(l)); // one fixed order, so the asker's claim matches
  return { guildId: p.guildId, roles, challengeId: p.challengeId, code: p.code, codeVerifier: p.codeVerifier, redirectUri: p.redirectUri, expiresAt: p.expiresAt };
}

// Trade the sign-in code for an access token. Returns { accessToken } or { error }.
// The error is a short code only, never Discord's free-text description.
async function exchangeCode(input, clientSecret) {
  let res;
  try {
    res = await fetch(`${API}/oauth2/token`, {
      method: "POST",
      headers: { ...UA, "Content-Type": "application/x-www-form-urlencoded" },
      body: formEncode({
        grant_type: "authorization_code",
        code: input.code,
        code_verifier: input.codeVerifier,
        redirect_uri: input.redirectUri,
        client_id: CONFIG.clientId,
        client_secret: clientSecret,
      }),
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    return { error: "discord_unreachable" };
  }
  const body = (await res.json().catch(() => null)) || {};
  if (!res.ok) {
    const code = typeof body.error === "string" && /^[a-z_]{1,40}$/.test(body.error) ? body.error : "unknown";
    return { error: `discord_${res.status}_${code}` };
  }
  if (typeof body.access_token !== "string") return { error: "no_access_token" };
  const granted = String(body.scope || "").split(" ");
  if (!SCOPES.every((s) => granted.includes(s))) return { error: "missing_scope" };
  return { accessToken: body.access_token };
}

async function discordGet(path, accessToken) {
  try {
    const res = await fetch(API + path, {
      headers: { ...UA, Authorization: `Bearer ${accessToken}` },
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    return { ok: res.ok, status: res.status, body: (await res.json().catch(() => null)) || {} };
  } catch (err) {
    return { ok: false, status: 0, body: {} };
  }
}

async function sign(fields, status, reason) {
  const result = { ...fields, v: 1, type: RESULT_TYPE, method: "discord", status, reason };
  // LIT: this action's own key, derived inside the TEE from this file's CID.
  // Only this exact code can produce signatures from its address.
  const wallet = new ethers.Wallet(await Lit.Actions.getLitActionPrivateKey());
  const signature = await wallet.signMessage(canonical(result));
  return { ok: true, result, signature, signer: wallet.address };
}

function formEncode(fields) {
  return Object.entries(fields).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
}

// Identical to shared/canonical.ts (a test checks they agree): sorted keys, safe integers only.
function canonical(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (Number.isSafeInteger(value) && !Object.is(value, -0)) return String(value);
    throw new Error("canonical: only safe integers are allowed");
  }
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return "{" + entries.map(([k, v]) => JSON.stringify(k) + ":" + canonical(v)).join(",") + "}";
  }
  throw new Error("canonical: unsupported value");
}
