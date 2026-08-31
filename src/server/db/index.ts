import {
  getDatabase,
  getDatabaseMode,
  queryRaw,
  transactionRaw,
  type DatabaseRow,
  type DbExecutor,
  type QueryParameter,
} from "./client";

type GlobalWithReadiness = typeof globalThis & {
  __martuDbReady?: Promise<void>;
};

const globalWithReadiness = globalThis as GlobalWithReadiness;

export async function ensureDbReady(): Promise<void> {
  if (getDatabaseMode() === "postgres") {
    // Cloud schema changes are an explicit deploy step. Serverless requests must
    // never race each other while trying to migrate production.
    await getDatabase();
    return;
  }

  globalWithReadiness.__martuDbReady ??= (async () => {
    const { runMigrations } = await import("./migrate");
    await runMigrations();

    const rows = await queryRaw<{ count: string }>(
      "select count(*)::text as count from public.users where slug = $1",
      ["martu"],
    );
    if (rows[0]?.count === "0") {
      const { seedDatabase } = await import("./seed");
      await seedDatabase();
    }
  })().catch((error) => {
    delete globalWithReadiness.__martuDbReady;
    throw error;
  });

  return globalWithReadiness.__martuDbReady;
}

export async function query<T extends DatabaseRow = DatabaseRow>(
  text: string,
  params: readonly QueryParameter[] = [],
): Promise<T[]> {
  await ensureDbReady();
  return queryRaw<T>(text, params);
}

export async function transaction<T>(work: (tx: DbExecutor) => Promise<T>): Promise<T> {
  await ensureDbReady();
  return transactionRaw(work);
}

export { getDatabaseMode };
export type { DatabaseRow, DbExecutor, QueryParameter };
