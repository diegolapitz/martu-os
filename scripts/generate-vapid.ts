import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import webpush from "web-push";

const envPath = resolve(process.cwd(), ".env.local");
const previous = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
const lines = previous.split(/\r?\n/).filter(Boolean);
const values = new Map<string, string>();

for (const line of lines) {
  const separator = line.indexOf("=");
  if (separator > 0 && !line.trimStart().startsWith("#")) {
    values.set(line.slice(0, separator), line.slice(separator + 1));
  }
}

const vapid = webpush.generateVAPIDKeys();
values.set("DB_MODE", values.get("DB_MODE") || "pglite");
values.set("PGLITE_DATA_DIR", values.get("PGLITE_DATA_DIR") || ".data/martu-os");
values.set(
  "APP_TIMEZONE",
  values.get("APP_TIMEZONE") || "America/Argentina/Buenos_Aires",
);
values.set("NEXT_PUBLIC_APP_URL", values.get("NEXT_PUBLIC_APP_URL") || "http://localhost:3000");
values.set("NEXT_PUBLIC_VAPID_PUBLIC_KEY", vapid.publicKey);
values.set("VAPID_PRIVATE_KEY", vapid.privateKey);
values.set("VAPID_SUBJECT", values.get("VAPID_SUBJECT") || "mailto:martu-os@example.com");
const existingCronSecret = values.get("CRON_SECRET")?.trim();
values.set(
  "CRON_SECRET",
  !existingCronSecret || existingCronSecret === "replace-with-a-long-random-secret"
    ? randomBytes(32).toString("base64url")
    : existingCronSecret,
);

const generated = [
  "# Generated for local Martu OS development. Do not commit.",
  ...Array.from(values, ([key, value]) => `${key}=${value}`),
  "",
].join("\n");

writeFileSync(envPath, generated, { encoding: "utf8", mode: 0o600 });
console.log(`Local Web Push configuration written to ${envPath}.`);
console.log("The private key and cron secret were not printed.");
