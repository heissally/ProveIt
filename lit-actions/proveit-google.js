// ProveIt · Google Workspace check
//
// Proves "this person controls a work Google account at <domain>" without
// revealing who they are. Runs inside Lit's TEE:
//   1. check the inputs, and stop early if anything is malformed
//   2. LIT: open the PKP safe that holds our Google client secret
//   3. trade the one-time sign-in code for Google's ID token, directly over TLS
//   4. check the token: issuer, audience, expiry, nonce, verified email, hd
//   5. look up when the domain was registered, to flag brand-new lookalikes
//   6. LIT: sign the result with this action's own key
// It never returns or logs the email, name, Google user ID (sub) or any token.
//
// js_params: { code, codeVerifier, redirectUri, challengeId, domain, expiresAt }

// ---- ProveIt config: public values only, written by scripts/deploy-action.ts ----
const CONFIG = {
  "clientId": "317187452751-16f5u1j05g9gqulj9ednemdi4enrg1fn.apps.googleusercontent.com",
  "pkpId": "0xe59e58610d4940b5d35b448b6e2a16b1d58965e3",
  "encryptedClientSecret": "8ab8a0d9002309bc1d064c711600b00042683bf21c06de8125148b759e4e051485d33fae7f29b0dc1e30e1c468cec9340f28a3bc589257314fb177f0ff04a4",
  "redirectUris": [
    "http://localhost:3000/callback/google"
  ]
};
// ---- end ProveIt config ----

const RESULT_TYPE = "proveit.result.v1";
const MAX_LINK_LIFETIME_SEC = 15 * 60;
const CLOCK_SKEW_SEC = 60;
const NEW_DOMAIN_DAYS = 90;
const GOOGLE_ISSUERS = ["accounts.google.com", "https://accounts.google.com"];

async function main(params) {
  const input = validateInput(params);
  if (!input) return { ok: false, error: "invalid_input" };

  const now = Math.floor(Date.now() / 1000);
  if (input.expiresAt > now + MAX_LINK_LIFETIME_SEC + CLOCK_SKEW_SEC) {
    return { ok: false, error: "invalid_input" };
  }
  const base = {
    claim: { domain: input.domain },
    challengeHash: "0x" + input.nonce,
    issuedAt: now,
    expiresAt: input.expiresAt,
  };
  if (input.expiresAt <= now) return sign(base, "not_verified", "expired");

  // LIT: decrypt the Google client secret. Lit allows this only because this
  // exact code's CID is in a group with this PKP. The secret never leaves the TEE.
  let clientSecret;
  try {
    clientSecret = await Lit.Actions.Decrypt({
      pkpId: CONFIG.pkpId,
      ciphertext: CONFIG.encryptedClientSecret,
    });
  } catch (err) {
    return { ok: false, error: "config_error" };
  }

  const exchange = await exchangeCode(input, clientSecret);
  if (exchange.error) {
    return sign({ ...base, providerError: exchange.error }, "not_verified", "provider_error");
  }
  const claims = exchange.claims;

  // The token came straight from Google over TLS, so we read its claims directly.
  const issOk = GOOGLE_ISSUERS.includes(claims.iss) && claims.aud === CONFIG.clientId;
  if (!issOk || typeof claims.exp !== "number" || claims.exp <= now) {
    return sign(base, "not_verified", "bad_token");
  }
  // The nonce ties this Google sign-in to this one ProveIt check.
  if (claims.nonce !== input.nonce) return sign(base, "not_verified", "bad_nonce");
  if (claims.email_verified !== true && claims.email_verified !== "true") {
    return sign(base, "not_verified", "unverified_email");
  }

  // hd is set by Google only for Workspace accounts. Never use the email's suffix:
  // anyone can make a personal Google account with a @company.com email address.
  if (typeof claims.hd !== "string" || claims.hd === "") {
    return sign(base, "not_verified", "no_hd");
  }
  const hd = claims.hd.toLowerCase();
  if (hd !== input.domain) {
    const extra = isDomain(hd) ? { actualDomain: hd, domainAgeFlag: await domainAgeFlag(hd, now) } : {};
    return sign({ ...base, ...extra }, "not_verified", "wrong_domain");
  }
  return sign({ ...base, domainAgeFlag: await domainAgeFlag(hd, now) }, "verified", "ok");
}

function validateInput(p) {
  if (!p || typeof p !== "object") return null;
  const domain = typeof p.domain === "string" ? p.domain.trim().toLowerCase() : "";
  if (!isDomain(domain)) return null;
  if (typeof p.challengeId !== "string" || !/^[A-Za-z0-9_-]{22}$/.test(p.challengeId)) return null;
  if (typeof p.code !== "string" || p.code.length < 10 || p.code.length > 2048) return null;
  if (typeof p.codeVerifier !== "string" || !/^[A-Za-z0-9._~-]{43,128}$/.test(p.codeVerifier)) return null;
  if (!CONFIG.redirectUris.includes(p.redirectUri)) return null;
  if (!Number.isSafeInteger(p.expiresAt)) return null;
  // nonce = SHA-256(challengeId) as hex. The browser put the same value in the
  // Google sign-in request, so Google echoes it back inside the ID token.
  const nonce = ethers.utils.sha256(ethers.utils.toUtf8Bytes(p.challengeId)).slice(2);
  return { code: p.code, codeVerifier: p.codeVerifier, redirectUri: p.redirectUri, domain, expiresAt: p.expiresAt, nonce };
}

function isDomain(d) {
  return d.length <= 253 && /^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/.test(d);
}

// Trade the sign-in code for Google's ID token. Returns { claims } or { error }.
// The error is a short code only (e.g. "google_401_invalid_client"), never Google's
// free-text description, so nothing personal can end up in a signed result.
async function exchangeCode(input, clientSecret) {
  let res;
  try {
    res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
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
    return { error: "google_unreachable" };
  }
  const body = (await res.json().catch(() => null)) || {};
  if (!res.ok) {
    const code = typeof body.error === "string" && /^[a-z_]{1,40}$/.test(body.error) ? body.error : "unknown";
    return { error: `google_${res.status}_${code}` };
  }
  if (typeof body.id_token !== "string") return { error: "no_id_token" };
  const claims = decodeJwtPayload(body.id_token);
  return claims ? { claims } : { error: "bad_id_token" };
}

function decodeJwtPayload(jwt) {
  try {
    const part = jwt.split(".")[1];
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const claims = JSON.parse(ethers.utils.toUtf8String(bytes));
    return claims && typeof claims === "object" ? claims : null;
  } catch (err) {
    return null;
  }
}

// "new" if registered under 90 days ago, "ok" if older, "unknown" if the lookup fails.
// A failed lookup never fails the check: it is a warning signal only.
async function domainAgeFlag(domain, now) {
  try {
    const res = await fetch(`https://rdap.org/domain/${domain}`, {
      headers: { Accept: "application/rdap+json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return "unknown";
    const events = (await res.json()).events || [];
    const reg = events.find((e) => e && e.eventAction === "registration");
    const registeredMs = reg ? Date.parse(reg.eventDate) : NaN;
    if (!Number.isFinite(registeredMs)) return "unknown";
    return now * 1000 - registeredMs < NEW_DOMAIN_DAYS * 86400000 ? "new" : "ok";
  } catch (err) {
    return "unknown";
  }
}

async function sign(fields, status, reason) {
  const result = { ...fields, v: 1, type: RESULT_TYPE, method: "google", status, reason };
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
