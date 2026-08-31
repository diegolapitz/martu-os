import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { query } from "@/server/data";
import { closeDatabase } from "@/server/db/client";

import { MartuProactivityDataRepository } from "./data-repository";
import { DeterministicNudgeDetector } from "./detector";

const testDataDir = `.data/vitest-open-loop-resurface-${process.pid}-${Date.now()}`;

beforeAll(() => {
  process.env.DB_MODE = "pglite";
  process.env.PGLITE_DATA_DIR = testDataDir;
});

afterAll(async () => {
  await closeDatabase();
});

describe("open-loop proactive resurfacing", () => {
  it("advances the source cooldown only after a real delivery", async () => {
    const now = new Date("2026-08-30T15:00:00.000Z");
    const [context] = await query<{
      user_id: string | number;
      client_id: string | number;
    }>(`select u.id as user_id, c.id as client_id
      from public.users u join public.clients c on c.user_id = u.id
      where u.slug = 'martu' and c.slug = 'gavilan' limit 1`);
    const [loop] = await query<{ id: string | number }>(
      `insert into public.open_loops
      (user_id,client_id,kind,title,body,status,salience,created_at,updated_at)
      values ($1,$2,'topic','Retomar el concepto de verano','Sin fecha prometida.','open',4,$3,$3)
      returning id`,
      [
        context.user_id,
        context.client_id,
        new Date(now.getTime() - 10 * 86_400_000).toISOString(),
      ],
    );

    const repository = new MartuProactivityDataRepository();
    const snapshot = await repository.getSnapshot(now);
    const candidate = new DeterministicNudgeDetector()
      .detect(snapshot)
      .find(
        (item) =>
          item.entityType === "open_loop" && item.entityId === String(loop.id),
      );
    expect(candidate).toBeDefined();
    expect(candidate?.dueAt).toBeUndefined();

    const claimed = await repository.claimCandidate(candidate!, now);
    if (!claimed) throw new Error("El hilo abierto no pudo entrar en la cola.");
    await query(
      `update public.ai_nudges set metadata = metadata ||
        jsonb_build_object('deliveryLeaseToken','open-loop-test')
      where id = $1`,
      [claimed.id],
    );
    await expect(
      repository.markDelivered(claimed.id, "open-loop-test", now, {
        channel: "test",
      }),
    ).resolves.toBe(true);

    const [updated] = await query<{
      surface_count: number;
      last_surfaced_at: Date | string;
      next_eligible_at: Date | string;
    }>(
      `select surface_count,last_surfaced_at,next_eligible_at
      from public.open_loops where id = $1`,
      [loop.id],
    );
    expect(Number(updated.surface_count)).toBe(1);
    expect(new Date(updated.last_surfaced_at).toISOString()).toBe(
      now.toISOString(),
    );
    expect(new Date(updated.next_eligible_at).getTime()).toBe(
      now.getTime() + 14 * 86_400_000,
    );

    const duringCooldown = await repository.getSnapshot(
      new Date(now.getTime() + 24 * 60 * 60_000),
    );
    expect(
      duringCooldown.openLoops?.some((item) => item.id === String(loop.id)),
    ).toBe(false);
  }, 30_000);
});
