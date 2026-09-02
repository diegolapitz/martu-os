import { addDays, startOfDay } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

import { query as dbQuery, type DatabaseRow } from "@/server/db";
import { getInstagramConnectionDto } from "@/server/instagram/repository";

import { listInsightsV1 } from "./insights";

import {
  APP_TIMEZONE,
  containsSearch,
  dueLabel,
  id,
  iso,
  jsonArray,
  jsonObject,
  localTime,
  nullableIso,
  number,
  statusLabel,
  stringArray,
} from "./serialize";
import type {
  ActivityItem,
  AdCreative,
  AgendaItem,
  BriefData,
  CampaignItem,
  ChatMessage,
  ChatThread,
  ClientFile,
  ClientIdea,
  ClientMeeting,
  ClientNote,
  ClientScript,
  ClientSummary,
  ClientTask,
  ClientWorkspaceData,
  CommunicationProfile,
  ContentItem,
  DayData,
  DeadlineItem,
  Memory,
  MetricItem,
  MetricSnapshot,
  Nudge,
  PushSubscriptionRecord,
  StrategyData,
  WorkspaceTab,
} from "./types";

type Row = DatabaseRow;

export class ClientNotFoundError extends Error {
  constructor(readonly slug: string) {
    super(`Client not found: ${slug}`);
    this.name = "ClientNotFoundError";
  }
}

function dayBounds(now: Date) {
  const localStart = startOfDay(toZonedTime(now, APP_TIMEZONE));
  return {
    start: fromZonedTime(localStart, APP_TIMEZONE).toISOString(),
    end: fromZonedTime(addDays(localStart, 1), APP_TIMEZONE).toISOString(),
  };
}

function entityTargetPath(input: {
  clientSlug?: unknown;
  entityType?: unknown;
  entityId?: unknown;
  workId?: unknown;
}) {
  const clientSlug = input.clientSlug ? String(input.clientSlug) : null;
  const entityType = String(input.entityType ?? "").toLocaleLowerCase("es");
  const entityId = input.entityId == null ? null : id(input.entityId);
  if (clientSlug && entityId) {
    const section = {
      idea: "ideas",
      script: "guiones",
      content: "contenido",
      content_item: "contenido",
      metric: "metricas",
      campaign: "pauta",
      creative: "pauta",
      meeting: "notas",
      note: "notas",
      file: "archivos",
    }[entityType];
    if (section) return `/clients/${clientSlug}/${section}/${entityId}`;
  }
  if (input.workId != null) return `/work?item=${id(input.workId)}`;
  return clientSlug ? `/clients/${clientSlug}` : "/work";
}

async function servicesForClients(clientIds: string[]) {
  if (clientIds.length === 0) return new Map<string, Row[]>();
  const rows = await dbQuery<Row>(
    `select cs.client_id, s.slug, s.name, s.short_name, s.tab_key, s.sort_order
     from public.client_services cs
     join public.services s on s.id = cs.service_id
     where cs.is_active = true and s.archived_at is null and cs.client_id = any($1::bigint[])
     order by s.sort_order`,
    [clientIds],
  );
  const grouped = new Map<string, Row[]>();
  for (const row of rows) {
    const key = id(row.client_id);
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }
  return grouped;
}

export async function listClients(): Promise<ClientSummary[]> {
  const rows = await dbQuery<Row>(
    `select c.id, c.slug, c.name, c.description, c.summary, c.status, c.accent, c.logo_url, c.updated_at,
       (select min(t.due_at) from public.tasks t
        where t.client_id = c.id and t.archived_at is null and t.status in ('pending','in_progress','blocked')) as next_task_due,
       (select count(*)::text from public.tasks t
        where t.client_id = c.id and t.archived_at is null and t.status in ('pending','in_progress','blocked') and t.due_at < now()) as overdue_count,
       (select b.status from public.briefs b where b.client_id = c.id) as brief_status
     from public.clients c
     join public.users u on u.id = c.user_id
     where u.slug = 'martu' and c.status <> 'archived' and c.archived_at is null
     order by case c.slug when 'gavilan' then 0 else 1 end, c.name`,
  );
  const serviceRows = await servicesForClients(rows.map((row) => id(row.id)));

  return rows.map((row) => {
    const services = serviceRows.get(id(row.id)) ?? [];
    const overdue = number(row.overdue_count);
    const briefStatus = String(row.brief_status ?? "missing");
    const attention =
      overdue > 0
        ? `${overdue} ${overdue === 1 ? "vencida" : "vencidas"}`
        : briefStatus !== "complete"
          ? "Brief incompleto"
          : null;
    return {
      id: id(row.id),
      slug: String(row.slug),
      name: String(row.name),
      description: String(row.description),
      summary: String(row.summary),
      status: statusLabel(row.status),
      services: services.map((service) => String(service.short_name)),
      serviceSlugs: services.map((service) => String(service.slug)),
      accent: row.accent ? String(row.accent) : null,
      logoUrl: row.logo_url ? String(row.logo_url) : null,
      nextDeadline: row.next_task_due ? dueLabel(row.next_task_due) : null,
      nextDeadlineAt: nullableIso(row.next_task_due),
      attention,
      updatedAt: nullableIso(row.updated_at),
    };
  });
}

export async function getDayData(
  options: { now?: Date } = {},
): Promise<DayData> {
  const now = options.now ?? new Date();
  const { start, end } = dayBounds(now);

  // The cloud client intentionally uses a single Supavisor connection per
  // serverless runtime. Issue this dashboard's independent reads in the same
  // order instead of making postgres.js coordinate a concurrent queue over
  // that one connection; on a reused Vercel runtime the queued Promise.all
  // could remain suspended after every SQL statement had already completed.
  const taskRows = await dbQuery<Row>(
    `select t.*, c.name as client_name, c.slug as client_slug
       from public.tasks t
       left join public.clients c on c.id = t.client_id
       join public.users u on u.id = t.user_id
       where u.slug = 'martu' and t.archived_at is null and t.status in ('pending','in_progress','blocked')
         and (t.client_id is null or c.archived_at is null)
         and (t.snoozed_until is null or t.snoozed_until <= now())
       order by
         case when t.due_at < now() then 0 else 1 end,
         t.due_at asc nulls last,
         case t.priority when 'urgent' then 0 when 'high' then 1 when 'medium' then 2 else 3 end,
       t.updated_at desc`,
  );
  const meetingRows = await dbQuery<Row>(
    `select m.id, m.title, m.starts_at, c.name as client_name, c.slug as client_slug
       from public.meetings m join public.clients c on c.id = m.client_id
       where c.archived_at is null and m.starts_at >= $1 and m.starts_at < $2 order by m.starts_at`,
    [start, end],
  );
  const contentRows = await dbQuery<Row>(
    `select ci.id, ci.title, ci.due_at, ci.status, c.name as client_name, c.slug as client_slug
       from public.content_items ci join public.clients c on c.id = ci.client_id
       left join public.content_workflow_states ws on ws.id = ci.workflow_state_id
        where ci.archived_at is null and c.archived_at is null and ws.terminal_kind is null
          and ci.due_at >= $1 and ci.due_at < $2 and ci.status not in ('published','delivered')
       order by ci.due_at`,
    [start, end],
  );
  const countRows = await dbQuery<Row>(
    `select
         count(*) filter (where status in ('pending','in_progress','blocked'))::text as open_count,
         count(*) filter (where status in ('pending','in_progress','blocked') and due_at < now())::text as overdue_count
       from public.tasks t where t.archived_at is null and
         (t.client_id is null or exists (select 1 from public.clients c where c.id = t.client_id and c.archived_at is null))`,
  );
  const pendingNudgeRows = await dbQuery<Row>(
    `select count(*)::text as count from public.ai_nudges
       where status in ('pending','delivered','seen')
         and lifecycle_state in ('active','snoozed')
         and (snoozed_until is null or snoozed_until <= now())`,
  );
  const clients = await listClients();

  const priorities = taskRows.slice(0, 5).map((row) => {
    const clientSlug = row.client_slug ? String(row.client_slug) : undefined;
    const entityType = row.entity_type ? String(row.entity_type) : undefined;
    const entityId = row.entity_id ? id(row.entity_id) : undefined;
    return {
      id: id(row.id),
      title: String(row.title),
      clientName: row.client_name ? String(row.client_name) : undefined,
      clientSlug,
      dueLabel: row.due_at ? dueLabel(row.due_at, now) : undefined,
      status: statusLabel(row.status),
      entityType,
      entityId,
      targetPath: entityTargetPath({
        clientSlug,
        entityType,
        entityId,
        workId: row.id,
      }),
    };
  });

  const agenda: AgendaItem[] = [
    ...taskRows
      .filter(
        (row) =>
          row.due_at && iso(row.due_at) >= start && iso(row.due_at) < end,
      )
      .map((row) => ({
        id: `task-${id(row.id)}`,
        time: localTime(row.due_at),
        title: String(row.title),
        subtitle: statusLabel(row.status),
        clientName: row.client_name ? String(row.client_name) : undefined,
        clientSlug: row.client_slug ? String(row.client_slug) : undefined,
        entityType: row.entity_type ? String(row.entity_type) : "task",
        entityId: row.entity_id ? id(row.entity_id) : id(row.id),
        targetPath: entityTargetPath({
          clientSlug: row.client_slug,
          entityType: row.entity_type,
          entityId: row.entity_id,
          workId: row.id,
        }),
        tone: (new Date(iso(row.due_at)) < now
          ? "danger"
          : "warning") as AgendaItem["tone"],
      })),
    ...meetingRows.map((row) => ({
      id: `meeting-${id(row.id)}`,
      time: localTime(row.starts_at),
      title: String(row.title),
      subtitle: "Reunión",
      clientName: String(row.client_name),
      clientSlug: String(row.client_slug),
      tone: "info" as const,
      entityType: "meeting",
      entityId: id(row.id),
      targetPath: entityTargetPath({
        clientSlug: row.client_slug,
        entityType: "meeting",
        entityId: row.id,
      }),
    })),
    ...contentRows.map((row) => ({
      id: `content-${id(row.id)}`,
      time: localTime(row.due_at),
      title: String(row.title),
      subtitle: statusLabel(row.status),
      clientName: String(row.client_name),
      clientSlug: String(row.client_slug),
      tone: "neutral" as const,
      entityType: "content",
      entityId: id(row.id),
      targetPath: entityTargetPath({
        clientSlug: row.client_slug,
        entityType: "content",
        entityId: row.id,
      }),
    })),
  ].sort((a, b) => a.time.localeCompare(b.time));

  const clientsNeedingAttention: Array<{
    id: string;
    slug: string;
    name: string;
    reason: string;
    detail: string;
    tone: "danger" | "warning" | "info";
    targetPath: string;
  }> = [];
  const attentionByClient = new Map<
    string,
    (typeof clientsNeedingAttention)[number]
  >();
  for (const row of taskRows) {
    if (!row.client_slug || attentionByClient.has(String(row.client_slug)))
      continue;
    const overdue = Boolean(row.due_at && new Date(iso(row.due_at)) < now);
    const blocked = String(row.status) === "blocked";
    if (!overdue && !blocked) continue;
    const item = {
      id: id(row.client_id),
      slug: String(row.client_slug),
      name: String(row.client_name),
      reason: String(row.title),
      detail: blocked
        ? "Está bloqueado y necesita una decisión."
        : `${dueLabel(row.due_at, now)}. Sigue abierto.`,
      tone: (overdue ? "danger" : blocked ? "warning" : "info") as
        | "danger"
        | "warning"
        | "info",
      targetPath: entityTargetPath({
        clientSlug: row.client_slug,
        entityType: row.entity_type,
        entityId: row.entity_id,
        workId: row.id,
      }),
    };
    attentionByClient.set(item.slug, item);
    clientsNeedingAttention.push(item);
    if (clientsNeedingAttention.length === 4) break;
  }
  for (const client of clients) {
    if (clientsNeedingAttention.length === 4) break;
    if (!client.attention || attentionByClient.has(client.slug)) continue;
    const item = {
      id: client.id,
      slug: client.slug,
      name: client.name,
      reason: client.attention,
      detail: "Falta contexto para que el trabajo avance sin adivinar.",
      tone: "warning" as const,
      targetPath: `/clients/${client.slug}`,
    };
    attentionByClient.set(item.slug, item);
    clientsNeedingAttention.push(item);
  }

  const spotlightPriority = priorities[0];
  const supervisorMessage = spotlightPriority
    ? `${spotlightPriority.clientName ? `${spotlightPriority.clientName}: ` : ""}${spotlightPriority.title}. ${spotlightPriority.dueLabel || "Está en la lista de hoy"}.`
    : "No hay urgencias abiertas. Buen momento para elegir el próximo frente.";
  const spotlight = spotlightPriority
    ? {
        workId: spotlightPriority.id,
        clientName: spotlightPriority.clientName,
        clientSlug: spotlightPriority.clientSlug,
        targetPath: spotlightPriority.targetPath,
        actionLabel:
          spotlightPriority.entityType === "script"
            ? "Abrir guion"
            : spotlightPriority.entityType === "content"
              ? "Abrir contenido"
              : "Abrir trabajo",
      }
    : null;

  return {
    date: now.toISOString(),
    greeting: "Buen día, Martu.",
    supervisorMessage,
    spotlight,
    priorities,
    agenda,
    clientsNeedingAttention,
    stats: {
      openTasks: number(countRows[0]?.open_count),
      overdueTasks: number(countRows[0]?.overdue_count),
      pendingNudges: number(pendingNudgeRows[0]?.count),
    },
  };
}

function workspaceTabs(serviceRows: Row[]): WorkspaceTab[] {
  const labels: Record<string, string> = {
    resumen: "Resumen",
    estrategia: "Estrategia",
    ideas: "Ideas",
    guiones: "Guiones",
    contenido: "Contenido",
    calendario: "Calendario",
    metricas: "Métricas",
    pauta: "Pauta",
    "reuniones-notas": "Reuniones y notas",
    archivos: "Archivos",
    actividad: "Actividad",
  };
  const order = [
    "resumen",
    "estrategia",
    "ideas",
    "guiones",
    "contenido",
    "calendario",
    "metricas",
    "pauta",
    "reuniones-notas",
    "archivos",
    "actividad",
  ];
  const enabled = new Set<string>([
    "resumen",
    "calendario",
    "reuniones-notas",
    "archivos",
    "actividad",
  ]);
  for (const row of serviceRows)
    if (row.tab_key) enabled.add(String(row.tab_key));
  return order
    .filter((tab) => enabled.has(tab))
    .map((tab) => ({ id: tab, label: labels[tab]! }));
}

function mapNote(row: Row): ClientNote {
  return {
    id: id(row.id),
    text: String(row.text),
    tags: stringArray(row.tags),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapMeeting(row: Row): ClientMeeting {
  return {
    id: id(row.id),
    title: String(row.title),
    date: iso(row.starts_at),
    duration: `${number(row.duration_minutes)} min`,
    durationMinutes: number(row.duration_minutes),
    summary: String(row.summary),
    decisions: stringArray(row.decisions),
    commitments: stringArray(row.next_steps),
    nextSteps: stringArray(row.next_steps),
  };
}

function mapContent(row: Row): ContentItem {
  return {
    id: id(row.id),
    title: String(row.title),
    status: row.workflow_state_label
      ? String(row.workflow_state_label)
      : statusLabel(row.status),
    format: String(row.format),
    channel: String(row.channel),
    updatedAt: iso(row.updated_at),
    caption: row.caption == null ? null : String(row.caption),
    cta: row.cta == null ? null : String(row.cta),
    notes: row.notes == null ? null : String(row.notes),
    deadline: nullableIso(row.due_at),
    scriptId: row.script_id ? id(row.script_id) : null,
    ideaId: row.idea_id ? id(row.idea_id) : null,
    publicationId: row.publication_id ? id(row.publication_id) : null,
    publishedAt: nullableIso(row.published_at),
    pipelinePosition: number(row.pipeline_position),
  };
}

function mapTask(row: Row): ClientTask {
  return {
    id: id(row.id),
    title: String(row.title),
    description: String(row.description),
    status: statusLabel(row.status),
    priority: String(row.priority),
    dueAt: nullableIso(row.due_at),
    dueLabel: row.due_at ? dueLabel(row.due_at) : undefined,
    entityType: row.entity_type ? String(row.entity_type) : undefined,
    entityId: row.entity_id ? id(row.entity_id) : null,
    updatedAt: iso(row.updated_at),
  };
}

export async function getClientWorkspace(
  slug: string,
  options: { tab?: string; query?: string } = {},
): Promise<ClientWorkspaceData> {
  const clients = await dbQuery<Row>(
    `select c.* from public.clients c join public.users u on u.id = c.user_id
     where u.slug = 'martu' and c.slug = $1 and c.status <> 'archived'`,
    [slug],
  );
  const clientRow = clients[0];
  if (!clientRow) throw new ClientNotFoundError(slug);
  const clientId = id(clientRow.id);
  const tabAliases: Record<string, string> = {
    summary: "resumen",
    strategy: "estrategia",
    scripts: "guiones",
    content: "contenido",
    calendar: "calendario",
    metrics: "metricas",
    ads: "pauta",
    notes: "notas",
    meetings: "notas",
    "reuniones-notas": "notas",
    files: "archivos",
    activity: "actividad",
  };
  const requestedTab = (options.tab || "resumen")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
  const tab = tabAliases[requestedTab] || requestedTab;
  const scoped = Boolean(options.tab);
  const needs = (...tabs: string[]) => !scoped || tabs.includes(tab);
  const optionalQuery = (
    enabled: boolean,
    sql: string,
    params: unknown[] = [clientId],
  ) => (enabled ? dbQuery<Row>(sql, params) : Promise.resolve<Row[]>([]));

  const [
    serviceRows,
    headerDeadlineRows,
    briefRows,
    strategyRows,
    ideaRows,
    scriptRows,
    contentRows,
    taskRows,
    noteRows,
    meetingRows,
    fileRows,
    metricRows,
    snapshotRows,
    insights,
    campaignRows,
    creativeRows,
    activityRows,
    workflowRows,
    instagram,
  ] = await Promise.all([
    dbQuery<Row>(
      `select s.slug, s.name, s.short_name, s.tab_key, s.sort_order from public.client_services cs
       join public.services s on s.id = cs.service_id where cs.client_id = $1 and cs.is_active = true
       and s.archived_at is null order by s.sort_order`,
      [clientId],
    ),
    dbQuery<Row>(
      `select title, due_at from (
        select title, due_at from public.tasks where client_id = $1 and archived_at is null and status not in ('completed','cancelled') and due_at is not null
        union all select title, due_at from public.content_items where client_id = $1 and archived_at is null and status not in ('published','delivered') and due_at is not null
        union all select title, starts_at as due_at from public.meetings where client_id = $1 and starts_at >= now()
      ) upcoming order by due_at limit 1`,
      [clientId],
    ),
    optionalQuery(
      needs("estrategia"),
      "select * from public.briefs where client_id = $1",
    ),
    optionalQuery(
      needs("estrategia"),
      "select * from public.strategies where client_id = $1 order by version desc limit 1",
    ),
    optionalQuery(
      needs("ideas"),
      `select i.*, (select ci.id from public.content_items ci where ci.idea_id = i.id order by ci.updated_at desc limit 1) as content_id
       , (select s.id from public.scripts s where s.idea_id = i.id and s.status <> 'archived' order by s.updated_at desc limit 1) as script_id
       from public.ideas i where i.client_id = $1 and i.archived_at is null and i.deleted_at is null order by i.updated_at desc`,
    ),
    optionalQuery(
      needs("guiones"),
      `select s.*, (select ci.id from public.content_items ci where ci.script_id = s.id and ci.archived_at is null order by ci.updated_at desc limit 1) as content_id
       from public.scripts s where s.client_id = $1 and s.status <> 'archived' order by s.script_number nulls last, s.updated_at desc`,
    ),
    optionalQuery(
      needs("resumen", "contenido", "calendario", "metricas"),
      `select ci.*, ws.slug as workflow_state, ws.label as workflow_state_label,
        (select p.id from public.publications p where p.content_item_id = ci.id order by p.published_at desc nulls last, p.created_at desc limit 1) as publication_id
       from public.content_items ci left join public.content_workflow_states ws on ws.id = ci.workflow_state_id
       where ci.client_id = $1 and ci.archived_at is null order by ci.updated_at desc`,
    ),
    optionalQuery(
      needs("resumen", "calendario"),
      "select * from public.tasks where client_id = $1 and archived_at is null order by due_at asc nulls last, updated_at desc",
    ),
    optionalQuery(
      needs("resumen", "notas"),
      "select * from public.notes where client_id = $1 order by created_at desc",
    ),
    optionalQuery(
      needs("resumen", "notas", "calendario"),
      "select * from public.meetings where client_id = $1 order by starts_at desc",
    ),
    optionalQuery(
      needs("archivos"),
      "select * from public.file_links where client_id = $1 order by updated_at desc",
    ),
    optionalQuery(
      needs("resumen", "metricas"),
      `select cm.*, ci.title as content_title from public.content_metrics cm
       join public.content_items ci on ci.id = cm.content_item_id
       where ci.client_id = $1 order by cm.captured_at desc, cm.views desc`,
    ),
    optionalQuery(
      needs("metricas"),
      "select * from public.metric_snapshots where client_id = $1 order by period_end desc",
    ),
    needs("resumen", "metricas", "pauta")
      ? listInsightsV1({
          clientSlug: slug,
          surface:
            tab === "metricas" ? "metrics" : tab === "pauta" ? "ads" : undefined,
        })
      : Promise.resolve([]),
    optionalQuery(
      needs("pauta"),
      "select * from public.ad_campaigns where client_id = $1 order by updated_at desc",
    ),
    optionalQuery(
      needs("pauta"),
      `select ac.* from public.ad_creatives ac join public.ad_campaigns c on c.id = ac.campaign_id
       where c.client_id = $1 order by ac.updated_at desc`,
    ),
    optionalQuery(
      needs("resumen", "actividad"),
      "select * from public.activity_events where client_id = $1 order by occurred_at desc limit 60",
    ),
    optionalQuery(
      needs("contenido"),
      `select ws.id, ws.slug, ws.label, ws.color, ws.position, ws.terminal_kind
      from public.content_workflow_states ws join public.content_workflows w on w.id = ws.workflow_id
      where w.client_id = $1 and w.is_default and ws.is_visible order by ws.position`,
    ),
    needs("metricas") ? getInstagramConnectionDto(slug) : Promise.resolve(undefined),
  ]);

  const search = options.query?.trim() ?? "";
  const ideas: ClientIdea[] = ideaRows
    .map((row) => ({
      id: id(row.id),
      title: String(row.title),
      description: String(row.description),
      status: statusLabel(row.status),
      origin: String(row.origin),
      format: row.format == null ? null : String(row.format),
      notes: row.notes == null ? null : String(row.notes),
      tags: stringArray(row.tags),
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
      scriptId: row.script_id ? id(row.script_id) : null,
      contentId: row.content_id ? id(row.content_id) : null,
    }))
    .filter((item) =>
      containsSearch(
        [item.title, item.description, item.status, ...item.tags],
        search,
      ),
    );
  const scripts: ClientScript[] = scriptRows
    .map((row) => ({
      id: id(row.id),
      ideaId: row.idea_id ? id(row.idea_id) : null,
      number: row.script_number == null ? undefined : number(row.script_number),
      title: String(row.title),
      format: String(row.format),
      objective: String(row.objective),
      hook: String(row.hook),
      body: String(row.body),
      cta: String(row.cta),
      status: statusLabel(row.status),
      notes: String(row.notes),
      version: number(row.version, 1),
      updatedAt: iso(row.updated_at),
      deadline: nullableIso(row.due_at),
      contentId: row.content_id ? id(row.content_id) : null,
    }))
    .filter((item) =>
      containsSearch([item.title, item.hook, item.body, item.status], search),
    );
  const content = contentRows
    .map(mapContent)
    .filter((item) =>
      containsSearch([item.title, item.status, item.format], search),
    );
  const tasks = taskRows.map(mapTask);
  const notes = noteRows
    .map(mapNote)
    .filter((item) => containsSearch([item.text, ...item.tags], search));
  const meetings = meetingRows.map(mapMeeting);
  const files: ClientFile[] = fileRows.map((row) => ({
    id: id(row.id),
    name: String(row.name),
    type: String(row.kind),
    url: String(row.url),
    provider: String(row.provider),
    sizeLabel: row.size_label ? String(row.size_label) : null,
    updatedAt: iso(row.updated_at),
  }));
  const metrics: MetricItem[] = metricRows.map((row) => ({
    id: id(row.id),
    contentItemId: row.content_item_id ? id(row.content_item_id) : null,
    publicationId: row.publication_id ? id(row.publication_id) : null,
    contentTitle: String(row.content_title),
    date: iso(row.captured_at),
    reach: number(row.reach),
    views: number(row.views),
    retention:
      row.retention_rate == null ? undefined : number(row.retention_rate) * 100,
    saves: number(row.saves),
    shares: number(row.shares),
    comments: number(row.comments),
    clicks: number(row.clicks),
    inquiries: number(row.inquiries),
    conversions: number(row.conversions),
  }));
  const metricSnapshots: MetricSnapshot[] = snapshotRows.map((row) => ({
    id: id(row.id),
    periodStart: String(row.period_start),
    periodEnd: String(row.period_end),
    followers: row.followers == null ? undefined : number(row.followers),
    reach: number(row.reach),
    views: number(row.views),
    saves: number(row.saves),
    shares: number(row.shares),
    comments: number(row.comments),
    clicks: number(row.clicks),
    inquiries: number(row.inquiries),
    conversions: number(row.conversions),
  }));
  const creativesByCampaign = new Map<string, AdCreative[]>();
  for (const row of creativeRows) {
    const creative: AdCreative = {
      id: id(row.id),
      contentItemId: row.content_item_id ? id(row.content_item_id) : null,
      name: String(row.name),
      format: String(row.format),
      status: statusLabel(row.status),
      hook: String(row.hook),
      spend: number(row.spend),
      impressions: number(row.impressions),
      clicks: number(row.clicks),
      ctr: row.ctr == null ? undefined : number(row.ctr) * 100,
      cpc: row.cpc == null ? undefined : number(row.cpc),
      conversions: number(row.conversions),
      observations: String(row.observations),
    };
    const campaignId = id(row.campaign_id);
    creativesByCampaign.set(campaignId, [
      ...(creativesByCampaign.get(campaignId) ?? []),
      creative,
    ]);
  }
  const campaigns: CampaignItem[] = campaignRows.map((row) => ({
    id: id(row.id),
    name: String(row.name),
    objective: String(row.objective),
    status: statusLabel(row.status),
    spend: number(row.spend),
    impressions: number(row.impressions),
    clicks: number(row.clicks),
    ctr: row.ctr == null ? undefined : number(row.ctr) * 100,
    cpc: row.cpc == null ? undefined : number(row.cpc),
    cpa: row.cpa == null ? undefined : number(row.cpa),
    roas: row.roas == null ? undefined : number(row.roas),
    observations: String(row.observations),
    creatives: creativesByCampaign.get(id(row.id)) ?? [],
  }));
  const activity: ActivityItem[] = activityRows.map((row) => ({
    id: id(row.id),
    title: String(row.title),
    detail: String(row.description),
    createdAt: iso(row.occurred_at),
    kind: String(row.type),
    actor: String(row.actor),
    entityType: row.entity_type ? String(row.entity_type) : null,
    entityId: row.entity_id ? id(row.entity_id) : null,
    targetPath: row.target_path ? String(row.target_path) : null,
  }));

  const briefRow = briefRows[0];
  const brief: BriefData | null = briefRow
    ? {
        id: id(briefRow.id),
        status: statusLabel(briefRow.status),
        summary: String(briefRow.positioning),
        objectives: stringArray(briefRow.objectives),
        audience: String(briefRow.audience),
        tone: String(briefRow.tone),
        positioning: String(briefRow.positioning),
        differentiators: stringArray(briefRow.differentiators),
        constraints: stringArray(briefRow.constraints),
        updatedAt: iso(briefRow.updated_at),
      }
    : null;
  const strategyRow = strategyRows[0];
  const strategy: StrategyData | null = strategyRow
    ? {
        id: id(strategyRow.id),
        title: String(strategyRow.title),
        status: statusLabel(strategyRow.status),
        version: number(strategyRow.version),
        updatedAt: iso(strategyRow.updated_at),
        objectives: stringArray(strategyRow.objectives),
        audience: String(strategyRow.audience),
        tone: String(strategyRow.tone),
        positioning: String(strategyRow.positioning),
        pillars: stringArray(strategyRow.pillars),
        hypotheses: stringArray(strategyRow.hypotheses),
        decisions: stringArray(strategyRow.decisions),
        notes: strategyRow.notes == null ? null : String(strategyRow.notes),
        aiSuggestions:
          slug === "gavilan"
            ? [
                "Probar dos aperturas del reel corto con la misma oferta y comparar retención.",
              ]
            : [],
      }
    : null;

  const services = serviceRows.map((row) => String(row.short_name));
  const serviceSlugs = serviceRows.map((row) => String(row.slug));
  const client: ClientSummary = {
    id: clientId,
    slug: String(clientRow.slug),
    name: String(clientRow.name),
    description: String(clientRow.description),
    summary: String(clientRow.summary),
    status: statusLabel(clientRow.status),
    services,
    serviceSlugs,
    accent: clientRow.accent == null ? null : String(clientRow.accent),
    logoUrl: clientRow.logo_url == null ? null : String(clientRow.logo_url),
    updatedAt: nullableIso(clientRow.updated_at),
  };
  const deadlines: DeadlineItem[] = [
    ...taskRows
      .filter(
        (row) =>
          row.due_at &&
          !["completed", "cancelled"].includes(String(row.status)),
      )
      .map((row) => ({
        id: `task-${id(row.id)}`,
        title: String(row.title),
        date: iso(row.due_at),
        dateLabel: dueLabel(row.due_at),
        type: "Tarea",
        entityType: "task",
        entityId: id(row.id),
        targetPath: `/work?item=${id(row.id)}`,
      })),
    ...contentRows
      .filter(
        (row) =>
          row.due_at &&
          !["published", "delivered"].includes(String(row.status)),
      )
      .map((row) => ({
        id: `content-${id(row.id)}`,
        title: String(row.title),
        date: iso(row.due_at),
        dateLabel: dueLabel(row.due_at),
        type: "Contenido",
        entityType: "content",
        entityId: id(row.id),
        targetPath: `/clients/${slug}/contenido/${id(row.id)}`,
      })),
    ...meetingRows
      .filter((row) => new Date(iso(row.starts_at)) >= new Date())
      .map((row) => ({
        id: `meeting-${id(row.id)}`,
        title: String(row.title),
        date: iso(row.starts_at),
        dateLabel: dueLabel(row.starts_at),
        type: "Reunión",
        entityType: "meeting",
        entityId: id(row.id),
        targetPath: `/clients/${slug}/notas/${id(row.id)}`,
      })),
  ]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 8)
    .map((item) => ({
      ...item,
      urgent: new Date(item.date).valueOf() <= Date.now() + 86_400_000,
    }));
  const headerDeadline = headerDeadlineRows[0];
  client.nextDeadline = headerDeadline?.due_at
    ? `${dueLabel(headerDeadline.due_at)} · ${String(headerDeadline.title)}`
    : null;
  client.nextDeadlineAt = headerDeadline?.due_at
    ? iso(headerDeadline.due_at)
    : null;

  const openTasks = tasks.filter(
    (task) => !["Completada", "Cancelada"].includes(task.status),
  );
  const persistedSummaryInsight =
    insights.find((item) => item.kind === "recommendation") ??
    insights.find((item) => item.kind === "hypothesis") ??
    insights.find((item) => item.kind === "pattern") ??
    insights.find((item) => item.kind === "observation");
  const topMetric = metrics.reduce<MetricItem | null>(
    (best, item) => (!best || item.views > best.views ? item : best),
    null,
  );
  const insight = persistedSummaryInsight
    ? persistedSummaryInsight.statement
    : topMetric
      ? `${topMetric.contentTitle} registra la mayor cantidad de views del corte disponible (${topMetric.views.toLocaleString("es-AR")}). Es una observación descriptiva y no explica la causa.`
      : "Todavía no hay evidencia suficiente para sostener una lectura de rendimiento.";

  return {
    client,
    services,
    tabs: workspaceTabs(serviceRows),
    selectedTab: tab,
    searchQuery: search,
    summary: {
      deadlines,
      workInProgress: openTasks.slice(0, 5),
      pending: openTasks,
      recentNotes: notes.slice(0, 3),
      recentMeetings: meetings.slice(0, 3),
      recentContent: content.slice(0, 5),
      insight,
    },
    brief,
    strategy,
    ideas,
    scripts,
    content,
    tasks,
    notes,
    meetings,
    files,
    metrics,
    metricSnapshots,
    insights,
    campaigns,
    activity,
    instagram,
    workflowStates: workflowRows.map((row) => ({
      id: id(row.id),
      slug: String(row.slug),
      label: String(row.label),
      color: String(row.color),
      position: number(row.position),
      terminalKind:
        row.terminal_kind == null ? null : String(row.terminal_kind),
    })),
  };
}

export async function listNudges(
  options: {
    status?: Nudge["status"] | "active";
    clientSlug?: string;
    limit?: number;
  } = {},
): Promise<Nudge[]> {
  const status = options.status ?? "active";
  const rows = await dbQuery<Row>(
    `select n.*, c.slug as client_slug, c.name as client_name from public.ai_nudges n
     left join public.clients c on c.id = n.client_id
     where ($1 = 'active' and n.status in ('pending','delivered','seen') or n.status = $1)
       and n.lifecycle_state in ('active','snoozed') and (n.snoozed_until is null or n.snoozed_until <= now())
       and ($2::text is null or c.slug = $2)
     order by case n.severity when 'urgent' then 0 when 'high' then 1 when 'medium' then 2 else 3 end,
       n.deliver_after asc limit $3`,
    [status, options.clientSlug ?? null, Math.min(options.limit ?? 50, 100)],
  );
  return rows.map((row) => ({
    id: id(row.id),
    clientId: row.client_id ? id(row.client_id) : null,
    clientSlug: row.client_slug ? String(row.client_slug) : null,
    clientName: row.client_name ? String(row.client_name) : null,
    taskId: row.task_id ? id(row.task_id) : null,
    commitmentId: row.commitment_id ? id(row.commitment_id) : null,
    reminderId: row.reminder_id ? id(row.reminder_id) : null,
    kind: String(row.kind),
    severity: String(row.severity) as Nudge["severity"],
    title: String(row.title),
    message: String(row.message),
    status: String(row.status) as Nudge["status"],
    dedupeKey: String(row.dedupe_key),
    deliverAfter: iso(row.deliver_after),
    cooldownUntil: nullableIso(row.cooldown_until),
    deliveredAt: nullableIso(row.delivered_at),
    targetPath: String(row.target_path),
    quickActions: jsonArray<Nudge["quickActions"][number]>(row.quick_actions),
    metadata: jsonObject(row.metadata),
    createdAt: iso(row.created_at),
  }));
}

export function listChatMessages(
  threadId: string,
  options?: { limit?: number },
): Promise<ChatMessage[]>;
export function listChatMessages(options: {
  threadId: string;
  limit?: number;
}): Promise<Array<ChatMessage & Row>>;
export async function listChatMessages(
  threadIdOrOptions: string | { threadId: string; limit?: number },
  options: { limit?: number } = {},
): Promise<Array<ChatMessage & Row>> {
  const threadId =
    typeof threadIdOrOptions === "string"
      ? threadIdOrOptions
      : threadIdOrOptions.threadId;
  const limit =
    typeof threadIdOrOptions === "string"
      ? options.limit
      : threadIdOrOptions.limit;
  const rows = await dbQuery<Row>(
    `select * from (select * from public.chat_messages where thread_id = $1 order by created_at desc limit $2) recent
     order by created_at`,
    [threadId, Math.min(limit ?? 40, 100)],
  );
  return rows.map(
    (row) =>
      Object.assign(row, {
        id: id(row.id),
        threadId: id(row.thread_id),
        role: String(row.role) as ChatMessage["role"],
        content: String(row.content),
        mode: String(row.mode) as ChatMessage["mode"],
        toolName: row.tool_name ? String(row.tool_name) : null,
        toolPayload:
          row.tool_payload == null ? null : jsonObject(row.tool_payload),
        actionResult:
          row.action_result == null ? null : jsonObject(row.action_result),
        createdAt: iso(row.created_at),
      }) as ChatMessage & Row,
  );
}

export async function getChatThread(
  options: { threadId?: string; clientSlug?: string; limit?: number } = {},
): Promise<ChatThread | null> {
  const rows = options.threadId
    ? await dbQuery<Row>(
        `select t.*, c.slug as client_slug from public.chat_threads t left join public.clients c on c.id = t.client_id
       where t.id = $1`,
        [options.threadId],
      )
    : await dbQuery<Row>(
        `select t.*, c.slug as client_slug from public.chat_threads t left join public.clients c on c.id = t.client_id
       join public.users u on u.id = t.user_id
       where u.slug = 'martu' and (($1::text is null and t.scope = 'global') or c.slug = $1)
       order by t.updated_at desc limit 1`,
        [options.clientSlug ?? null],
      );
  const row = rows[0];
  if (!row) return null;
  return {
    id: id(row.id),
    clientId: row.client_id ? id(row.client_id) : null,
    clientSlug: row.client_slug ? String(row.client_slug) : null,
    scope: String(row.scope) as ChatThread["scope"],
    title: String(row.title),
    source: String(row.source),
    lastMessageAt: nullableIso(row.last_message_at),
    createdAt: iso(row.created_at),
    messages: await listChatMessages(id(row.id), { limit: options.limit }),
  };
}

export async function listMemories(
  options: {
    clientId?: string;
    clientSlug?: string;
    includeGlobal?: boolean;
    limit?: number;
  } = {},
): Promise<Array<Memory & Row>> {
  const rows = await dbQuery<Row>(
    `select m.*, c.slug as client_slug from public.memories m left join public.clients c on c.id = m.client_id
     join public.users u on u.id = m.user_id
     where u.slug = 'martu' and m.lifecycle_status = 'active' and (
       ($1::text is null and $2::bigint is null and m.scope = 'global') or c.slug = $1 or m.client_id = $2 or ($3 and m.scope = 'global')
     ) order by m.importance desc, m.updated_at desc limit $4`,
    [
      options.clientSlug ?? null,
      options.clientId ?? null,
      options.includeGlobal ?? true,
      Math.min(options.limit ?? 30, 100),
    ],
  );
  return rows.map(
    (row) =>
      Object.assign(row, {
        id: id(row.id),
        clientId: row.client_id ? id(row.client_id) : null,
        clientSlug: row.client_slug ? String(row.client_slug) : null,
        scope: String(row.scope) as Memory["scope"],
        category: String(row.category),
        fact: String(row.fact),
        importance: number(row.importance),
        source: String(row.source),
        lastUsedAt: nullableIso(row.last_used_at),
        createdAt: iso(row.created_at),
        updatedAt: iso(row.updated_at),
      }) as Memory & Row,
  );
}

export async function getCommunicationProfile(): Promise<
  CommunicationProfile & Row
> {
  const rows = await dbQuery<Row>(
    `select cp.* from public.communication_profiles cp join public.users u on u.id = cp.user_id where u.slug = 'martu'`,
  );
  const row = rows[0];
  if (!row) throw new Error("Communication profile is not initialized");
  return Object.assign(row, {
    id: id(row.id),
    language: String(row.language),
    formality: number(row.formality),
    preferredLength: String(
      row.preferred_length,
    ) as CommunicationProfile["preferredLength"],
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

export async function listPushSubscriptions(
  options: { activeOnly?: boolean } = {},
): Promise<PushSubscriptionRecord[]> {
  const rows = await dbQuery<Row>(
    `select ps.* from public.push_subscriptions ps join public.users u on u.id = ps.user_id
     where u.slug = 'martu' and ($1 = false or ps.status = 'active') order by ps.updated_at desc`,
    [options.activeOnly ?? true],
  );
  return rows.map((row) => ({
    id: id(row.id),
    endpoint: String(row.endpoint),
    p256dh: String(row.p256dh),
    auth: String(row.auth),
    userAgent: row.user_agent ? String(row.user_agent) : null,
    status: String(row.status) as PushSubscriptionRecord["status"],
    lastUsedAt: nullableIso(row.last_used_at),
    failureCount: number(row.failure_count),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }));
}
