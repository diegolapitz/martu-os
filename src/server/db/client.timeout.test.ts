import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const postgresState = vi.hoisted(() => ({
  factory: vi.fn(),
}));

vi.mock("postgres", () => ({ default: postgresState.factory }));

type MockSql = {
  unsafe: ReturnType<typeof vi.fn>;
  begin: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
};

function mockSql(
  unsafe: (text: string) => Promise<Array<Record<string, unknown>>>,
): MockSql {
  return {
    unsafe: vi.fn(unsafe),
    begin: vi.fn(),
    end: vi.fn().mockResolvedValue(undefined),
  };
}

function resetDatabaseGlobals() {
  const state = globalThis as typeof globalThis & {
    __martuDatabaseGeneration?: unknown;
    __martuDatabaseHealth?: unknown;
  };
  delete state.__martuDatabaseGeneration;
  delete state.__martuDatabaseHealth;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  postgresState.factory.mockReset();
  resetDatabaseGlobals();
  process.env.DB_MODE = "postgres";
  process.env.DATABASE_URL = "postgres://test:test@localhost:6543/postgres";
});

afterEach(() => {
  vi.useRealTimers();
  resetDatabaseGlobals();
});

describe("cloud database operation deadlines", () => {
  it("retires a hung pool and retries a SELECT once on a fresh generation", async () => {
    const first = mockSql(async (text) => {
      if (text.includes("select 1 as health")) return [{ health: 1 }];
      return new Promise<never>(() => undefined);
    });
    const second = mockSql(async (text) => {
      if (text.includes("select 1 as health")) return [{ health: 1 }];
      return [{ title: "recuperada" }];
    });
    postgresState.factory
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second);

    const { closeDatabase, queryRaw } = await import("./client");
    const result = queryRaw<{ title: string }>("select title from public.tasks");

    await vi.advanceTimersByTimeAsync(2_001);

    await expect(result).resolves.toEqual([{ title: "recuperada" }]);
    expect(postgresState.factory).toHaveBeenCalledTimes(2);
    expect(first.unsafe.mock.calls.filter(([text]) => String(text).includes("select title"))).toHaveLength(1);
    expect(second.unsafe.mock.calls.filter(([text]) => String(text).includes("select title"))).toHaveLength(1);
    expect(first.end).toHaveBeenCalledWith({ timeout: 0 });
    await closeDatabase();
  });

  it("bounds an ambiguous write without ever replaying it", async () => {
    const first = mockSql(async (text) => {
      if (text.includes("select 1 as health")) return [{ health: 1 }];
      return new Promise<never>(() => undefined);
    });
    const replacement = mockSql(async () => []);
    postgresState.factory
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(replacement);

    const { closeDatabase, DatabaseOperationTimeoutError, queryRaw } = await import("./client");
    const outcome = queryRaw("update public.tasks set status = 'completed'")
      .then(() => undefined, (error: unknown) => error);

    await vi.advanceTimersByTimeAsync(5_501);

    expect(await outcome).toBeInstanceOf(DatabaseOperationTimeoutError);
    expect(first.unsafe.mock.calls.filter(([text]) => String(text).startsWith("update"))).toHaveLength(1);
    expect(replacement.unsafe.mock.calls.filter(([text]) => String(text).startsWith("update"))).toHaveLength(0);
    expect(first.end).toHaveBeenCalledWith({ timeout: 0 });
    await closeDatabase();
  });
});
