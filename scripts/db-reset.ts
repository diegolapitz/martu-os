import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

import { closeDatabase } from "../src/server/db/client";
import { runMigrations } from "../src/server/db/migrate";
import { seedDatabase } from "../src/server/db/seed";

for (const file of [".env.local", ".env"]) if (existsSync(file)) loadEnvFile(file);

async function main() {
  try {
    await runMigrations();
    const result = await seedDatabase({ reset: true });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await closeDatabase();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
