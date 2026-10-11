// ProveIt · Milestone 1 probe: what does the Chipotle runtime give an action?
//
// Throwaway test action, not part of the product. It answers:
//   Q1. How do js_params reach the action?
//   Q3. Can one execution reach Google, Discord and RDAP, and how long does it take?
// It touches no keys and no secrets. Every outbound call uses dummy values and is
// EXPECTED to be rejected by the provider; we only want to know it got through.

async function main(params) {
  const startedAt = Date.now();
  const report = { enclaveNowMs: startedAt };

  // ---- Q1: how js_params arrive ----------------------------------------------
  // On Chipotle, js_params are passed as the single argument to main().
  const types = {};
  if (params && typeof params === "object") {
    for (const [key, value] of Object.entries(params)) {
      types[key] = Array.isArray(value) ? "array" : value === null ? "null" : typeof value;
    }
  }
  report.params = {
    typeofParams: typeof params,
    types,
    nestedEcho: params && params.nested !== undefined ? params.nested : null,
  };

  // ---- Which built-ins exist inside the TEE ------------------------------------
  report.globals = {
    ethersVersion: typeof ethers !== "undefined" ? ethers.version : null,
    fetch: typeof fetch,
    TextEncoder: typeof TextEncoder,
    atob: typeof atob,
    URL: typeof URL,
    URLSearchParams: typeof URLSearchParams,
    AbortSignalTimeout:
      typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function",
    cryptoSubtle: typeof crypto !== "undefined" && !!crypto.subtle,
    litActions: typeof Lit !== "undefined" ? Object.keys(Lit.Actions).sort() : null,
  };

  // SHA-256 of a string. The Google action will use this for the sign-in nonce.
  const hashInput = String((params && params.hashInput) || "");
  report.sha256 = ethers.utils.sha256(ethers.utils.toUtf8Bytes(hashInput));

  // ---- Q3: the outbound HTTPS calls the real actions will make -----------------
  const dummyForm = formEncode({
    grant_type: "authorization_code",
    code: "proveit-m1-dummy-code",
    client_id: "proveit-m1-dummy-client",
    client_secret: "proveit-m1-dummy-secret",
    redirect_uri: "https://example.com/callback",
  });
  const formHeaders = { "Content-Type": "application/x-www-form-urlencoded" };
  const discordHeaders = { "User-Agent": "ProveIt (https://github.com/proveit, 0.1)" };
  const domain = String((params && params.domain) || "coinbase.com");

  report.fetches = {
    // Expected: 400 or 401 with an "invalid_client"/"invalid_grant" error.
    googleToken: await timedFetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: formHeaders,
      body: dummyForm,
    }),
    // Expected: 400 or 401 (dummy client).
    discordToken: await timedFetch("https://discord.com/api/v10/oauth2/token", {
      method: "POST",
      headers: { ...formHeaders, ...discordHeaders },
      body: dummyForm,
    }),
    // Expected: 401 (no access token).
    discordMe: await timedFetch("https://discord.com/api/v10/users/@me", {
      headers: discordHeaders,
    }),
    // Expected: 200 with a JSON record holding the registration date.
    rdap: await timedFetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
      headers: { Accept: "application/rdap+json" },
    }),
  };

  report.totalMs = Date.now() - startedAt;
  return report;
}

// Encode a flat object as application/x-www-form-urlencoded without relying on
// URLSearchParams (we check above whether the runtime has it).
function formEncode(fields) {
  return Object.entries(fields)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

// Run one fetch and describe what happened, without ever throwing.
// Only a short snippet of the body comes back, so the response stays small.
async function timedFetch(url, init) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, init);
    const text = await res.text();
    const out = {
      ms: Date.now() - t0,
      status: res.status,
      redirected: res.redirected === true,
      finalUrl: res.url || url,
      bodySnippet: text.slice(0, 160),
    };
    // For RDAP, pull out the registration date so we can see the parsing works.
    if (url.includes("rdap")) {
      try {
        const events = JSON.parse(text).events || [];
        const reg = events.find((e) => e.eventAction === "registration");
        out.registrationDate = reg ? reg.eventDate : null;
      } catch (e) {
        out.registrationDate = "unparseable";
      }
    }
    return out;
  } catch (err) {
    return { ms: Date.now() - t0, error: String((err && err.message) || err) };
  }
}
