/** Terminal prompts for our scripts. */
import { createInterface } from "node:readline";
import { Writable } from "node:stream";

/** Ask a question and return the typed answer (visible). */
export async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => rl.question(question, resolve));
  rl.close();
  return answer.trim();
}

/**
 * Ask for a secret. Nothing you type or paste is shown on screen, and it never
 * goes into your shell history or any file.
 */
export async function askHidden(question: string): Promise<string> {
  process.stdout.write(question);
  const muted = new Writable({ write: (_chunk, _enc, done) => done() });
  const rl = createInterface({ input: process.stdin, output: muted, terminal: true });
  const answer = await new Promise<string>((resolve) => rl.question("", resolve));
  rl.close();
  process.stdout.write("\n");
  return answer.trim();
}
