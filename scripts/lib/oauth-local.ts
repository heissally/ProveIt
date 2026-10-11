/**
 * For live tests: open a provider's real sign-in page, then catch the one-time
 * code when the provider redirects back to http://localhost:<port>/callback/...
 */
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";

export const b64url = (bytes: Buffer) => bytes.toString("base64url");

/** PKCE: the verifier stays here; only its hash (the challenge) goes to the provider. */
export function makePkce() {
  const verifier = b64url(randomBytes(32));
  return { verifier, challenge: b64url(createHash("sha256").update(verifier).digest()) };
}

/**
 * Start a one-shot local server on the redirect address, open `authUrl` in the
 * browser (unless openBrowser is false), and resolve with the code.
 */
export function catchOAuthCode(opts: {
  authUrl: URL;
  redirectUri: string;
  state: string;
  openBrowser?: boolean;
}): Promise<string> {
  const redirect = new URL(opts.redirectUri);
  const port = Number(redirect.port || 80);
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const u = new URL(req.url ?? "/", opts.redirectUri);
      if (u.pathname !== redirect.pathname) {
        res.writeHead(404).end();
        return;
      }
      const code = u.searchParams.get("code");
      const stateOk = u.searchParams.get("state") === opts.state;
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        `<p style="font:16px system-ui">${stateOk && code ? "Signed in. Go back to the terminal." : "Sign-in did not complete."} You can close this tab.</p>`,
      );
      clearTimeout(timer);
      server.close();
      if (!stateOk) reject(new Error("state mismatch: ignoring this callback"));
      else if (!code) reject(new Error(`the provider returned: ${u.searchParams.get("error") ?? "no code"}`));
      else resolve(code);
    });
    const timer = setTimeout(() => {
      server.close();
      reject(new Error("no sign-in within 5 minutes"));
    }, 5 * 60 * 1000);
    server.on("error", (e) => reject(new Error(`could not listen on port ${port}: ${e.message}`)));
    server.listen(port, () => {
      console.log(opts.openBrowser === false ? "Open this link to sign in:" : "Opening the sign-in page in your browser… (if it doesn't open, paste this link)");
      console.log(`  ${opts.authUrl}\n`);
      if (opts.openBrowser !== false) spawn("open", [opts.authUrl.toString()], { stdio: "ignore", detached: true }).unref();
    });
  });
}
