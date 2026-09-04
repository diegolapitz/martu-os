import {
  query as dbQuery,
  transaction,
  type DatabaseRow,
  type DbExecutor,
} from "@/server/db";
import { requireAppUserId } from "@/server/auth";

import {
  id,
  iso,
  jsonObject,
  nullableIso,
  number,
  statusLabel,
  stringArray,
} from "./serialize";
import type {
  ChatMessage,
  ChatThread,
  ClientIdea,
  ClientNote,
  CommunicationProfile,
  ContentItem,
  Memory,
  Nudge,
  PushSubscriptionRecord,
} from "./types";
import { updateContentV1 } from "./v1-domain";

type Row = DatabaseRow;
type SerializableRow = DatabaseRow;

const contentStatuses: Record<string, string> = {
  Idea: "idea",
  Guion: "script",
  "Para grabar": "to_record",
  Grabado: "recorded",
  Editando: "editing",
  Listo: "ready",
  "En aprobación": "approval",
  Aprobado: "approved",
  Programado: "scheduled",
  Publicado: "published",
  Entregado: "delivered",
};
const ideaStatuses: Record<string, string> = {
  Borrador: "new",
  Nueva: "new",
  Seleccionada: "selected",
  "En desarrollo": "developing",
  Producida: "produced",
  Descartada: "discarded",
};

function serializable(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(serializable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        serializable(item),
      ]),
    );
  }
  return value;
}

function serializableRow(row: Row): SerializableRow {
  return serializable(row) as SerializableRow;
}

async function userId(tx: DbExecutor): Promise<string> {
  return requireAppUserId(tx);
}

async function clientRef(
  tx: DbExecutor,
  slug?: string | null,
): Promise<{ id: string; slug: string; name: string } | null> {
  if (!slug) return null;
  const ownerId = await requireAppUserId(tx);
  const rows = await tx.query<Row>(
    `select c.id, c.slug, c.name from public.clients c
     where c.user_id = $2 and c.slug = $1 and c.status <> 'archived'`,
    [slug, ownerId],
  );
  if (!rows[0]) throw new Error(`No existe el cliente ${slug}.`);
  return {
    id: id(rows[0].id),
    slug: String(rows[0].slug),
    name: String(rows[0].name),
  };
}

async function insertActivity(
  tx: DbExecutor,
  input: {
    userId: string;
    clientId?: string | null;
    actor?: string;
    type: string;
    title: string;
    description?: string;
    entityType?: string | null;
    entityId?: string | null;
    targetPath?: string | null;
    metadata?: Record<string, unknown>;
    occurredAt?: string;
  },
) {
  const rows = await tx.query<Row>(
    `insert into public.activity_events (
       user_id, client_id, actor, type, title, description, entity_type, entity_id,
       target_path, metadata, occurred_at
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11) returning *`,
    [
      input.userId,
      input.clientId ?? null,
      input.actor ?? "Martu",
      input.type,
      input.title,
      input.description ?? "",
      input.entityType ?? null,
      input.entityId ?? null,
      input.targetPath ?? null,
      JSON.stringify(input.metadata ?? {}),
      input.occurredAt ?? new Date().toISOString(),
    ],
  );
  return serializableRow(rows[0]!);
}

export async function appendActivity(input: {
  clientId?: string;
  clientSlug?: string;
  actor?: string;
  type: string;
  title: string;
  description?: string;
  entityType?: string;
  entityId?: string;
  targetPath?: string;
  metadata?: Record<string, unknown>;
  occurredAt?: string;
}): Promise<SerializableRow> {
  return transaction(async (tx) => {
    const martuId = await userId(tx);
    const client = input.clientId
      ? { id: input.clientId }
      : await clientRef(tx, input.clientSlug);
    return insertActivity(tx, {
      ...input,
      userId: martuId,
      clientId: client?.id,
    });
  });
}

export async function createNote(input: {
  clientSlug: string;
  text: string;
  tags?: string[];
  source?: string;
}): Promise<ClientNote & Row> {
  if (!input.text.trim()) throw new Error("La nota no puede estar vacía.");
  return transaction(async (tx) => {
    const martuId = await userId(tx);
    const client = await clientRef(tx, input.clientSlug);
    if (!client) throw new Error("La nota necesita un cliente.");
    const rows = await tx.query<Row>(
      `insert into public.notes (user_id, client_id, text, tags, source)
       values ($1,$2,$3,$4,$5) returning *`,
      [
        martuId,
        client.id,
        input.text.trim(),
        input.tags ?? [],
        input.source ?? "manual",
      ],
    );
    const row = serializableRow(rows[0]!);
    await insertActivity(tx, {
      userId: martuId,
      clientId: client.id,
      type: "note.created",
      title: "Martu añadió una nota",
      description: input.text.trim().slice(0, 180),
      entityType: "note",
      entityId: id(row.id),
      targetPath: `/clients/${client.slug}/reuniones-notas`,
    });
    return Object.assign(row, {
      id: id(row.id),
      text: String(row.text),
      tags: stringArray(row.tags),
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
    }) as ClientNote & Row;
  });
}

export async function updateNote(input: {
  noteId: string;
  text?: string;
  tags?: string[];
}): Promise<ClientNote & Row> {
  if (input.text !== undefined && !input.text.trim())
    throw new Error("La nota no puede estar vacía.");
  const rows = await dbQuery<Row>(
    `update public.notes set text = coalesce($2, text), tags = coalesce($3, tags)
     where id = $1 returning *`,
    [input.noteId, input.text?.trim() ?? null, input.tags ?? null],
  );
  if (!rows[0]) throw new Error("No encontré la nota.");
  const row = serializableRow(rows[0]);
  return Object.assign(row, {
    id: id(row.id),
    text: String(row.text),
    tags: stringArray(row.tags),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }) as ClientNote & Row;
}

export async function createIdea(input: {
  clientSlug: string;
  title: string;
  description?: string;
  status?: string;
  origin?: string;
  tags?: string[];
}): Promise<ClientIdea & Row> {
  if (!input.title.trim()) throw new Error("La idea necesita un título.");
  const status = ideaStatuses[input.status ?? ""] ?? input.status ?? "new";
  if (
    !["new", "selected", "developing", "produced", "discarded"].includes(status)
  )
    throw new Error("Estado de idea inválido.");
  return transaction(async (tx) => {
    const martuId = await userId(tx);
    const client = await clientRef(tx, input.clientSlug);
    if (!client) throw new Error("La idea necesita un cliente.");
    const rows = await tx.query<Row>(
      `insert into public.ideas (client_id, title, description, origin, status, tags)
       values ($1,$2,$3,$4,$5,$6) returning *`,
      [
        client.id,
        input.title.trim(),
        input.description?.trim() ?? "",
        input.origin ?? "Martu",
        status,
        input.tags ?? [],
      ],
    );
    const row = serializableRow(rows[0]!);
    await insertActivity(tx, {
      userId: martuId,
      clientId: client.id,
      type: "idea.created",
      title: `Idea: ${input.title.trim()}`,
      entityType: "idea",
      entityId: id(row.id),
      targetPath: `/clients/${client.slug}/ideas`,
    });
    return Object.assign(row, {
      id: id(row.id),
      title: String(row.title),
      description: String(row.description),
      status: statusLabel(row.status),
      origin: String(row.origin),
      tags: stringArray(row.tags),
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
      contentId: null,
    }) as ClientIdea & Row;
  });
}

export async function updateIdea(input: {
  ideaId: string;
  title?: string;
  description?: string;
  status?: string;
  tags?: string[];
}): Promise<ClientIdea & Row> {
  const status = input.status
    ? (ideaStatuses[input.status] ?? input.status)
    : null;
  const rows = await dbQuery<Row>(
    `update public.ideas set title = coalesce($2,title), description = coalesce($3,description),
       status = coalesce($4,status), tags = coalesce($5,tags) where id = $1 returning *`,
    [
      input.ideaId,
      input.title?.trim() ?? null,
      input.description?.trim() ?? null,
      status,
      input.tags ?? null,
    ],
  );
  if (!rows[0]) throw new Error("No encontré la idea.");
  const row = serializableRow(rows[0]);
  return Object.assign(row, {
    id: id(row.id),
    title: String(row.title),
    description: String(row.description),
    status: statusLabel(row.status),
    origin: String(row.origin),
    tags: stringArray(row.tags),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    contentId: null,
  }) as ClientIdea & Row;
}

export async function updateContentStatus(
  contentId: string,
  next: string | { status: string },
): Promise<ContentItem & Row> {
  const requested = typeof next === "string" ? next : next.status;
  const status = contentStatuses[requested] ?? requested;
  if (!Object.values(contentStatuses).includes(status))
    throw new Error(`Estado de contenido inválido: ${requested}`);
  const row = await updateContentV1(contentId, { status });
  return Object.assign(row, {
    id: String(row.id),
    title: String(row.title),
    status: String(row.workflowStateLabel ?? statusLabel(row.status)),
    format: String(row.format),
    channel: String(row.channel),
    updatedAt: iso(row.updatedAt),
    deadline: nullableIso(row.dueAt),
    scriptId: row.scriptId ? String(row.scriptId) : null,
    ideaId: row.ideaId ? String(row.ideaId) : null,
    publishedAt: nullableIso(row.publishedAt),
    pipelinePosition: number(row.pipelinePosition),
  }) as ContentItem & Row;
}

export async function createTask(input: {
  clientSlug?: string;
  title: string;
  description?: string;
  dueAt?: string;
  priority?: string;
  status?: string;
  source?: string;
  entityType?: string;
  entityId?: string;
}): Promise<SerializableRow> {
  if (!input.title.trim()) throw new Error("La tarea necesita un título.");
  return transaction(async (tx) => {
    const martuId = await userId(tx);
    const client = await clientRef(tx, input.clientSlug);
    const rows = await tx.query<Row>(
      `insert into public.tasks (
         user_id, client_id, title, description, status, priority, due_at, source, entity_type, entity_id
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
      [
        martuId,
        client?.id ?? null,
        input.title.trim(),
        input.description ?? "",
        input.status ?? "pending",
        input.priority ?? "medium",
        input.dueAt ?? null,
        input.source ?? "manual",
        input.entityType ?? null,
        input.entityId ?? null,
      ],
    );
    const row = serializableRow(rows[0]!);
    await insertActivity(tx, {
      userId: martuId,
      clientId: client?.id,
      actor: input.source === "chat" ? "Supervisora" : "Martu",
      type: "task.created",
      title: `Tarea creada: ${input.title.trim()}`,
      entityType: "task",
      entityId: id(row.id),
      targetPath: client ? `/clients/${client.slug}/calendario` : "/day",
    });
    return Object.assign(row, { client_slug: client?.slug ?? null });
  });
}

export async function updateTask(input: {
  taskId: string;
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  dueAt?: string | null;
  snoozedUntil?: string | null;
}): Promise<SerializableRow> {
  const rows = await dbQuery<Row>(
    `update public.tasks set title = coalesce($2,title), description = coalesce($3,description),
       status = coalesce($4,status), priority = coalesce($5,priority), due_at = case when $6 then $7 else due_at end,
       snoozed_until = case when $8 then $9 else snoozed_until end,
       completed_at = case when $4 = 'completed' then now() when $4 is not null then null else completed_at end
     where id = $1 returning *`,
    [
      input.taskId,
      input.title ?? null,
      input.description ?? null,
      input.status ?? null,
      input.priority ?? null,
      input.dueAt !== undefined,
      input.dueAt ?? null,
      input.snoozedUntil !== undefined,
      input.snoozedUntil ?? null,
    ],
  );
  if (!rows[0]) throw new Error("No encontré la tarea.");
  return serializableRow(rows[0]);
}

export function completeTask(taskId: string) {
  return updateTask({ taskId, status: "completed" });
}
export function rescheduleTask(taskId: string, dueAt: string) {
  return updateTask({ taskId, dueAt, status: "pending", snoozedUntil: null });
}

export async function createScript(input: {
  clientSlug?: string;
  ideaId?: string;
  title: string;
  format?: string;
  objective?: string;
  hook?: string;
  body?: string;
  cta?: string;
  status?: string;
  notes?: string;
  dueAt?: string;
}): Promise<SerializableRow> {
  if (!input.clientSlug) throw new Error("El guion necesita un cliente.");
  return transaction(async (tx) => {
    const martuId = await userId(tx);
    const client = await clientRef(tx, input.clientSlug);
    if (!client) throw new Error("El guion necesita un cliente.");
    const numberRows = await tx.query<Row>(
      "select coalesce(max(script_number),0) + 1 as next_number from public.scripts where client_id = $1",
      [client.id],
    );
    const rows = await tx.query<Row>(
      `insert into public.scripts (
         client_id, idea_id, script_number, title, format, objective, hook, body, cta, status, notes, due_at
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *`,
      [
        client.id,
        input.ideaId ?? null,
        number(numberRows[0]?.next_number, 1),
        input.title.trim(),
        input.format ?? "Reel",
        input.objective ?? "",
        input.hook ?? "",
        input.body ?? "",
        input.cta ?? "",
        input.status ?? "draft",
        input.notes ?? "",
        input.dueAt ?? null,
      ],
    );
    const row = serializableRow(rows[0]!);
    await insertActivity(tx, {
      userId: martuId,
      clientId: client.id,
      actor: "Supervisora",
      type: "script.created",
      title: `Borrador creado: ${input.title}`,
      entityType: "script",
      entityId: id(row.id),
      targetPath: `/clients/${client.slug}/guiones`,
    });
    return Object.assign(row, { client_slug: client.slug });
  });
}

export async function updateScript(input: {
  scriptId: string;
  title?: string;
  objective?: string;
  hook?: string;
  body?: string;
  cta?: string;
  notes?: string;
  status?: string;
  dueAt?: string | null;
  version?: number;
}): Promise<SerializableRow> {
  return transaction(async (tx) => {
    const rows = await tx.query<Row>(
      `update public.scripts set title = coalesce($2,title), objective = coalesce($3,objective), hook = coalesce($4,hook),
         body = coalesce($5,body), cta = coalesce($6,cta), notes = coalesce($7,notes), status = coalesce($8,status),
         due_at = case when $9 then $10 else due_at end, version = coalesce($11,version),
         approved_at = case when $8 = 'approved' then now() else approved_at end
       where id = $1 returning *`,
      [
        input.scriptId,
        input.title ?? null,
        input.objective ?? null,
        input.hook ?? null,
        input.body ?? null,
        input.cta ?? null,
        input.notes ?? null,
        input.status ?? null,
        input.dueAt !== undefined,
        input.dueAt ?? null,
        input.version ?? null,
      ],
    );
    if (!rows[0]) throw new Error("No encontré el guion.");
    const row = serializableRow(rows[0]);
    const clientRows = await tx.query<Row>(
      "select slug from public.clients where id = $1",
      [row.client_id],
    );
    await insertActivity(tx, {
      userId: await userId(tx),
      clientId: id(row.client_id),
      type: "script.updated",
      title: `Martu actualizó el guion`,
      description: String(row.title),
      entityType: "script",
      entityId: id(row.id),
      targetPath: `/clients/${String(clientRows[0]?.slug ?? "")}/guiones`,
      metadata: {
        fields: Object.keys(input).filter((key) => key !== "scriptId"),
      },
    });
    return row;
  });
}

export function completeScript(scriptId: string) {
  return updateScript({ scriptId, status: "approved" });
}
export function rescheduleScript(scriptId: string, dueAt: string) {
  return updateScript({ scriptId, dueAt });
}

export async function createCommitment(input: {
  clientSlug?: string;
  title: string;
  intention: string;
  dueAt: string;
  source?: string;
  taskId?: string;
  scriptId?: string;
  contentItemId?: string;
  meetingId?: string;
  sourceMessageId?: string;
}): Promise<SerializableRow> {
  return transaction(async (tx) => {
    const martuId = await userId(tx);
    const client = await clientRef(tx, input.clientSlug);
    const rows = await tx.query<Row>(
      `insert into public.commitments (
         user_id, client_id, task_id, script_id, content_item_id, meeting_id, source_message_id,
         title, intention, status, due_at, source
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'open',$10,$11) returning *`,
      [
        martuId,
        client?.id ?? null,
        input.taskId ?? null,
        input.scriptId ?? null,
        input.contentItemId ?? null,
        input.meetingId ?? null,
        input.sourceMessageId ?? null,
        input.title.trim(),
        input.intention.trim(),
        input.dueAt,
        input.source ?? "chat",
      ],
    );
    const row = serializableRow(rows[0]!);
    await insertActivity(tx, {
      userId: martuId,
      clientId: client?.id,
      actor: "Supervisora",
      type: "commitment.created",
      title: `Compromiso: ${input.title}`,
      entityType: "commitment",
      entityId: id(row.id),
      targetPath: client
        ? `/clients/${client.slug}?assistant=open`
        : "/day?assistant=open",
      metadata: { dueAt: input.dueAt },
    });
    return Object.assign(row, { client_slug: client?.slug ?? null });
  });
}

export async function updateCommitment(input: {
  commitmentId: string;
  title?: string;
  intention?: string;
  status?: string;
  dueAt?: string;
}): Promise<SerializableRow> {
  const rows = await dbQuery<Row>(
    `update public.commitments set title = coalesce($2,title), intention = coalesce($3,intention),
       status = coalesce($4,status), due_at = coalesce($5,due_at),
       completed_at = case when $4 = 'done' then now() when $4 is not null then null else completed_at end
     where id = $1 returning *`,
    [
      input.commitmentId,
      input.title ?? null,
      input.intention ?? null,
      input.status ?? null,
      input.dueAt ?? null,
    ],
  );
  if (!rows[0]) throw new Error("No encontré el compromiso.");
  return serializableRow(rows[0]);
}

export function completeCommitment(commitmentId: string) {
  return updateCommitment({ commitmentId, status: "done" });
}
export async function rescheduleCommitment(
  commitmentId: string,
  dueAt: string,
) {
  return transaction(async (tx) => {
    const rows = await tx.query<Row>(
      "update public.commitments set due_at = $2, status = 'open', completed_at = null where id = $1 returning *",
      [commitmentId, dueAt],
    );
    if (!rows[0]) throw new Error("No encontré el compromiso.");
    await tx.query(
      "update public.reminders set remind_at = $2, status = 'pending', next_followup_at = null where commitment_id = $1 and status <> 'cancelled'",
      [commitmentId, dueAt],
    );
    return serializableRow(rows[0]);
  });
}

export async function createReminder(input: {
  clientSlug?: string;
  title: string;
  remindAt: string;
  commitmentId?: string;
  taskId?: string;
  channel?: string;
  targetPath?: string;
  nextFollowupAt?: string;
  cooldownKey?: string;
}): Promise<SerializableRow> {
  return transaction(async (tx) => {
    const martuId = await userId(tx);
    const client = await clientRef(tx, input.clientSlug);
    const rows = await tx.query<Row>(
      `insert into public.reminders (
         user_id, client_id, task_id, commitment_id, title, status, remind_at,
         next_followup_at, channel, target_path, cooldown_key
       ) values ($1,$2,$3,$4,$5,'pending',$6,$7,$8,$9,$10) returning *`,
      [
        martuId,
        client?.id ?? null,
        input.taskId ?? null,
        input.commitmentId ?? null,
        input.title,
        input.remindAt,
        input.nextFollowupAt ?? null,
        input.channel ?? "web_push",
        input.targetPath ??
          (client
            ? `/clients/${client.slug}?assistant=open`
            : "/day?assistant=open"),
        input.cooldownKey ?? null,
      ],
    );
    return serializableRow(rows[0]!);
  });
}

export async function updateReminder(input: {
  reminderId: string;
  status?: string;
  remindAt?: string;
  nextFollowupAt?: string | null;
  lastTriggeredAt?: string;
}): Promise<SerializableRow> {
  const rows = await dbQuery<Row>(
    `update public.reminders set status = coalesce($2,status), remind_at = coalesce($3,remind_at),
       next_followup_at = case when $4 then $5 else next_followup_at end,
       last_triggered_at = coalesce($6,last_triggered_at) where id = $1 returning *`,
    [
      input.reminderId,
      input.status ?? null,
      input.remindAt ?? null,
      input.nextFollowupAt !== undefined,
      input.nextFollowupAt ?? null,
      input.lastTriggeredAt ?? null,
    ],
  );
  if (!rows[0]) throw new Error("No encontré el recordatorio.");
  return serializableRow(rows[0]);
}

export async function getOrCreateChatThread(input: {
  threadId?: string;
  clientSlug?: string;
  title?: string;
  source?: string;
  createNew?: boolean;
}): Promise<ChatThread & Row> {
  if (input.threadId) {
    const rows = await dbQuery<Row>(
      "select * from public.chat_threads where id = $1",
      [input.threadId],
    );
    if (!rows[0]) throw new Error("No encontré la conversación.");
    const row = serializableRow(rows[0]);
    return Object.assign(row, {
      id: id(row.id),
      clientId: row.client_id ? id(row.client_id) : null,
      clientSlug: input.clientSlug ?? null,
      scope: String(row.scope),
      title: String(row.title),
      source: String(row.source),
      lastMessageAt: nullableIso(row.last_message_at),
      createdAt: iso(row.created_at),
      messages: [],
    }) as ChatThread & Row;
  }
  return transaction(async (tx) => {
    const martuId = await userId(tx);
    const client = await clientRef(tx, input.clientSlug);
    const existing = input.createNew
      ? []
      : await tx.query<Row>(
          `select * from public.chat_threads where user_id = $1 and
         (($2::bigint is null and scope = 'global') or client_id = $2)
         order by updated_at desc limit 1`,
          [martuId, client?.id ?? null],
        );
    const raw =
      existing[0] ??
      (
        await tx.query<Row>(
          `insert into public.chat_threads (user_id, client_id, scope, title, source)
       values ($1,$2,$3,$4,$5) returning *`,
          [
            martuId,
            client?.id ?? null,
            client ? "client" : "global",
            input.title ?? "Supervisora",
            input.source ?? "web",
          ],
        )
      )[0]!;
    const row = serializableRow(raw);
    return Object.assign(row, {
      id: id(row.id),
      clientId: client?.id ?? null,
      clientSlug: client?.slug ?? null,
      scope: String(row.scope),
      title: String(row.title),
      source: String(row.source),
      lastMessageAt: nullableIso(row.last_message_at),
      createdAt: iso(row.created_at),
      messages: [],
    }) as ChatThread & Row;
  });
}

export async function appendChatMessage(input: {
  threadId: string;
  role: ChatMessage["role"];
  content: string;
  mode?: ChatMessage["mode"];
  toolName?: string;
  toolPayload?: Record<string, unknown>;
  actionResult?: Record<string, unknown>;
}): Promise<ChatMessage & Row> {
  if (!input.content.trim())
    throw new Error("El mensaje no puede estar vacío.");
  return transaction(async (tx) => {
    const rows = await tx.query<Row>(
      `insert into public.chat_messages (thread_id, role, content, mode, tool_name, tool_payload, action_result)
       values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb) returning *`,
      [
        input.threadId,
        input.role,
        input.content.trim(),
        input.mode ?? "supervisor",
        input.toolName ?? null,
        input.toolPayload ? JSON.stringify(input.toolPayload) : null,
        input.actionResult ? JSON.stringify(input.actionResult) : null,
      ],
    );
    await tx.query(
      "update public.chat_threads set last_message_at = now() where id = $1",
      [input.threadId],
    );
    const row = serializableRow(rows[0]!);
    return Object.assign(row, {
      id: id(row.id),
      threadId: id(row.thread_id),
      role: String(row.role),
      content: String(row.content),
      mode: String(row.mode),
      toolName: row.tool_name ? String(row.tool_name) : null,
      toolPayload:
        row.tool_payload == null ? null : jsonObject(row.tool_payload),
      actionResult:
        row.action_result == null ? null : jsonObject(row.action_result),
      createdAt: iso(row.created_at),
    }) as ChatMessage & Row;
  });
}

export async function upsertMemory(input: {
  clientId?: string;
  clientSlug?: string;
  scope: "global" | "client";
  category: string;
  fact: string;
  importance?: number;
  source?: string;
  sourceMessageId?: string;
}): Promise<Memory & Row> {
  return transaction(async (tx) => {
    const martuId = await userId(tx);
    const client = input.clientId
      ? { id: input.clientId, slug: input.clientSlug ?? null }
      : await clientRef(tx, input.clientSlug);
    if (input.scope === "client" && !client)
      throw new Error("La memoria de cliente necesita un cliente.");
    const existing = await tx.query<Row>(
      `select * from public.memories where user_id = $1 and client_id is not distinct from $2
       and category = $3 and fact = $4 and lifecycle_status = 'active' limit 1`,
      [
        martuId,
        input.scope === "client" ? (client?.id ?? null) : null,
        input.category,
        input.fact.trim(),
      ],
    );
    const raw = existing[0]
      ? (
          await tx.query<Row>(
            "update public.memories set importance = greatest(importance,$2), last_used_at = now() where id = $1 returning *",
            [existing[0].id, input.importance ?? 3],
          )
        )[0]!
      : (
          await tx.query<Row>(
            `insert into public.memories (user_id, client_id, scope, category, fact, importance, source, source_message_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
            [
              martuId,
              input.scope === "client" ? (client?.id ?? null) : null,
              input.scope,
              input.category,
              input.fact.trim(),
              input.importance ?? 3,
              input.source ?? "manual",
              input.sourceMessageId ?? null,
            ],
          )
        )[0]!;
    const row = serializableRow(raw);
    return Object.assign(row, {
      id: id(row.id),
      clientId: row.client_id ? id(row.client_id) : null,
      clientSlug: input.clientSlug ?? null,
      scope: String(row.scope),
      category: String(row.category),
      fact: String(row.fact),
      importance: number(row.importance),
      source: String(row.source),
      lastUsedAt: nullableIso(row.last_used_at),
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
    }) as Memory & Row;
  });
}

export async function updateCommunicationProfile(
  input: Partial<Omit<CommunicationProfile, "id" | "updatedAt">>,
): Promise<CommunicationProfile & Row> {
  const fields: Array<[keyof typeof input, string]> = [
    ["language", "language"],
    ["formality", "formality"],
    ["preferredLength", "preferred_length"],
    ["humor", "humor"],
    ["insistenceLevel", "insistence_level"],
    ["quietHoursStart", "quiet_hours_start"],
    ["quietHoursEnd", "quiet_hours_end"],
    ["morningBriefingAt", "morning_briefing_at"],
    ["morningBriefingEnabled", "morning_briefing_enabled"],
    ["middayCheckAt", "midday_check_at"],
    ["middayCheckEnabled", "midday_check_enabled"],
    ["endOfDayAt", "end_of_day_at"],
    ["endOfDayEnabled", "end_of_day_enabled"],
    ["expressions", "expressions"],
    ["minorTaskLeadHours", "minor_task_lead_hours"],
    ["explicitPreferences", "explicit_preferences"],
  ];
  const updates = fields.filter(([key]) => input[key] !== undefined);
  if (updates.length === 0) {
    const { getCommunicationProfile } = await import("./queries");
    return getCommunicationProfile();
  }
  const params: unknown[] = [];
  const sets = updates.map(([key, column]) => {
    params.push(input[key]);
    return `${column} = $${params.length}`;
  });
  params.push(await requireAppUserId());
  const rows = await dbQuery<Row>(
    `update public.communication_profiles set ${sets.join(", ")}
     where user_id = $${params.length} returning *`,
    params,
  );
  if (!rows[0]) throw new Error("No encontré el perfil de comunicación.");
  const row = serializableRow(rows[0]);
  return Object.assign(row, {
    id: id(row.id),
    language: String(row.language),
    formality: number(row.formality),
    preferredLength: String(row.preferred_length),
    humor: number(row.humor),
    insistenceLevel: number(row.insistence_level),
    quietHoursStart: String(row.quiet_hours_start),
    quietHoursEnd: String(row.quiet_hours_end),
    morningBriefingAt: String(row.morning_briefing_at),
    morningBriefingEnabled: Boolean(row.morning_briefing_enabled),
    middayCheckAt: String(row.midday_check_at),
    middayCheckEnabled: Boolean(row.midday_check_enabled),
    endOfDayAt: row.end_of_day_at ? String(row.end_of_day_at) : null,
    endOfDayEnabled: Boolean(row.end_of_day_enabled),
    expressions: stringArray(row.expressions),
    minorTaskLeadHours: number(row.minor_task_lead_hours),
    explicitPreferences: stringArray(row.explicit_preferences),
    updatedAt: iso(row.updated_at),
  }) as CommunicationProfile & Row;
}

export async function upsertNudge(input: {
  clientId?: string;
  taskId?: string;
  commitmentId?: string;
  reminderId?: string;
  kind: string;
  severity?: Nudge["severity"];
  title: string;
  message: string;
  dedupeKey: string;
  deliverAfter?: string;
  cooldownUntil?: string;
  targetPath?: string;
  quickActions?: Nudge["quickActions"];
  metadata?: Record<string, unknown>;
}): Promise<SerializableRow | null> {
  const ownerId = await requireAppUserId();
  const rows = await dbQuery<Row>(
    `insert into public.ai_nudges (
       user_id, client_id, task_id, commitment_id, reminder_id, kind, severity, title,
       message, dedupe_key, deliver_after, cooldown_until, target_path, quick_actions, metadata
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15::jsonb)
     on conflict do nothing returning *`,
    [
      ownerId,
      input.clientId ?? null,
      input.taskId ?? null,
      input.commitmentId ?? null,
      input.reminderId ?? null,
      input.kind,
      input.severity ?? "medium",
      input.title,
      input.message,
      input.dedupeKey,
      input.deliverAfter ?? new Date().toISOString(),
      input.cooldownUntil ?? null,
      input.targetPath ?? "/",
      JSON.stringify(input.quickActions ?? []),
      JSON.stringify(input.metadata ?? {}),
    ],
  );
  return rows[0] ? serializableRow(rows[0]) : null;
}

export async function markNudgeDelivered(
  nudgeId: string,
  input: { deliveredAt?: string; metadata?: Record<string, unknown> } = {},
) {
  const ownerId = await requireAppUserId();
  const rows = await dbQuery<Row>(
    "update public.ai_nudges set status = 'delivered', delivered_at = $2, metadata = metadata || $3::jsonb where id = $1 and user_id = $4 returning *",
    [
      nudgeId,
      input.deliveredAt ?? new Date().toISOString(),
      JSON.stringify(input.metadata ?? {}),
      ownerId,
    ],
  );
  return rows[0] ? serializableRow(rows[0]) : null;
}
export async function dismissNudge(nudgeId: string, reason = "dismissed") {
  const ownerId = await requireAppUserId();
  const rows = await dbQuery<Row>(
    "update public.ai_nudges set status = 'dismissed', metadata = metadata || $2::jsonb where id = $1 and user_id = $3 returning *",
    [nudgeId, JSON.stringify({ dismissalReason: reason }), ownerId],
  );
  return rows[0] ? serializableRow(rows[0]) : null;
}
export async function markNudgeActed(
  nudgeId: string,
  metadata: Record<string, unknown> = {},
) {
  const ownerId = await requireAppUserId();
  const rows = await dbQuery<Row>(
    "update public.ai_nudges set status = 'acted', acted_at = now(), metadata = metadata || $2::jsonb where id = $1 and user_id = $3 returning *",
    [nudgeId, JSON.stringify(metadata), ownerId],
  );
  return rows[0] ? serializableRow(rows[0]) : null;
}

export async function upsertPushSubscription(input: {
  endpoint: string;
  keys?: { p256dh: string; auth: string };
  p256dh?: string;
  auth?: string;
  userAgent?: string;
}): Promise<PushSubscriptionRecord & Row> {
  const p256dh = input.keys?.p256dh ?? input.p256dh;
  const auth = input.keys?.auth ?? input.auth;
  if (!input.endpoint || !p256dh || !auth)
    throw new Error("Suscripción push incompleta.");
  const ownerId = await requireAppUserId();
  const rows = await dbQuery<Row>(
    `insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     values ($1,$2,$3,$4,$5)
     on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth,
       user_agent = excluded.user_agent, status = 'active', failure_count = 0 returning *`,
    [ownerId, input.endpoint, p256dh, auth, input.userAgent ?? null],
  );
  const row = serializableRow(rows[0]!);
  return Object.assign(row, {
    id: id(row.id),
    endpoint: String(row.endpoint),
    p256dh: String(row.p256dh),
    auth: String(row.auth),
    userAgent: row.user_agent ? String(row.user_agent) : null,
    status: String(row.status),
    lastUsedAt: nullableIso(row.last_used_at),
    failureCount: number(row.failure_count),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }) as PushSubscriptionRecord & Row;
}

export async function deletePushSubscription(
  endpoint: string,
): Promise<boolean> {
  const rows = await dbQuery<Row>(
    "delete from public.push_subscriptions where endpoint = $1 returning id",
    [endpoint],
  );
  return rows.length > 0;
}

export async function markPushSubscriptionUsed(input: {
  endpoint: string;
  success: boolean;
}): Promise<void> {
  await dbQuery(
    `update public.push_subscriptions set last_used_at = now(),
       failure_count = case when $2 then 0 else failure_count + 1 end,
       status = case when not $2 and failure_count + 1 >= 3 then 'expired' else status end
     where endpoint = $1`,
    [input.endpoint, input.success],
  );
}
