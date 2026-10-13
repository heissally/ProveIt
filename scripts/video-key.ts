/**
 * Save the ElevenLabs API key for the launch video, without it ever appearing on screen.
 *
 *   npm run video:key
 *
 * The key goes only into video/.env.local, which git ignores. Nothing is printed except
 * its length, and it is never sent anywhere by this script.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { askHidden } from "./lib/prompt.ts";
import { cleanPasted } from "./lib/secret-format.ts";

const ENV_FILE = fileURLToPath(new URL("../video/.env.local", import.meta.url));
const NAME = "ELEVENLABS_API_KEY";

const key = cleanPasted(await askHidden("Paste your ElevenLabs API key (nothing will show), then press Enter: "));

const problems: string[] = [];
if (!key.startsWith("sk_")) problems.push('it should start with "sk_"');
if (key.split("sk_").length - 1 > 1) problems.push('it contains "sk_" more than once, so it was probably pasted twice');
if (/\s/.test(key)) problems.push("it contains spaces or line breaks");
if (!/^sk_[A-Za-z0-9]{20,100}$/.test(key) && problems.length === 0) problems.push("it contains unexpected characters");
if (problems.length > 0) {
  console.error(`Not saved: got ${key.length} characters, and ${problems.join("; ")}. Please run it again.`);
  process.exit(1);
}

const kept = existsSync(ENV_FILE)
  ? readFileSync(ENV_FILE, "utf8").split("\n").filter((line) => line && !line.startsWith(`${NAME}=`))
  : [];
writeFileSync(ENV_FILE, [...kept, `${NAME}=${key}`, ""].join("\n"), { mode: 0o600 });
console.log(`Saved (${key.length} characters) in video/.env.local only. git ignores that file.`);
