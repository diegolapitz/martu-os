import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

import { closeDatabase } from "../src/server/db/client";
import { runMigrations } from "../src/server/db/migrate";

for (const file of [".env.local", ".env"]) if (existsSync(file)) loadEnvFile(file);

if (process.env.DIRECT_URL?.trim()) {
  process.env.DATABASE_URL = process.env.DIRECT_URL.trim();
  process.env.DB_MODE = "postgres";
}

async function main() {
  try {
    const includeCloud = process.argv.includes("--include-cloud")
      || Boolean(process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim() || process.env.DB_MODE === "postgres");
    const result = await runMigrations({ includeCloud });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await closeDatabase();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
