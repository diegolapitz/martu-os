import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { query } from "@/server/data";
import { closeDatabase } from "@/server/db/client";

import { MartuProactivityDataRepository } from "./data-repository";
import { ProactivityEngine } from "./engine";
import type { NudgeCandidate } from "./types";

const testDataDir = `.data/vitest-proactivity-dedupe-${process.pid}-${Date.now()}`;

function taskCandidate(options: {
  dedupeKey: string;
  taskId: string;
  title: string;
}): NudgeCandidate {
  return {
    kind: "task_due_soon",
    dedupeKey: options.dedupeKey,
    priority: "high",
    title: options.title,
    facts: { taskTitle: options.title },
    clientSlug: "gavilan",
    entityType: "task",
    entityId: options.taskId,
    deepLink: "/day?assistant=open",
    cooldownMinutes: 60,
    quickActions: ["complete", "snooze"],
  };
}

async function seededTask(seedKey: string): Promise<string> {
  const rows = await query<{ id: string | number }>(
    "select id from public.tasks where seed_key = $1 limit 1",
    [seedKey],
  );
  if (!rows[0]) throw new Error(`No se encontró la tarea seed ${seedKey}`);
  return String(rows[0].id);
}

beforeAll(async () => {
  process.env.DB_MODE = "pglite";
  process.env.PGLITE_DATA_DIR = testDataDir;
  await query("select 1");
  await query("update public.ai_nudges set status = 'expired' where status = 'pending'");
}, 30_000);

afterAll(async () => {
  await closeDatabase();
});

describe("semantic nudge deduplication", () => {
  it("does not claim a second candidate for a delivered task while its cooldown is active", async () => {
    const repository = new MartuProactivityDataRepository();
    const taskId = await seededTask("gavilan-task-1");
    const now = new Date("2026-08-29T15:00:00.000Z");
    const first = taskCandidate({ dedupeKey: "test:task:first", taskId, title: "Primer aviso" });
    const second = taskCandidate({ dedupeKey: "test:task:second", taskId, title: "Segundo aviso" });

    const claimed = await repository.claimCandidate(first, now);
    expect(claimed).toBeDefined();
    await query(
      `update public.ai_nudges set metadata = metadata || jsonb_build_object('deliveryLeaseToken', 'test-lease')
        where id = $1`,
      [claimed!.id],
    );
    await repository.markDelivered(claimed!.id, "test-lease", new Date(now.getTime() + 30_000), { channel: "test" });

    await expect(repository.claimCandidate(second, new Date(now.getTime() + 60_000))).resolves.toBeUndefined();

    const rows = await query<{ dedupe_key: string }>(
      "select dedupe_key from public.ai_nudges where task_id = $1 and dedupe_key like 'test:task:%'",
      [taskId],
    );
    expect(rows.map((row) => row.dedupe_key)).toEqual([first.dedupeKey]);
  });

  it("blocks a second candidate when the same task has a pending nudge scheduled for the future", async () => {
    const repository = new MartuProactivityDataRepository();
    const taskId = await seededTask("gavilan-task-2");
    const now = new Date("2026-08-29T16:00:00.000Z");
    const first = taskCandidate({ dedupeKey: "test:future:first", taskId, title: "Aviso futuro" });
    const second = taskCandidate({ dedupeKey: "test:future:second", taskId, title: "Aviso alternativo" });

    const claimed = await repository.claimCandidate(first, now);
    expect(claimed).toBeDefined();
    await query(
      "update public.ai_nudges set deliver_after = $2 where id = $1",
      [claimed!.id, new Date(now.getTime() + 60 * 60_000).toISOString()],
    );

    await expect(repository.claimCandidate(second, new Date(now.getTime() + 60_000))).resolves.toBeUndefined();
    await query("update public.ai_nudges set status = 'expired' where id = $1", [claimed!.id]);
  });

  it("leases a pending delivery once across concurrent scheduler ticks", async () => {
    const repository = new MartuProactivityDataRepository();
    const taskId = await seededTask("gavilan-task-3");
    const secondTaskId = await seededTask("luma-estudio-task-6");
    // Keep this concurrency contract deterministic: the engine intentionally
    // defers deliveries during Martu's configured quiet hours.
    const now = new Date("2026-08-30T15:00:00.000Z");
    await query(
      `update public.tasks set status = 'pending', source = 'demo',
        due_at = $2, updated_at = $1 where id in ($3,$4)`,
      [now.toISOString(), new Date(now.getTime() + 60 * 60_000).toISOString(), taskId, secondTaskId],
    );
    const deliveryCandidate = taskCandidate({
      dedupeKey: `test:lease:first:${process.pid}`,
      taskId,
      title: "Aviso con lease distribuido",
    });
    const secondDeliveryCandidate = taskCandidate({
      dedupeKey: `test:lease:second:${process.pid}`,
      taskId: secondTaskId,
      title: "Segundo aviso de otra cuenta",
    });
    expect(await repository.claimCandidate(deliveryCandidate, now)).toBeDefined();
    expect(await repository.claimCandidate(secondDeliveryCandidate, now)).toBeDefined();

    let pushAttempts = 0;
    const makeEngine = () => new ProactivityEngine(
      new MartuProactivityDataRepository(),
      { detect: () => [] },
      { compose: async (nudge) => ({ title: "Martu OS", body: "Un solo aviso", deepLink: nudge.deepLink, tag: nudge.dedupeKey, data: {} }) },
      { channel: "web_push", deliver: async () => { pushAttempts += 1; return { accepted: true, details: { attempted: 1, delivered: 1 } }; } },
    );

    const results = await Promise.all([makeEngine().tick(now), makeEngine().tick(now)]);

    expect(results.reduce((total, result) => total + result.delivered, 0)).toBe(1);
    expect(pushAttempts).toBe(1);
    const nudgeRows = await query<{ id: string | number; status: string }>(
      "select id, status from public.ai_nudges where dedupe_key in ($1,$2) order by id",
      [deliveryCandidate.dedupeKey, secondDeliveryCandidate.dedupeKey],
    );
    expect(nudgeRows).toHaveLength(2);
    expect(nudgeRows.filter((row) => row.status === "delivered")).toHaveLength(1);
    expect(nudgeRows.filter((row) => row.status === "pending")).toHaveLength(1);
    const messages = await query<{ count: string | number }>(
      `select count(*) as count from public.chat_messages
        where action_result ->> 'nudgeId' in ($1,$2)`,
      [String(nudgeRows[0].id), String(nudgeRows[1].id)],
    );
    expect(Number(messages[0].count)).toBe(1);
    await expect(
      repository.claimPendingForDelivery(new Date(now.getTime() + 60_000), 1),
    ).resolves.toEqual([]);
    await query(`update public.ai_nudges set status = 'expired'
      where status = 'pending' and dedupe_key in ($1,$2)`, [deliveryCandidate.dedupeKey, secondDeliveryCandidate.dedupeKey]);
  });

  it("expires a target changed during composition before appending or pushing", async () => {
    const repository = new MartuProactivityDataRepository();
    const taskId = await seededTask("nido-task-17");
    // Midday in Buenos Aires, outside the product's quiet-hours window.
    const now = new Date("2026-08-30T16:00:00.000Z");
    await query(
      `update public.tasks set status = 'pending', source = 'demo',
        due_at = $2, updated_at = $1 where id = $3`,
      [now.toISOString(), new Date(now.getTime() + 60 * 60_000).toISOString(), taskId],
    );
    const candidate = taskCandidate({
      dedupeKey: `test:toctou:${process.pid}`,
      taskId,
      title: "Objetivo que cambia durante la composición",
    });
    const claimed = await repository.claimCandidate(candidate, now);
    if (!claimed) throw new Error("No se pudo preparar el nudge TOCTOU.");
    const push = vi.fn();
    const engine = new ProactivityEngine(
      repository,
      { detect: () => [] },
      { compose: async (nudge) => {
        await query("update public.tasks set status = 'completed', completed_at = $2 where id = $1", [taskId, now.toISOString()]);
        return { title: "Martu OS", body: "No debe salir", deepLink: nudge.deepLink, tag: nudge.dedupeKey, data: {} };
      } },
      { channel: "web_push", deliver: push },
    );

    const result = await engine.tick(now);

    expect(push).not.toHaveBeenCalled();
    expect(result.delivered).toBe(0);
    const [nudge] = await query<{ id: string | number; status: string }>(
      "select id, status from public.ai_nudges where dedupe_key = $1",
      [candidate.dedupeKey],
    );
    expect(nudge.status).toBe("expired");
    const messages = await query<{ count: string | number }>(
      "select count(*) as count from public.chat_messages where action_result ->> 'nudgeId' = $1",
      [String(nudge.id)],
    );
    expect(Number(messages[0].count)).toBe(0);
    const leases = await query<{ count: string | number }>(
      "select count(*) as count from public.scheduler_leases where resource = 'proactivity_delivery'",
    );
    expect(Number(leases[0].count)).toBe(0);
  });

  it("does not revive a reminder changed after final revalidation", async () => {
    const repository = new MartuProactivityDataRepository();
    const now = new Date(Date.now() + 45 * 60_000);
    const [target] = await query<{
      reminder_id: string | number;
      commitment_id: string | number;
      client_id: string | number;
    }>(`select r.id as reminder_id, r.commitment_id, r.client_id
      from public.reminders r where r.seed_key = 'demo-luma-third-reel-reminder' limit 1`);
    await query(`update public.commitments set status = 'open', due_at = $2 where id = $1`, [target.commitment_id, new Date(now.getTime() - 60_000).toISOString()]);
    await query(`update public.reminders set status = 'pending', remind_at = $2,
      next_followup_at = $3 where id = $1`, [
      target.reminder_id,
      new Date(now.getTime() - 60_000).toISOString(),
      new Date(now.getTime() + 60 * 60_000).toISOString(),
    ]);
    const candidate: NudgeCandidate = {
      kind: "reminder_due",
      dedupeKey: `test:reminder-cas:${process.pid}`,
      priority: "high",
      title: "Reminder protegido",
      facts: { reminderId: String(target.reminder_id) },
      clientId: String(target.client_id),
      clientSlug: "luma-estudio",
      entityType: "commitment",
      entityId: String(target.commitment_id),
      deepLink: "/clients/luma-estudio/contenido?assistant=open",
      cooldownMinutes: 60,
      quickActions: ["complete", "snooze"],
    };
    expect(await repository.claimCandidate(candidate, now)).toBeDefined();
    const [owned] = await repository.claimPendingForDelivery(now, 1);
    if (!owned?.deliveryLeaseToken) throw new Error("El reminder no obtuvo lease.");
    expect(await repository.saveComposedMessage(owned.id, owned.deliveryLeaseToken, "Listo", now)).toBe(true);
    const rescheduledAt = new Date(now.getTime() + 2 * 60 * 60_000).toISOString();
    await query(`update public.reminders set status = 'snoozed', remind_at = $2,
      next_followup_at = null where id = $1`, [target.reminder_id, rescheduledAt]);

    expect(await repository.markDelivered(owned.id, owned.deliveryLeaseToken, now, { channel: "test" })).toBe(true);
    const [reminder] = await query<{ status: string; remind_at: Date | string }>(
      "select status, remind_at from public.reminders where id = $1",
      [target.reminder_id],
    );
    expect(reminder.status).toBe("snoozed");
    expect(new Date(reminder.remind_at).toISOString()).toBe(rescheduledAt);
  });

  it("lets an explicit due reminder supersede a generic task nudge", async () => {
    const repository = new MartuProactivityDataRepository();
    const now = new Date(Date.now() + 70 * 60_000);
    const taskId = await seededTask("brava-fit-task-13");
    const [task] = await query<{ user_id: string | number; client_id: string | number }>(
      "select user_id, client_id from public.tasks where id = $1",
      [taskId],
    );
    await query(`update public.tasks set status = 'pending', source = 'demo', due_at = $2 where id = $1`, [
      taskId,
      new Date(now.getTime() - 60 * 60_000).toISOString(),
    ]);
    const [reminder] = await query<{ id: string | number }>(`insert into public.reminders
      (user_id, client_id, task_id, seed_key, title, status, remind_at, channel, target_path)
      values ($1,$2,$3,$4,'Reminder explícito','pending',$5,'web_push','/day') returning id`, [
      task.user_id,
      task.client_id,
      taskId,
      `test-reminder-priority-${process.pid}`,
      new Date(now.getTime() - 60_000).toISOString(),
    ]);
    const generic: NudgeCandidate = {
      ...taskCandidate({ dedupeKey: `test:generic-overdue:${process.pid}`, taskId, title: "Aviso genérico" }),
      kind: "task_overdue",
      priority: "urgent",
    };
    const explicit: NudgeCandidate = {
      kind: "reminder_due",
      dedupeKey: `test:explicit-reminder:${process.pid}`,
      priority: "high",
      title: "Reminder explícito",
      facts: { reminderId: String(reminder.id) },
      clientId: String(task.client_id),
      entityType: "task",
      entityId: taskId,
      deepLink: "/day?assistant=open",
      cooldownMinutes: 60,
      quickActions: ["complete", "snooze"],
    };
    expect(await repository.claimCandidate(generic, now)).toBeDefined();
    expect(await repository.claimCandidate(explicit, now)).toBeDefined();

    const [owned] = await repository.claimPendingForDelivery(now, 1);

    expect(owned?.kind).toBe("reminder_due");
    const [genericRow] = await query<{ status: string }>(
      "select status from public.ai_nudges where dedupe_key = $1",
      [generic.dedupeKey],
    );
    expect(genericRow.status).toBe("expired");
    if (owned?.deliveryLeaseToken) await repository.releaseDeliveryLease(owned.id, owned.deliveryLeaseToken);
    await query("update public.ai_nudges set status = 'expired' where dedupe_key = $1", [explicit.dedupeKey]);
    await query("update public.reminders set status = 'cancelled' where id = $1", [reminder.id]);
  });

  it("rejects writes from a scheduler that lost its delivery lease", async () => {
    const repository = new MartuProactivityDataRepository();
    const taskId = await seededTask("gavilan-task-2");
    const now = new Date(Date.now() + 90 * 60_000);
    await query(
      `update public.tasks set status = 'pending', source = 'demo',
        due_at = $2, updated_at = $1 where id = $3`,
      [now.toISOString(), new Date(now.getTime() + 60 * 60_000).toISOString(), taskId],
    );
    const candidate = taskCandidate({
      dedupeKey: `test:cas:${process.pid}`,
      taskId,
      title: "Aviso protegido por CAS",
    });
    expect(await repository.claimCandidate(candidate, now)).toBeDefined();
    const [owned] = await repository.claimPendingForDelivery(now, 1);
    if (!owned) throw new Error("El nudge de prueba no pudo tomar el lease.");
    expect(owned?.deliveryLeaseToken).toBeTruthy();
    await query(
      `update public.ai_nudges set metadata =
        (metadata - 'deliveryLeaseToken') || jsonb_build_object('deliveryLeaseToken', 'new-owner')
        where id = $1`,
      [owned.id],
    );
    await query(
      `update public.scheduler_leases set owner_token = 'new-owner'
        where resource = 'proactivity_delivery' and owner_token = $1`,
      [owned.deliveryLeaseToken],
    );

    await expect(repository.saveComposedMessage(owned.id, owned.deliveryLeaseToken!, "stale", now)).resolves.toBe(false);
    await expect(repository.markDelivered(owned.id, owned.deliveryLeaseToken!, now, { channel: "test" })).resolves.toBe(false);
    await expect(repository.markFailed(owned.id, owned.deliveryLeaseToken!, "stale", now)).resolves.toBe(false);
    await expect(repository.releaseDeliveryLease(owned.id, owned.deliveryLeaseToken!)).resolves.toBe(false);
    const [row] = await query<{ status: string; lease_token: string }>(
      `select status, metadata ->> 'deliveryLeaseToken' as lease_token
        from public.ai_nudges where id = $1`,
      [owned.id],
    );
    expect(row).toEqual({ status: "pending", lease_token: "new-owner" });
    await expect(repository.releaseDeliveryLease(owned.id, "new-owner")).resolves.toBe(true);
    await query("update public.ai_nudges set status = 'expired' where id = $1", [owned.id]);
  });

  it("shows delivered and read notifications without surfacing queue or terminal states", async () => {
    const [user] = await query<{ id: string | number }>("select id from public.users where slug = 'martu'");
    const statuses = ["pending", "delivered", "seen", "acted", "dismissed"] as const;
    const keys = Object.fromEntries(
      statuses.map((status) => [status, `test:center:${status}:${process.pid}`]),
    ) as Record<(typeof statuses)[number], string>;
    await query(`insert into public.ai_nudges
      (user_id, kind, severity, title, message, status, dedupe_key, deliver_after, target_path)
      values ($1,'midday_check','low','En cola','En cola','pending',$2,now(),'/day'),
             ($1,'midday_check','low','Entregado','Entregado','delivered',$3,now(),'/day'),
             ($1,'midday_check','low','Leído','Leído','seen',$4,now(),'/day'),
             ($1,'midday_check','low','Resuelto','Resuelto','acted',$5,now(),'/day'),
             ($1,'midday_check','low','Descartado','Descartado','dismissed',$6,now(),'/day')`,
      [user.id, keys.pending, keys.delivered, keys.seen, keys.acted, keys.dismissed]);

    const visible = await new MartuProactivityDataRepository().listForCenter({ limit: 100 });

    const matching = visible
      .filter((nudge) => Object.values(keys).includes(nudge.dedupeKey))
      .map((nudge) => ({ key: nudge.dedupeKey, status: nudge.status }));
    expect(matching).toHaveLength(2);
    expect(matching).toEqual(
      expect.arrayContaining([
        { key: keys.seen, status: "read" },
        { key: keys.delivered, status: "delivered" },
      ]),
    );

    const queued = await new MartuProactivityDataRepository().listForCenter({
      status: "pending",
      limit: 100,
    });
    expect(queued.some((nudge) => nudge.dedupeKey === keys.pending)).toBe(true);
  });

  it("expires every stale target kind before it can be delivered", async () => {
    const repository = new MartuProactivityDataRepository();
    const now = new Date();
    const [context] = await query<{
      user_id: string | number;
      client_id: string | number;
      task_id: string | number;
      content_id: string | number;
      metric_id: string | number;
    }>(`select u.id as user_id, c.id as client_id,
        (select id from public.tasks where user_id = u.id and status = 'completed' limit 1) as task_id,
        (select ci.id from public.content_items ci where ci.client_id = c.id limit 1) as content_id,
        (select cm.id from public.content_metrics cm
          join public.content_items metric_item on metric_item.id = cm.content_item_id
          where metric_item.client_id = c.id limit 1) as metric_id
      from public.users u join public.clients c on c.user_id = u.id
      where u.slug = 'martu' and c.slug = 'gavilan' limit 1`);
    if (!context?.metric_id) throw new Error("El fixture de Gavilán no tiene métricas para validar nudges stale.");
    await query("update public.content_items set status = 'published' where id = $1", [context.content_id]);
    await query("update public.content_metrics set retention_rate = 0.40 where id = $1", [context.metric_id]);

    const staleKinds = [
      ["task_due_soon", context.task_id, null, { entityType: "task", entityId: String(context.task_id) }],
      ["task_stale", context.task_id, null, { entityType: "task", entityId: String(context.task_id) }],
      ["content_stalled", null, null, { entityType: "content", entityId: String(context.content_id) }],
      ["meeting_action_open", context.task_id, null, { entityType: "task", entityId: String(context.task_id) }],
      ["missing_brief", null, context.client_id, { entityType: "brief" }],
      ["missing_strategy", null, context.client_id, { entityType: "estrategia" }],
      ["metric_opportunity", null, context.client_id, { entityType: "metric_opportunity", entityId: String(context.metric_id) }],
    ] as const;
    const keys: string[] = [];
    for (const [kind, taskId, clientId, metadata] of staleKinds) {
      const dedupeKey = `test:stale:${kind}:${process.pid}`;
      keys.push(dedupeKey);
      await query(`insert into public.ai_nudges
        (user_id, client_id, task_id, kind, severity, title, message, status, dedupe_key,
          deliver_after, target_path, quick_actions, metadata)
        values ($1,$2,$3,$4,'high',$4,$4,'pending',$5,$6,'/day','[]'::jsonb,$7::jsonb)`, [
        context.user_id,
        clientId,
        taskId,
        kind,
        dedupeKey,
        new Date(now.getTime() - 60_000).toISOString(),
        JSON.stringify(metadata),
      ]);
    }

    await expect(repository.claimPendingForDelivery(now, 10)).resolves.toEqual([]);
    const statuses = await query<{ dedupe_key: string; status: string }>(
      "select dedupe_key, status from public.ai_nudges where dedupe_key = any($1::text[]) order by dedupe_key",
      [keys],
    );
    expect(statuses).toHaveLength(staleKinds.length);
    expect(statuses.every((row) => row.status === "expired")).toBe(true);
  });
});
