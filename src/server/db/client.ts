import path from "node:path";
import { promises as fs } from "node:fs";

import { PGlite } from "@electric-sql/pglite";
import postgres, { type Sql } from "postgres";

export type DatabaseRow = Record<string, unknown>;
export type QueryParameter = unknown;

export interface DbExecutor {
  query<T extends DatabaseRow = DatabaseRow>(
    sql: string,
    params?: readonly QueryParameter[],
  ): Promise<T[]>;
  exec(sql: string): Promise<void>;
}

export interface DatabaseClient extends DbExecutor {
  readonly mode: "postgres" | "pglite";
  transaction<T>(work: (tx: DbExecutor) => Promise<T>): Promise<T>;
  close(timeoutSeconds?: number): Promise<void>;
}

type DatabaseGeneration = {
  promise: Promise<DatabaseClient>;
  activeOperations: number;
  retired: boolean;
  lastActivityAt?: number;
  closeTimeoutSeconds?: number;
  closeTask?: Promise<void>;
  closeWaiter?: Promise<void>;
  resolveCloseWaiter?: () => void;
};

type DatabaseLease = {
  database: DatabaseClient;
  generation: DatabaseGeneration;
};

type GlobalWithDatabase = typeof globalThis & {
  __martuDatabaseGeneration?: DatabaseGeneration;
  __martuDatabaseHealth?: Promise<DatabaseGeneration>;
};

const globalWithDatabase = globalThis as GlobalWithDatabase;
const DATABASE_HEALTH_IDLE_MS = 1_000;
const DATABASE_HEALTH_TIMEOUT_MS = 1_500;
const DATABASE_OPERATION_TIMEOUT_MS = 5_500;
const DATABASE_FIRST_READ_ATTEMPT_TIMEOUT_MS = 2_000;

class DatabaseHealthTimeoutError extends Error {
  constructor() {
    super(`Database health check exceeded ${DATABASE_HEALTH_TIMEOUT_MS}ms.`);
    this.name = "DatabaseHealthTimeoutError";
  }
}

export class DatabaseOperationTimeoutError extends Error {
  constructor(readonly operation: "read" | "write") {
    super(`Database ${operation} timeout after ${DATABASE_OPERATION_TIMEOUT_MS}ms.`);
    this.name = "DatabaseOperationTimeoutError";
  }
}

function databaseUrl() {
  return process.env.DATABASE_URL?.trim() || process.env.DIRECT_URL?.trim();
}

export function getDatabaseMode(): "postgres" | "pglite" {
  const requested = process.env.DB_MODE?.trim().toLowerCase();
  const url = databaseUrl();

  if (requested === "postgres" || url) return "postgres";

  if (process.env.VERCEL || process.env.NODE_ENV === "production") {
    throw new Error(
      "DATABASE_URL is required in production. PGlite is intentionally disabled on Vercel/production.",
    );
  }

  if (requested && requested !== "pglite") {
    throw new Error(`Unsupported DB_MODE: ${requested}`);
  }

  return "pglite";
}

function createPostgresClient(url: string): DatabaseClient {
  // Supabase's transaction pooler and serverless functions require unnamed
  // statements. Keep one short-lived client connection per warm Vercel
  // runtime: postgres.js safely queues Promise.all reads on it, while a wider
  // per-instance pool can exhaust Supavisor during concurrent renders.
  const sql = postgres(url, {
    max: 1,
    prepare: false,
    idle_timeout: 5,
    connect_timeout: 5,
    max_lifetime: 60 * 30,
    connection: {
      application_name: "martu-os-vercel",
      statement_timeout: 5_000,
    },
  });

  const executorFor = (connection: Sql): DbExecutor => ({
    async query<T extends DatabaseRow>(
      text: string,
      params: readonly QueryParameter[] = [],
    ) {
      const normalizedParams = params.map((value, index) => {
        if (typeof value !== "string") return value;
        const jsonbCast = new RegExp(`\\$${index + 1}\\s*::jsonb`, "i");
        if (!jsonbCast.test(text)) return value;

        try {
          return JSON.parse(value) as unknown;
        } catch {
          return value;
        }
      });
      const rows = await connection.unsafe<T[]>(
        text,
        normalizedParams as never[],
      );
      return [...rows] as T[];
    },
    async exec(text: string) {
      await connection.unsafe(text);
    },
  });

  const executor = executorFor(sql);

  return {
    mode: "postgres",
    ...executor,
    async transaction<T>(work: (tx: DbExecutor) => Promise<T>) {
      const result = await sql.begin(async (tx) =>
        work(executorFor(tx as unknown as Sql)),
      );
      return result as T;
    },
    async close(timeoutSeconds = 5) {
      await sql.end({ timeout: timeoutSeconds });
    },
  };
}

async function createPgliteClient(): Promise<DatabaseClient> {
  const configuredPath =
    process.env.PGLITE_DATA_DIR?.trim() || ".data/martu-os";
  const scopedPath = configuredPath.replace(/^[.]data[\\/]/, "");
  if (
    configuredPath !== ":memory:" &&
    (path.isAbsolute(scopedPath) || scopedPath.split(/[\\/]/).includes(".."))
  ) {
    throw new Error(
      "PGLITE_DATA_DIR must stay inside the workspace .data directory.",
    );
  }
  const dataDir =
    configuredPath === ":memory:"
      ? undefined
      : path.join(
          /* turbopackIgnore: true */ process.cwd(),
          ".data",
          scopedPath,
        );
  if (dataDir) await fs.mkdir(dataDir, { recursive: true });
  const database = dataDir ? new PGlite(dataDir) : new PGlite();
  await database.waitReady;

  const executorFor = (
    connection: Pick<PGlite, "query" | "exec">,
  ): DbExecutor => ({
    async query<T extends DatabaseRow>(
      text: string,
      params: readonly QueryParameter[] = [],
    ) {
      const result = await connection.query<T>(text, [...params]);
      return result.rows as T[];
    },
    async exec(text: string) {
      await connection.exec(text);
    },
  });

  const executor = executorFor(database);

  return {
    mode: "pglite",
    ...executor,
    async transaction<T>(work: (tx: DbExecutor) => Promise<T>) {
      return database.transaction(async (tx) =>
        work(executorFor(tx as unknown as PGlite)),
      );
    },
    async close() {
      await database.close();
    },
  };
}

async function createDatabase(): Promise<DatabaseClient> {
  const mode = getDatabaseMode();
  if (mode === "postgres") {
    const url = databaseUrl();
    if (!url)
      throw new Error(
        "DATABASE_URL (or DIRECT_URL for scripts) is required for DB_MODE=postgres.",
      );
    return createPostgresClient(url);
  }
  return createPgliteClient();
}

function createDatabaseGeneration(): DatabaseGeneration {
  return {
    promise: createDatabase(),
    activeOperations: 0,
    retired: false,
  };
}

function getCurrentGeneration(): DatabaseGeneration {
  const current = globalWithDatabase.__martuDatabaseGeneration;
  if (current && !current.retired) return current;

  const generation = createDatabaseGeneration();
  globalWithDatabase.__martuDatabaseGeneration = generation;
  return generation;
}

export function getDatabase(): Promise<DatabaseClient> {
  return getCurrentGeneration().promise;
}

async function raceDatabaseHealth(database: DatabaseClient): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      database.query("select 1 as health"),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new DatabaseHealthTimeoutError()),
          DATABASE_HEALTH_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function closeRetiredGenerationIfIdle(generation: DatabaseGeneration) {
  if (
    !generation.retired ||
    generation.activeOperations > 0 ||
    generation.closeTask
  ) {
    return;
  }

  const timeoutSeconds = generation.closeTimeoutSeconds ?? 5;
  generation.closeTask = generation.promise
    .then((database) => database.close(timeoutSeconds))
    .catch(() => undefined)
    .then(() => generation.resolveCloseWaiter?.());
}

function retireDatabaseGeneration(
  generation: DatabaseGeneration,
  timeoutSeconds: number,
): Promise<void> {
  generation.retired = true;
  generation.closeTimeoutSeconds = Math.min(
    generation.closeTimeoutSeconds ?? timeoutSeconds,
    timeoutSeconds,
  );
  generation.closeWaiter ??= new Promise<void>((resolve) => {
    generation.resolveCloseWaiter = resolve;
  });
  closeRetiredGenerationIfIdle(generation);
  return generation.closeWaiter;
}

function replaceDatabaseGeneration(
  expected: DatabaseGeneration,
): DatabaseGeneration {
  if (globalWithDatabase.__martuDatabaseGeneration !== expected) {
    return getCurrentGeneration();
  }

  const replacement = createDatabaseGeneration();
  globalWithDatabase.__martuDatabaseGeneration = replacement;
  // A timed-out health probe is safe to abort only when no application
  // operation owns this generation. The defensive deferred-close path also
  // protects callers that bypassed the usual health gate.
  void retireDatabaseGeneration(expected, 0);
  return replacement;
}

async function getHealthyGeneration(): Promise<DatabaseGeneration> {
  const generation = getCurrentGeneration();
  if (getDatabaseMode() !== "postgres") return generation;

  const activeHealth = globalWithDatabase.__martuDatabaseHealth;
  if (activeHealth) return activeHealth;

  // With max=1, health probes share the same queue as application work. Never
  // race a probe while valid queries are active: queueing delay is not a dead
  // socket and must not trigger pool destruction.
  if (generation.activeOperations > 0) return generation;

  if (
    generation.lastActivityAt !== undefined &&
    Date.now() - generation.lastActivityAt < DATABASE_HEALTH_IDLE_MS
  ) {
    return generation;
  }

  const health = (async () => {
    let healthyGeneration = generation;
    let database = await healthyGeneration.promise;
    try {
      await raceDatabaseHealth(database);
    } catch {
      healthyGeneration = replaceDatabaseGeneration(healthyGeneration);
      database = await healthyGeneration.promise;
      // Recreate at most once for this operation. If the fresh connection also
      // fails its probe, fail before dispatching the application query.
      await raceDatabaseHealth(database);
    }
    healthyGeneration.lastActivityAt = Date.now();
    return healthyGeneration;
  })();

  globalWithDatabase.__martuDatabaseHealth = health;
  void health
    .finally(() => {
      if (globalWithDatabase.__martuDatabaseHealth === health) {
        delete globalWithDatabase.__martuDatabaseHealth;
      }
    })
    .catch(() => undefined);
  return health;
}

async function acquireDatabaseLease(): Promise<DatabaseLease> {
  while (true) {
    const generation = await getHealthyGeneration();
    const database = await generation.promise;
    if (
      generation.retired ||
      globalWithDatabase.__martuDatabaseGeneration !== generation
    ) {
      continue;
    }

    generation.activeOperations += 1;
    return { database, generation };
  }
}

function releaseDatabaseLease(lease: DatabaseLease, successful: boolean) {
  const { generation } = lease;
  generation.activeOperations = Math.max(0, generation.activeOperations - 1);
  if (successful) generation.lastActivityAt = Date.now();
  closeRetiredGenerationIfIdle(generation);
}

export async function queryRaw<T extends DatabaseRow = DatabaseRow>(
  text: string,
  params: readonly QueryParameter[] = [],
): Promise<T[]> {
  const retryableRead = isRetryableRead(text);
  const operation = retryableRead ? "read" : "write";
  const deadline = Date.now() + DATABASE_OPERATION_TIMEOUT_MS;

  for (let attempt = 0; ; attempt += 1) {
    const lease = await acquireDatabaseLease();
    let successful = false;
    try {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new DatabaseOperationTimeoutError(operation);
      const attemptTimeout = retryableRead && attempt === 0
        ? Math.min(DATABASE_FIRST_READ_ATTEMPT_TIMEOUT_MS, remaining)
        : remaining;
      const rows = await raceDatabaseOperation(
        lease.database.query<T>(text, params),
        attemptTimeout,
        operation,
      );
      successful = true;
      return rows;
    } catch (error) {
      const retryableFailure = error instanceof DatabaseOperationTimeoutError
        || isTransientConnectionError(error);
      if (retryableFailure) replaceDatabaseGeneration(lease.generation);

      // SELECT is idempotent for the query shapes used by the application, so
      // one retry on a fresh connection is safe. A write may have committed
      // even when its acknowledgement was lost and must never be replayed.
      if (
        retryableRead
        && attempt === 0
        && retryableFailure
        && Date.now() < deadline
      ) {
        continue;
      }
      throw error;
    } finally {
      releaseDatabaseLease(lease, successful);
    }
  }
}

export async function execRaw(text: string): Promise<void> {
  const lease = await acquireDatabaseLease();
  let successful = false;
  try {
    await raceDatabaseOperation(
      lease.database.exec(text),
      DATABASE_OPERATION_TIMEOUT_MS,
      "write",
    );
    successful = true;
  } catch (error) {
    if (
      error instanceof DatabaseOperationTimeoutError
      || isTransientConnectionError(error)
    ) {
      replaceDatabaseGeneration(lease.generation);
    }
    throw error;
  } finally {
    releaseDatabaseLease(lease, successful);
  }
}

export async function transactionRaw<T>(
  work: (tx: DbExecutor) => Promise<T>,
): Promise<T> {
  const lease = await acquireDatabaseLease();
  let successful = false;
  try {
    const result = await raceDatabaseOperation(
      lease.database.transaction(work),
      DATABASE_OPERATION_TIMEOUT_MS,
      "write",
    );
    successful = true;
    return result;
  } catch (error) {
    if (
      error instanceof DatabaseOperationTimeoutError
      || isTransientConnectionError(error)
    ) {
      replaceDatabaseGeneration(lease.generation);
    }
    throw error;
  } finally {
    releaseDatabaseLease(lease, successful);
  }
}

async function raceDatabaseOperation<T>(
  operation: Promise<T>,
  timeoutMs: number,
  operationKind: "read" | "write",
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new DatabaseOperationTimeoutError(operationKind)),
          Math.max(1, timeoutMs),
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function isRetryableRead(text: string): boolean {
  const normalized = text
    .replace(/^\s*(?:(?:--[^\n]*(?:\n|$))|(?:\/\*[\s\S]*?\*\/\s*))*/u, "")
    .trim()
    .replace(/;\s*$/u, "");
  if (!/^select\b/iu.test(normalized) || normalized.includes(";")) return false;
  return !/(?:\bfor\s+(?:no\s+key\s+)?update\b|\bfor\s+(?:key\s+)?share\b|\bnextval\s*\(|\bsetval\s*\(|\bpg_advisory_\w*\s*\()/iu.test(normalized);
}

function isTransientConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = "code" in error ? String(error.code) : "";
  return ["CONNECTION_DESTROYED", "ECONNRESET", "ECONNREFUSED", "EPIPE", "ETIMEDOUT", "08000", "08003", "08006", "57P01"]
    .includes(code)
    || /connection (?:closed|destroyed|terminated)|socket (?:closed|hang up)|ECONNRESET|ETIMEDOUT/iu.test(error.message);
}

export async function closeDatabase(): Promise<void> {
  const generation = globalWithDatabase.__martuDatabaseGeneration;
  delete globalWithDatabase.__martuDatabaseGeneration;
  delete globalWithDatabase.__martuDatabaseHealth;
  if (generation) await retireDatabaseGeneration(generation, 5);
}
