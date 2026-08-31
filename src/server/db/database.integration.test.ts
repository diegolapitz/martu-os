import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createIdea,
  createNote,
  getClientWorkspace,
  getDayData,
  listClients,
  query,
  transaction,
  updateContentStatus,
  updateScript,
} from "@/server/data";

import { closeDatabase } from "./client";
import { runMigrations } from "./migrate";

const testDataDir = `.data/vitest-db-${process.pid}-${Date.now()}`;

beforeAll(async () => {
  process.env.DB_MODE = "pglite";
  process.env.PGLITE_DATA_DIR = testDataDir;
  await getDayData();
}, 30_000);

afterAll(async () => {
  await closeDatabase();
});

describe("Martu OS database contract", () => {
  it("auto-migrates and creates the rich, service-aware demo", async () => {
    const clients = await listClients();
    expect(clients).toHaveLength(5);

    const gavilan = await getClientWorkspace("gavilan");
    expect(gavilan.ideas.length).toBeGreaterThanOrEqual(8);
    expect(gavilan.scripts.length).toBeGreaterThanOrEqual(6);
    expect(gavilan.content.length).toBeGreaterThanOrEqual(8);
    expect(gavilan.tabs.map((tab) => tab.id)).toEqual(expect.arrayContaining(["metricas", "pauta", "guiones"]));
    expect(gavilan.scripts.find((script) => script.number === 3)?.title).toBe("Escapada sin organizar de más");
    const laguna = gavilan.content.find((item) => item.title.includes("Laguna de los Patos"));
    expect(laguna?.scriptId).toBe(gavilan.scripts.find((script) => script.title === "Un día en la Laguna de los Patos")?.id);
    expect(gavilan.metrics.find((metric) => metric.contentTitle.includes("Laguna de los Patos"))?.retention).toBe(71);
    expect(gavilan.metrics.filter((metric) => metric.contentTitle.includes("institucional")).every((metric) => (metric.retention ?? 100) < 35)).toBe(true);

    const luma = await getClientWorkspace("luma-estudio");
    expect(luma.tabs.map((tab) => tab.id)).not.toContain("metricas");
    expect(luma.tabs.map((tab) => tab.id)).not.toContain("pauta");
    expect(luma.metrics).toEqual([]);
    expect(luma.campaigns).toEqual([]);
    expect(luma.content.every((item) => !["Publicado", "Programado"].includes(item.status))).toBe(true);
    await expect(updateContentStatus(luma.content[0]!.id, "Publicado"))
      .rejects.toThrow("no contrata publicación");
  }, 20_000);

  it("persists note, idea and content mutations with activity", async () => {
    const before = await getClientWorkspace("gavilan");
    const target = before.content.find((item) => item.status !== "Publicado")!;

    const note = await createNote({ clientSlug: "gavilan", text: "Nota de integración persistente", tags: ["qa"] });
    const idea = await createIdea({ clientSlug: "gavilan", title: "Escapada con lluvia", description: "Plan real para un día que cambia.", status: "Borrador" });
    const content = await updateContentStatus(target.id, "En aprobación");

    expect(note.createdAt).toMatch(/T/);
    expect(idea.status).toBe("Nueva");
    expect(content.status).toBe("En aprobación");

    await closeDatabase();
    const reopened = await getClientWorkspace("gavilan");
    expect(reopened.notes.some((item) => item.text === "Nota de integración persistente")).toBe(true);
    expect(reopened.ideas.some((item) => item.title === "Escapada con lluvia")).toBe(true);
    expect(reopened.content.find((item) => item.id === target.id)?.status).toBe("En aprobación");
    expect(reopened.activity.some((item) => item.kind === "content.status_changed")).toBe(true);
  }, 20_000);

  it("persists script edits and records them in client activity", async () => {
    const before = await getClientWorkspace("gavilan");
    const target = before.scripts.find((script) => script.number === 3)!;
    await updateScript({ scriptId: target.id, hook: "Hook persistente desde el editor de guiones." });

    await closeDatabase();
    const reopened = await getClientWorkspace("gavilan");
    expect(reopened.scripts.find((script) => script.id === target.id)?.hook)
      .toBe("Hook persistente desde el editor de guiones.");
    expect(reopened.activity.some((item) => item.kind === "script.updated" && item.entityId === target.id)).toBe(true);
  }, 20_000);

  it("rolls back failed transactions", async () => {
    const before = await query<{ count: string }>("select count(*)::text as count from public.notes");
    await expect(transaction(async (tx) => {
      await tx.query(
        `insert into public.notes (user_id, client_id, text)
         select u.id, c.id, 'Esta nota debe hacer rollback' from public.users u
         join public.clients c on c.user_id = u.id where u.slug = 'martu' and c.slug = 'gavilan'`,
      );
      throw new Error("rollback esperado");
    })).rejects.toThrow("rollback esperado");
    const after = await query<{ count: string }>("select count(*)::text as count from public.notes");
    expect(after[0]?.count).toBe(before[0]?.count);
  });

  it("installs partial indexes for scheduler hot paths", async () => {
    const rows = await query<{ indexname: string }>(
      `select indexname from pg_indexes where schemaname = 'public' and indexname in (
        'tasks_open_due_idx', 'commitments_open_due_idx', 'reminders_pending_due_idx',
        'ai_nudges_delivery_queue_idx', 'ai_nudges_active_dedupe_idx'
      ) order by indexname`,
    );
    expect(rows.map((row) => row.indexname)).toHaveLength(5);
  });

  it("indexes every foreign-key column", async () => {
    const missing = await query<{ table_name: string; fk_column: string }>(
      `select conrelid::regclass::text as table_name, a.attname as fk_column
       from pg_constraint c
       join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
       where c.contype = 'f' and not exists (
         select 1 from pg_index i
         where i.indrelid = c.conrelid and a.attnum = any(i.indkey)
       )`,
    );
    expect(missing).toEqual([]);
  });

  it("keeps the local migration runner idempotent and skips cloud-only SQL", async () => {
    const result = await runMigrations();
    expect(result.applied).toEqual([]);
    expect(result.skipped).toEqual([
      "202608290002_supabase_cloud.sql",
      "202608290005_scheduler_security_supabase_cloud.sql",
    ]);
  });
});
