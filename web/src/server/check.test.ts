import { ethers } from "ethers";
import { describe, expect, it } from "vitest";
import { canonical } from "../../../shared/canonical.ts";
import { challengeHashFor } from "../../../shared/verify.ts";
import { handleCheck, type CheckDeps } from "./check";
import { REDIS, fakeServices } from "./fake-services";
import { resultKey } from "./store";

const actionKey = new ethers.Wallet("0x" + "42".repeat(32)); // plays the Google action's own key
const ID = "Xq3vT9bLm2Rk8WdZp4NcAa";
const NOW = 1791110400;

const request = (overrides: Record<string, unknown> = {}) => ({
  method: "google",
  code: "4/one-time-code",
  codeVerifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
  redirectUri: "http://localhost:3000/callback/google",
  challengeId: ID,
  expiresAt: NOW + 600,
  domain: "coinbase.com",
  ...overrides,
});

async function signedResult(overrides: Record<string, unknown> = {}, key = actionKey) {
  const result = {
    v: 1, type: "proveit.result.v1", method: "google", status: "verified", reason: "ok",
    claim: { domain: "coinbase.com" }, challengeHash: challengeHashFor(ID), issuedAt: NOW, expiresAt: NOW + 600, domainAgeFlag: "ok",
    ...overrides,
  };
  return { ok: true, result, signature: await key.signMessage(canonical(result)), signer: key.address };
}

function setup(litReply: () => Promise<unknown> | unknown, litStatus = 200, limits = { perIpPer10Min: 10, perDay: 300 }) {
  const services = fakeServices((_body, _headers) => new Response(JSON.stringify(litStatus === 200 ? { response: litReplyValue, logs: "", has_error: false } : { error: "x" }), { status: litStatus }));
  let litReplyValue: unknown;
  const deps: CheckDeps = {
    usageKey: "usage-key-for-tests",
    redis: REDIS,
    limits,
    actions: { google: { code: "google-action-code", signer: actionKey.address }, discord: { code: "discord-action-code", signer: "0x0000000000000000000000000000000000000001" } },
    nowSec: () => NOW,
    fetch: services.fetch,
  };
  const call = async (body: unknown, ip = "1.2.3.4") => {
    litReplyValue = await litReply();
    return handleCheck(body, ip, deps);
  };
  return { call, services };
}

describe("POST /api/check", () => {
  it("runs the Google action with only the allowed fields, stores and returns the signed result", async () => {
    const reply = await signedResult();
    const { call, services } = setup(() => reply);
    const res = await call({ ...request(), sneaky: "extra field" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, stored: true, signature: reply.signature });
    expect(services.litCalls[0].code).toBe("google-action-code");
    expect(services.litCalls[0].js_params).toEqual({ ...request(), method: undefined });
    expect(services.litCalls[0].js_params).not.toHaveProperty("sneaky");
    expect(services.litCalls[0].headers).toMatchObject({ "X-Api-Key": "usage-key-for-tests", "X-Privacy-Mode": "true" });
    const stored = JSON.parse(services.upstash.data.get(resultKey(challengeHashFor(ID)))!);
    expect(stored).toEqual({ result: reply.result, signature: reply.signature });
  });

  it("stores genuine 'could not verify' results too", async () => {
    const { call } = setup(() => signedResult({ status: "not_verified", reason: "no_hd" }));
    expect((await call(request())).body).toMatchObject({ ok: true, stored: true });
  });

  it("refuses to store a result signed by any other key (not the published signer)", async () => {
    const { call, services } = setup(() => signedResult({}, ethers.Wallet.createRandom()));
    const res = await call(request());
    expect(res).toEqual({ status: 502, body: { ok: false, error: "unexpected" } });
    expect(services.upstash.data.has(resultKey(challengeHashFor(ID)))).toBe(false);
  });

  it("refuses a genuine result for a different check", async () => {
    const { call } = setup(() => signedResult({ challengeHash: challengeHashFor("BBBBBBBBBBBBBBBBBBBBBB") }));
    expect((await call(request())).status).toBe(502);
  });

  it("passes on the action's own 'invalid_input' as a 400", async () => {
    const { call } = setup(() => ({ ok: false, error: "invalid_input" }));
    expect(await call(request())).toEqual({ status: 400, body: { ok: false, error: "invalid_input" } });
  });

  it("reports Lit being unavailable", async () => {
    const { call } = setup(() => null, 503);
    expect((await call(request())).body).toMatchObject({ ok: false, error: "lit_unavailable", litStatus: 503 });
  });

  it("rate-limits per IP before ever calling Lit", async () => {
    const { call, services } = setup(() => signedResult(), 200, { perIpPer10Min: 2, perDay: 300 });
    await call(request());
    await call(request());
    const third = await call(request());
    expect(third).toEqual({ status: 429, body: { ok: false, error: "rate_limited", scope: "ip" } });
    expect(services.litCalls).toHaveLength(2);
  });

  it.each([
    ["unknown method", { method: "github" }],
    ["missing code", { code: undefined }],
    ["non-integer expiry", { expiresAt: "soon" }],
    ["Discord without roles", { method: "discord", guildId: "1373039981890900099", roles: [] }],
    ["oversized field", { code: "x".repeat(5000) }],
  ])("rejects a malformed request (%s) without calling Lit", async (_label, overrides) => {
    const { call, services } = setup(() => signedResult());
    expect((await call(request(overrides))).status).toBe(400);
    expect(services.litCalls).toHaveLength(0);
  });

  it("forwards a Discord request with its server and roles", async () => {
    const { call, services } = setup(() => ({ ok: false, error: "invalid_input" }));
    await call(request({ method: "discord", domain: undefined, guildId: "1373039981890900099", roles: ["Admin", "Mod"], redirectUri: "http://localhost:3000/callback/discord" }));
    expect(services.litCalls[0].code).toBe("discord-action-code");
    expect(services.litCalls[0].js_params).toMatchObject({ guildId: "1373039981890900099", roles: ["Admin", "Mod"] });
    expect(services.litCalls[0].js_params).not.toHaveProperty("domain");
  });
});
