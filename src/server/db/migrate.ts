import { promises as fs } from "node:fs";
import path from "node:path";

import { getDatabase, type DatabaseRow } from "./client";

export interface MigrationResult {
  applied: string[];
  skipped: string[];
  mode: "postgres" | "pglite";
}

export interface MigrationOptions {
  includeCloud?: boolean;
  migrationsDir?: string;
}

interface MigrationRow extends DatabaseRow {
  version: string;
}

export async function runMigrations(options: MigrationOptions = {}): Promise<MigrationResult> {
  const database = await getDatabase();
  const migrationsDir = options.migrationsDir
    ? path.resolve(options.migrationsDir)
    : path.resolve(process.cwd(), "supabase/migrations");

  await database.exec(`
    create table if not exists public.schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const allFiles = (await fs.readdir(migrationsDir))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const files = allFiles.filter(
    (name) => options.includeCloud || !name.endsWith("_supabase_cloud.sql"),
  );
  const skipped = allFiles.filter((name) => !files.includes(name));
  const applied: string[] = [];

  for (const version of files) {
    const existing = await database.query<MigrationRow>(
      "select version from public.schema_migrations where version = $1",
      [version],
    );
    if (existing.length > 0) continue;

    const migration = await fs.readFile(path.join(migrationsDir, version), "utf8");
    await database.transaction(async (tx) => {
      if (database.mode === "postgres") {
        await tx.query("select pg_advisory_xact_lock(hashtext($1))", ["martu-os-migrations"]);
        const raced = await tx.query<MigrationRow>(
          "select version from public.schema_migrations where version = $1",
          [version],
        );
        if (raced.length > 0) return;
      }

      await tx.exec(migration);
      await tx.query(
        "insert into public.schema_migrations (version) values ($1) on conflict (version) do nothing",
        [version],
      );
    });
    applied.push(version);
  }

  return { applied, skipped, mode: database.mode };
}

