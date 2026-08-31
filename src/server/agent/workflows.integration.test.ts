import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createTask,
  getCommunicationProfile,
  query,
  updateCommunicationProfile,
} from "@/server/data";
import { closeDatabase } from "@/server/db/client";

import { getMartuRuntime } from "./runtime";

const testDataDir = `.data/vitest-workflows-${process.pid}-${Date.now()}`;
const baseNow = new Date("2026-08-29T15:00:00.000Z");

beforeAll(async () => {
  process.env.DB_MODE = "pglite";
  process.env.PGLITE_DATA_DIR = testDataDir;
  delete process.env.OPENAI_API_KEY;
  await query("select 1");
}, 30_000);

afterAll(async () => {
  await closeDatabase();
});

describe.sequential("critical Martu OS workflows", () => {
  it("detects a task due in minutes and starts a durable proactive conversation", async () => {
    await query("update public.tasks set status = 'completed'");
    await query("update public.commitments set status = 'done'");
    await query("update public.reminders set status = 'done'");
    await query("update public.content_items set status = 'delivered'");
    await query("update public.briefs set status = 'complete'");
    await query("update public.strategies set status = 'active'");
    await query("delete from public.ai_nudges");
    const task = await createTask({
      clientSlug: "gavilan",
      title: "Test A · revisar entrega urgente",
      dueAt: new Date(baseNow.getTime() + 3 * 60_000).toISOString(),
      priority: "urgent",
      source: "qa",
    });

    const result = await getMartuRuntime().proactivity.tick(baseNow);
    expect(result.delivered).toBe(1);

    const [nudge] = await query<{ id: string; status: string; target_path: string }>(
      "select id, status, target_path from public.ai_nudges where task_id = $1 and kind = 'task_due_soon'",
      [task.id],
    );
    expect(nudge?.status).toBe("delivered");
    expect(nudge?.target_path).toMatch(/^\/clients\/gavilan\?assistant=open/);
    const messages = await query<{ count: string }>(
      "select count(*)::text as count from public.chat_messages where role = 'system' and action_result ->> 'nudgeId' = $1",
      [nudge!.id],
    );
    expect(messages[0]?.count).toBe("1");
  }, 20_000);

  it("turns a chat promise into a commitment, reminds proactively and reschedules the exact entity", async () => {
    const now = new Date(baseNow.getTime() + 20 * 60_000);
    await query("update public.tasks set status = 'completed'");
    await query("delete from public.ai_nudges");

    const reply = await getMartuRuntime().agent.run({
      message: "Mañana termino el tercer reel de Luma",
      clientSlug: "luma-estudio",
      pathname: "/clients/luma-estudio/contenido",
      source: "web",
      now,
    });
    expect(reply.action?.type).toBe("create_commitment");

    const [commitment] = await query<{ id: string; source: string; status: string }>(
      `select co.id, co.source, co.status from public.commitments co
       join public.clients c on c.id = co.client_id
       where c.slug = 'luma-estudio' and co.intention ilike '%tercer reel%'
       order by co.updated_at desc limit 1`,
    );
    expect(commitment).toMatchObject({ source: "chat", status: "open" });
    expect(commitment?.id).toBeTruthy();

    const dueNow = new Date(now.getTime() - 60_000).toISOString();
    await query("update public.commitments set due_at = $2 where id = $1", [commitment!.id, dueNow]);
    await query("update public.reminders set remind_at = $2, status = 'pending' where commitment_id = $1", [commitment!.id, dueNow]);

    const tick = await getMartuRuntime().proactivity.tick(now);
    expect(tick.delivered).toBe(1);
    const [nudge] = await query<{ id: string; status: string }>(
      "select id, status from public.ai_nudges where commitment_id = $1 order by created_at desc limit 1",
      [commitment!.id],
    );
    expect(nudge?.status).toBe("delivered");

    const tomorrow = new Date(now.getTime() + 24 * 60 * 60_000).toISOString();
    const action = await getMartuRuntime().nudgeActions.execute({
      action: "reschedule",
      nudgeId: String(nudge!.id),
      dueAt: tomorrow,
    });
    expect(action.type).toBe("change_deadline");

    const [updated] = await query<{ due_at: Date; nudge_status: string; reminder_status: string; remind_at: Date }>(
      `select co.due_at, n.status as nudge_status, r.status as reminder_status, r.remind_at
       from public.commitments co
       join public.ai_nudges n on n.commitment_id = co.id
       join public.reminders r on r.commitment_id = co.id
       where co.id = $1 and n.id = $2 limit 1`,
      [commitment!.id, nudge!.id],
    );
    expect(new Date(updated!.due_at).toISOString()).toBe(tomorrow);
    expect(updated).toMatchObject({ nudge_status: "acted", reminder_status: "pending" });
    expect(new Date(updated!.remind_at).toISOString()).toBe(tomorrow);
  }, 20_000);

  it("persists communication and check-in preferences across a database reopen", async () => {
    await updateCommunicationProfile({
      morningBriefingEnabled: false,
      middayCheckEnabled: true,
      endOfDayEnabled: true,
      insistenceLevel: 2,
      quietHoursStart: "21:45",
      quietHoursEnd: "08:15",
      explicitPreferences: ["Directa y breve; no usar tono de coach."],
    });
    await closeDatabase();
    const profile = await getCommunicationProfile();
    expect(profile).toMatchObject({
      morningBriefingEnabled: false,
      middayCheckEnabled: true,
      endOfDayEnabled: true,
      insistenceLevel: 2,
      quietHoursStart: "21:45:00",
      quietHoursEnd: "08:15:00",
      explicitPreferences: ["Directa y breve; no usar tono de coach."],
    });
  });
});
