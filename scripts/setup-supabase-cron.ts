import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

import { closeDatabase, queryRaw } from "../src/server/db/client";

for (const file of [".env.local", ".env"]) if (existsSync(file)) loadEnvFile(file);

const directUrl = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
const cronSecret = process.env.CRON_SECRET?.trim();

if (!directUrl) throw new Error("DIRECT_URL is required to configure Supabase Cron.");
if (!appUrl || /^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(appUrl)) {
  throw new Error("NEXT_PUBLIC_APP_URL must be the deployed HTTPS URL before configuring Supabase Cron.");
}
if (!cronSecret || cronSecret === "replace-with-a-long-random-secret" || cronSecret.length < 32) {
  throw new Error("CRON_SECRET must be a random secret of at least 32 characters.");
}

process.env.DATABASE_URL = directUrl;
process.env.DB_MODE = "postgres";

async function main() {
  try {
    await queryRaw("select public.configure_martu_scheduler($1, $2)", [appUrl, cronSecret]);
    console.log("Supabase Cron configured for the deployed Martu OS URL.");
    console.log("The application URL and cron secret were not printed.");
  } finally {
    await closeDatabase();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
