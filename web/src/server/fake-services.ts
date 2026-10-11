/**
 * Test doubles for the two outside services the server function talks to:
 * an in-memory Upstash (REST pipeline) and a scripted Lit lit_action endpoint.
 */
import { LIT_ACTION_URL } from "./lit";

export const REDIS = { url: "https://fake-upstash.example", token: "upstash-test-token" };

export function fakeUpstash() {
  const data = new Map<string, string>();
  const ttl = new Map<string, number>();
  const calls: string[][] = [];
  const handle = (cmd: string[]): unknown => {
    calls.push(cmd);
    const [op, key, ...rest] = cmd;
    switch (op) {
      case "SET":
        data.set(key, rest[0]);
        if (rest[1] === "EX") ttl.set(key, Number(rest[2]));
        return "OK";
      case "GET":
        return data.get(key) ?? null;
      case "INCR": {
        const n = Number(data.get(key) ?? 0) + 1;
        data.set(key, String(n));
        return n;
      }
      case "EXPIRE":
        ttl.set(key, Number(rest[0]));
        return 1;
      default:
        throw new Error(`fake Upstash doesn't know ${op}`);
    }
  };
  const fetch = async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url) !== `${REDIS.url}/pipeline`) throw new Error(`unexpected Upstash URL ${url}`);
    if ((init?.headers as Record<string, string>)?.Authorization !== `Bearer ${REDIS.token}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    const commands = JSON.parse(String(init?.body)) as string[][];
    return Response.json(commands.map((c) => ({ result: handle(c) })));
  };
  return { data, ttl, calls, fetch };
}

/** Route Lit calls to `lit`, everything else to Upstash. */
export function fakeServices(lit: (body: { code: string; js_params: Record<string, unknown> }, headers: Record<string, string>) => Response) {
  const upstash = fakeUpstash();
  const litCalls: Array<{ code: string; js_params: Record<string, unknown>; headers: Record<string, string> }> = [];
  const routed = (async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url) === LIT_ACTION_URL) {
      const body = JSON.parse(String(init?.body));
      const headers = init?.headers as Record<string, string>;
      litCalls.push({ ...body, headers });
      return lit(body, headers);
    }
    return upstash.fetch(url, init);
  }) as typeof globalThis.fetch;
  return { fetch: routed, upstash, litCalls };
}
