import {
  query,
  transaction,
  type DatabaseRow,
  type DbExecutor,
} from "@/server/db";

type Row = DatabaseRow;
type Executor = Pick<DbExecutor, "query">;

const STANDARD_CONTENT_STATES = new Set([
  "idea",
  "script",
  "to_record",
  "recorded",
  "editing",
  "ready",
  "approval",
  "approved",
  "scheduled",
  "published",
  "delivered",
]);

const DEFAULT_WORKFLOW_STATES = [
  ["idea", "Idea", "#94a3b8", null],
  ["script", "Guion", "#8b5cf6", null],
  ["to_record", "Para grabar", "#f59e0b", null],
  ["recorded", "Grabado", "#f97316", null],
  ["editing", "Editando", "#0ea5e9", null],
  ["ready", "Listo", "#14b8a6", null],
  ["approval", "En aprobación", "#eab308", null],
  ["approved", "Aprobado", "#22c55e", null],
  ["scheduled", "Programado", "#3b82f6", null],
  ["published", "Publicado", "#16a34a", "published"],
  ["delivered", "Entregado", "#475569", "delivered"],
] as const;

function camel(key: string) {
  return key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function jsonValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(jsonValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => {
        const serialized = jsonValue(item);
        const isIdentifier = key === "id" || key.endsWith("_id");
        return [
          camel(key),
          isIdentifier && serialized != null ? String(serialized) : serialized,
        ];
      }),
    );
  }
  return value;
}

export function domainDto<T extends Record<string, unknown>>(
  row: T,
): Record<string, unknown> {
  return jsonValue(row) as Record<string, unknown>;
}

function present(value: unknown) {
  return value !== undefined;
}

async function martuUserId(executor: Executor = { query }): Promise<string> {
  const rows = await executor.query<Row>(
    "select id from public.users where slug = 'martu' limit 1",
  );
  if (!rows[0]) throw new Error("La usuaria Martu no está inicializada.");
  return String(rows[0].id);
}

async function ownedClient(executor: Executor, slug: string): Promise<Row> {
  const rows = await executor.query<Row>(
    `select c.* from public.clients c
    join public.users u on u.id = c.user_id
    where u.slug = 'martu' and c.slug = $1 and c.archived_at is null limit 1`,
    [slug],
  );
  if (!rows[0]) throw new Error("No encontré ese cliente.");
  return rows[0];
}

async function ownedClientById(
  executor: Executor,
  clientId: string,
): Promise<Row> {
  const rows = await executor.query<Row>(
    `select c.* from public.clients c
    join public.users u on u.id = c.user_id
    where u.slug = 'martu' and c.id = $1 and c.archived_at is null limit 1`,
    [clientId],
  );
  if (!rows[0]) throw new Error("No encontré ese cliente.");
  return rows[0];
}

export async function clientHasService(
  clientId: string,
  serviceSlug: string,
  executor: Executor = { query },
): Promise<boolean> {
  const rows = await executor.query<Row>(
    `select exists(
      select 1 from public.client_services cs join public.services s on s.id = cs.service_id
      where cs.client_id = $1 and cs.is_active and s.archived_at is null and s.slug = $2
    ) as allowed`,
    [clientId, serviceSlug],
  );
  return Boolean(rows[0]?.allowed);
}

export async function requireClientService(
  clientId: string,
  serviceSlug: string,
  executor: Executor = { query },
): Promise<void> {
  if (!(await clientHasService(clientId, serviceSlug, executor))) {
    const serviceName =
      serviceSlug === "publishing" ? "publicación" : serviceSlug;
    throw new Error(`Ese cliente no contrata ${serviceName}.`);
  }
}

async function appendDomainActivity(
  executor: Executor,
  input: {
    userId: string;
    clientId?: string | null;
    type: string;
    title: string;
    entityType?: string;
    entityId?: string;
    targetPath?: string;
    metadata?: Record<string, unknown>;
  },
) {
  await executor.query(
    `insert into public.activity_events
    (user_id, client_id, actor, type, title, entity_type, entity_id, target_path, metadata)
    values ($1,$2,'Martu',$3,$4,$5,$6,$7,$8::jsonb)`,
    [
      input.userId,
      input.clientId ?? null,
      input.type,
      input.title,
      input.entityType ?? null,
      input.entityId ?? null,
      input.targetPath ?? null,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
}

export async function updateClientV1(
  slug: string,
  input: {
    name?: string;
    description?: string;
    summary?: string;
    status?: string;
    accent?: string;
    logoUrl?: string | null;
    metadata?: Record<string, unknown>;
    serviceSlugs?: string[];
  },
) {
  return transaction(async (tx) => {
    const client = await ownedClient(tx, slug);
    const rows = await tx.query<Row>(
      `update public.clients set
      name = case when $2 then $3 else name end,
      description = case when $4 then $5 else description end,
      summary = case when $6 then $7 else summary end,
      status = case when $8 then $9 else status end,
      accent = case when $10 then $11 else accent end,
      logo_url = case when $12 then $13 else logo_url end,
      metadata = case when $14 then metadata || $15::jsonb else metadata end
      where id = $1 returning *`,
      [
        client.id,
        present(input.name),
        input.name?.trim() ?? null,
        present(input.description),
        input.description?.trim() ?? null,
        present(input.summary),
        input.summary?.trim() ?? null,
        present(input.status),
        input.status ?? null,
        present(input.accent),
        input.accent ?? null,
        present(input.logoUrl),
        input.logoUrl ?? null,
        present(input.metadata),
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    if (input.serviceSlugs) {
      await tx.query(
        "update public.client_services set is_active = false where client_id = $1",
        [client.id],
      );
      for (const serviceSlug of [...new Set(input.serviceSlugs)]) {
        const services = await tx.query<Row>(
          `select s.id from public.services s
          join public.clients c on c.user_id = s.user_id
          where c.id = $1 and s.slug = $2 and s.archived_at is null`,
          [client.id, serviceSlug],
        );
        if (!services[0])
          throw new Error(`No existe el servicio ${serviceSlug}.`);
        await tx.query(
          `insert into public.client_services (client_id, service_id, is_active)
          values ($1,$2,true) on conflict (client_id,service_id) do update set is_active = true`,
          [client.id, services[0].id],
        );
      }
      const canPublish = input.serviceSlugs.includes("publishing");
      await tx.query(
        `update public.content_workflow_states ws set is_visible = case
          when ws.slug = 'delivered' then not $2
          when ws.slug in ('scheduled','published') then $2
          else ws.is_visible
        end
        from public.content_workflows w
        where ws.workflow_id = w.id and w.client_id = $1 and w.is_default
          and ws.slug in ('scheduled','published','delivered')`,
        [client.id, canPublish],
      );
    }
    const serviceRows = await tx.query<Row>(
      `select s.slug from public.client_services cs join public.services s on s.id = cs.service_id
      where cs.client_id = $1 and cs.is_active and s.archived_at is null order by s.sort_order`,
      [client.id],
    );
    return {
      ...domainDto(rows[0]!),
      services: serviceRows.map((row) => String(row.slug)),
    };
  });
}

export async function saveStrategyV1(
  clientSlug: string,
  input: {
    title?: string;
    status?: string;
    objectives?: string[];
    audience?: string;
    tone?: string;
    positioning?: string;
    pillars?: string[];
    hypotheses?: string[];
    decisions?: string[];
    notes?: string;
    changeSummary?: string;
    createVersion?: boolean;
  },
) {
  return transaction(async (tx) => {
    const client = await ownedClient(tx, clientSlug);
    const currentRows = await tx.query<Row>(
      "select * from public.strategies where client_id = $1 order by version desc limit 1",
      [client.id],
    );
    const current = currentRows[0];
    let strategy: Row;
    if (!current || input.createVersion) {
      const version = Number(current?.version ?? 0) + 1;
      const rows = await tx.query<Row>(
        `insert into public.strategies
        (client_id,title,status,version,objectives,audience,tone,positioning,pillars,hypotheses,decisions,notes,change_summary,supersedes_id)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning *`,
        [
          client.id,
          input.title ?? String(current?.title ?? "Estrategia"),
          input.status ?? String(current?.status ?? "draft"),
          version,
          input.objectives ?? current?.objectives ?? [],
          input.audience ?? String(current?.audience ?? ""),
          input.tone ?? String(current?.tone ?? ""),
          input.positioning ?? String(current?.positioning ?? ""),
          input.pillars ?? current?.pillars ?? [],
          input.hypotheses ?? current?.hypotheses ?? [],
          input.decisions ?? current?.decisions ?? [],
          input.notes ?? String(current?.notes ?? ""),
          input.changeSummary ?? "",
          current?.id ?? null,
        ],
      );
      strategy = rows[0]!;
      if (current && input.status === "active") {
        await tx.query(
          "update public.strategies set status = 'archived', valid_to = now() where id = $1",
          [current.id],
        );
      }
    } else {
      const rows = await tx.query<Row>(
        `update public.strategies set
        title = case when $2 then $3 else title end,
        status = case when $4 then $5 else status end,
        objectives = case when $6 then $7 else objectives end,
        audience = case when $8 then $9 else audience end,
        tone = case when $10 then $11 else tone end,
        positioning = case when $12 then $13 else positioning end,
        pillars = case when $14 then $15 else pillars end,
        hypotheses = case when $16 then $17 else hypotheses end,
        decisions = case when $18 then $19 else decisions end,
        notes = case when $20 then $21 else notes end,
        change_summary = case when $22 then $23 else change_summary end
        where id = $1 returning *`,
        [
          current.id,
          present(input.title),
          input.title ?? null,
          present(input.status),
          input.status ?? null,
          present(input.objectives),
          input.objectives ?? null,
          present(input.audience),
          input.audience ?? null,
          present(input.tone),
          input.tone ?? null,
          present(input.positioning),
          input.positioning ?? null,
          present(input.pillars),
          input.pillars ?? null,
          present(input.hypotheses),
          input.hypotheses ?? null,
          present(input.decisions),
          input.decisions ?? null,
          present(input.notes),
          input.notes ?? null,
          present(input.changeSummary),
          input.changeSummary ?? null,
        ],
      );
      strategy = rows[0]!;
    }
    return domainDto(strategy);
  });
}

function ideaSelect() {
  return `select i.*, c.slug as client_slug, c.name as client_name,
    (select s.id from public.scripts s where s.idea_id = i.id and s.status <> 'archived' order by s.updated_at desc limit 1) as script_id,
    (select ci.id from public.content_items ci where ci.idea_id = i.id and ci.archived_at is null order by ci.updated_at desc limit 1) as content_id
    from public.ideas i
    join public.clients c on c.id = i.client_id join public.users u on u.id = c.user_id`;
}

export async function listIdeasV1(
  options: {
    clientSlug?: string;
    status?: string;
    search?: string;
    includeArchived?: boolean;
    limit?: number;
  } = {},
) {
  const rows = await query<Row>(
    `${ideaSelect()} where u.slug = 'martu'
    and ($1::text is null or c.slug = $1) and ($2::text is null or i.status = $2)
    and ($3 or (i.archived_at is null and i.deleted_at is null))
    and ($4::text is null or i.title ilike '%' || $4 || '%' or i.description ilike '%' || $4 || '%')
    order by i.updated_at desc limit $5`,
    [
      options.clientSlug ?? null,
      options.status ?? null,
      options.includeArchived ?? false,
      options.search?.trim() || null,
      Math.min(options.limit ?? 100, 200),
    ],
  );
  return rows.map(domainDto);
}

export async function getIdeaV1(id: string, executor: Executor = { query }) {
  const rows = await executor.query<Row>(
    `${ideaSelect()} where u.slug = 'martu' and i.id = $1 limit 1`,
    [id],
  );
  if (!rows[0]) throw new Error("No encontré la idea.");
  return rows[0];
}

export async function createIdeaV1(input: {
  clientSlug: string;
  title: string;
  description?: string;
  status?: string;
  origin?: string;
  tags?: string[];
  format?: string;
  capturedAt?: string;
  dueAt?: string | null;
  notes?: string;
  sourceInsightId?: string;
}) {
  return transaction(async (tx) => {
    const userId = await martuUserId(tx);
    const client = await ownedClient(tx, input.clientSlug);
    const rows = await tx.query<Row>(
      `insert into public.ideas
      (client_id,title,description,origin,status,tags,format,captured_at,due_at,notes,source_insight_id)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`,
      [
        client.id,
        input.title.trim(),
        input.description?.trim() ?? "",
        input.origin ?? "Martu",
        input.status ?? "new",
        input.tags ?? [],
        input.format ?? "Reel",
        input.capturedAt ?? new Date().toISOString(),
        input.dueAt ?? null,
        input.notes ?? "",
        input.sourceInsightId ?? null,
      ],
    );
    await appendDomainActivity(tx, {
      userId,
      clientId: String(client.id),
      type: "idea.created",
      title: `Idea: ${input.title.trim()}`,
      entityType: "idea",
      entityId: String(rows[0]!.id),
      targetPath: `/clients/${input.clientSlug}/ideas/${rows[0]!.id}`,
    });
    return domainDto({
      ...rows[0]!,
      client_slug: input.clientSlug,
      client_name: client.name,
    });
  });
}

export async function updateIdeaV1(
  id: string,
  input: {
    title?: string;
    description?: string;
    status?: string;
    origin?: string;
    tags?: string[];
    format?: string;
    capturedAt?: string;
    dueAt?: string | null;
    notes?: string;
    archived?: boolean;
  },
) {
  return transaction(async (tx) => {
    await getIdeaV1(id, tx);
    const rows = await tx.query<Row>(
      `update public.ideas set
      title = case when $2 then $3 else title end,
      description = case when $4 then $5 else description end,
      status = case when $6 then $7 else status end,
      origin = case when $8 then $9 else origin end,
      tags = case when $10 then $11 else tags end,
      format = case when $12 then $13 else format end,
      captured_at = case when $14 then $15 else captured_at end,
      due_at = case when $16 then $17 else due_at end,
      notes = case when $18 then $19 else notes end,
      archived_at = case when $20 then case when $21 then now() else null end else archived_at end
      where id = $1 returning *`,
      [
        id,
        present(input.title),
        input.title?.trim() ?? null,
        present(input.description),
        input.description ?? null,
        present(input.status),
        input.status ?? null,
        present(input.origin),
        input.origin ?? null,
        present(input.tags),
        input.tags ?? null,
        present(input.format),
        input.format ?? null,
        present(input.capturedAt),
        input.capturedAt ?? null,
        present(input.dueAt),
        input.dueAt ?? null,
        present(input.notes),
        input.notes ?? null,
        present(input.archived),
        input.archived ?? false,
      ],
    );
    return domainDto(rows[0]!);
  });
}

export async function archiveIdeaV1(id: string) {
  await getIdeaV1(id);
  const rows = await query<Row>(
    "update public.ideas set archived_at = now(), deleted_at = now(), status = 'discarded' where id = $1 returning *",
    [id],
  );
  return domainDto(rows[0]!);
}

export async function duplicateIdeaV1(id: string) {
  const idea = await getIdeaV1(id);
  const client = await ownedClientById({ query }, String(idea.client_id));
  return createIdeaV1({
    clientSlug: String(client.slug),
    title: `${String(idea.title)} (copia)`,
    description: String(idea.description),
    origin: "duplicate",
    tags: Array.isArray(idea.tags) ? idea.tags.map(String) : [],
    format: String(idea.format),
    notes: String(idea.notes),
  });
}

async function allocateScriptNumber(
  tx: Executor,
  clientId: string,
): Promise<number> {
  // Seed data (and old imports) may already contain scripts while the counter is
  // absent or behind. Lock the per-client row, reconcile it with the real max,
  // then reserve the next number atomically inside the caller transaction.
  await tx.query(
    `insert into public.script_counters (client_id,next_number)
    values ($1,1) on conflict (client_id) do nothing`,
    [clientId],
  );
  const counters = await tx.query<Row>(
    `select next_number from public.script_counters
    where client_id = $1 for update`,
    [clientId],
  );
  const maxima = await tx.query<Row>(
    `select coalesce(max(script_number),0) as maximum
    from public.scripts where client_id = $1`,
    [clientId],
  );
  const allocated = Math.max(
    Number(counters[0]?.next_number ?? 1),
    Number(maxima[0]?.maximum ?? 0) + 1,
  );
  await tx.query(
    `update public.script_counters set next_number = $2
    where client_id = $1`,
    [clientId, allocated + 1],
  );
  return allocated;
}

async function scriptSnapshot(tx: Executor, script: Row, actor = "Martu") {
  await tx.query(
    `insert into public.script_versions
    (script_id,version,title,objective,hook,body,cta,notes,actor)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    on conflict (script_id,version) do nothing`,
    [
      script.id,
      script.version,
      script.title,
      script.objective,
      script.hook,
      script.body,
      script.cta,
      script.notes,
      actor,
    ],
  );
}

function scriptSelect() {
  return `select s.*, c.slug as client_slug, c.name as client_name,
    (select ci.id from public.content_items ci where ci.script_id = s.id and ci.archived_at is null order by ci.updated_at desc limit 1) as content_id
    from public.scripts s join public.clients c on c.id = s.client_id join public.users u on u.id = c.user_id`;
}

export async function listScriptsV1(
  options: {
    clientSlug?: string;
    status?: string;
    search?: string;
    limit?: number;
  } = {},
) {
  const rows = await query<Row>(
    `${scriptSelect()} where u.slug = 'martu'
    and ($1::text is null or c.slug = $1) and ($2::text is null or s.status = $2)
    and ($3::text is null or s.title ilike '%' || $3 || '%' or s.body ilike '%' || $3 || '%')
    order by s.updated_at desc limit $4`,
    [
      options.clientSlug ?? null,
      options.status ?? null,
      options.search?.trim() || null,
      Math.min(options.limit ?? 100, 200),
    ],
  );
  return rows.map(domainDto);
}

export async function getScriptV1(id: string, executor: Executor = { query }) {
  const rows = await executor.query<Row>(
    `${scriptSelect()} where u.slug = 'martu' and s.id = $1 limit 1`,
    [id],
  );
  if (!rows[0]) throw new Error("No encontré el guion.");
  return rows[0];
}

export async function createScriptV1(input: {
  clientSlug: string;
  ideaId?: string;
  title: string;
  format?: string;
  objective?: string;
  hook?: string;
  body?: string;
  cta?: string;
  status?: string;
  notes?: string;
  dueAt?: string | null;
}) {
  return transaction(async (tx) => {
    const userId = await martuUserId(tx);
    const client = await ownedClient(tx, input.clientSlug);
    if (input.ideaId) {
      const idea = await getIdeaV1(input.ideaId, tx);
      if (String(idea.client_id) !== String(client.id))
        throw new Error("La idea pertenece a otro cliente.");
    }
    const number = await allocateScriptNumber(tx, String(client.id));
    const rows = await tx.query<Row>(
      `insert into public.scripts
      (client_id,idea_id,script_number,title,format,objective,hook,body,cta,status,notes,due_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *`,
      [
        client.id,
        input.ideaId ?? null,
        number,
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
    await scriptSnapshot(tx, rows[0]!);
    await appendDomainActivity(tx, {
      userId,
      clientId: String(client.id),
      type: "script.created",
      title: `Guion: ${input.title.trim()}`,
      entityType: "script",
      entityId: String(rows[0]!.id),
      targetPath: `/clients/${input.clientSlug}/guiones/${rows[0]!.id}`,
    });
    return domainDto({
      ...rows[0]!,
      client_slug: input.clientSlug,
      client_name: client.name,
    });
  });
}

export async function updateScriptV1(
  id: string,
  input: {
    title?: string;
    format?: string;
    objective?: string;
    hook?: string;
    body?: string;
    cta?: string;
    status?: string;
    notes?: string;
    dueAt?: string | null;
  },
) {
  return transaction(async (tx) => {
    await getScriptV1(id, tx);
    const rows = await tx.query<Row>(
      `update public.scripts set
      title = case when $2 then $3 else title end,
      format = case when $4 then $5 else format end,
      objective = case when $6 then $7 else objective end,
      hook = case when $8 then $9 else hook end,
      body = case when $10 then $11 else body end,
      cta = case when $12 then $13 else cta end,
      status = case when $14 then $15 else status end,
      notes = case when $16 then $17 else notes end,
      due_at = case when $18 then $19 else due_at end,
      approved_at = case when $14 and $15 = 'approved' then now() when $14 then null else approved_at end,
      version = version + 1
      where id = $1 returning *`,
      [
        id,
        present(input.title),
        input.title?.trim() ?? null,
        present(input.format),
        input.format ?? null,
        present(input.objective),
        input.objective ?? null,
        present(input.hook),
        input.hook ?? null,
        present(input.body),
        input.body ?? null,
        present(input.cta),
        input.cta ?? null,
        present(input.status),
        input.status ?? null,
        present(input.notes),
        input.notes ?? null,
        present(input.dueAt),
        input.dueAt ?? null,
      ],
    );
    await scriptSnapshot(tx, rows[0]!);
    return domainDto(rows[0]!);
  });
}

export async function archiveScriptV1(id: string) {
  await getScriptV1(id);
  const rows = await query<Row>(
    "update public.scripts set status = 'archived' where id = $1 returning *",
    [id],
  );
  return domainDto(rows[0]!);
}

export async function duplicateScriptV1(id: string) {
  const script = await getScriptV1(id);
  return createScriptV1({
    clientSlug: String(script.client_slug),
    ideaId: script.idea_id ? String(script.idea_id) : undefined,
    title: `${String(script.title)} (copia)`,
    format: String(script.format),
    objective: String(script.objective),
    hook: String(script.hook),
    body: String(script.body),
    cta: String(script.cta),
    notes: String(script.notes),
    status: "draft",
  });
}

async function workflowState(tx: Executor, clientId: string, slug: string) {
  const rows = await tx.query<Row>(
    `select ws.*, w.id as workflow_id from public.content_workflow_states ws
    join public.content_workflows w on w.id = ws.workflow_id
    where w.client_id = $1 and w.is_default and (ws.slug = $2 or lower(ws.label) = lower($2)) limit 1`,
    [clientId, slug],
  );
  if (!rows[0])
    throw new Error(`El estado ${slug} no existe en el workflow del cliente.`);
  const state = rows[0];
  if (
    ["scheduled", "published"].includes(String(state.slug)) ||
    state.terminal_kind === "published"
  ) {
    await requireClientService(clientId, "publishing", tx);
  }
  return state;
}

async function ensureDefaultWorkflow(tx: Executor, clientId: string) {
  let workflows = await tx.query<Row>(
    "select id from public.content_workflows where client_id = $1 and is_default limit 1",
    [clientId],
  );
  if (!workflows[0]) {
    workflows = await tx.query<Row>(
      `insert into public.content_workflows
      (client_id,name,slug,is_default) values ($1,'Flujo principal','principal',true)
      returning id`,
      [clientId],
    );
  }
  const workflowId = String(workflows[0]!.id);
  const canPublish = await clientHasService(clientId, "publishing", tx);
  for (const [
    position,
    [slug, label, color, terminalKind],
  ] of DEFAULT_WORKFLOW_STATES.entries()) {
    const visible = canPublish
      ? slug !== "delivered"
      : slug !== "scheduled" && slug !== "published";
    await tx.query(
      `insert into public.content_workflow_states
      (workflow_id,slug,label,color,position,is_visible,terminal_kind)
      values ($1,$2,$3,$4,$5,$6,$7)
      on conflict (workflow_id,slug) do nothing`,
      [
        workflowId,
        slug,
        label,
        color,
        (position + 1) * 10,
        visible,
        terminalKind,
      ],
    );
  }
  return workflowId;
}

async function initialWorkflowState(tx: Executor, clientId: string) {
  let rows = await tx.query<Row>(
    `select ws.*, w.id as workflow_id
    from public.content_workflow_states ws
    join public.content_workflows w on w.id = ws.workflow_id
    where w.client_id = $1 and w.is_default and ws.is_visible
    order by ws.position, ws.id limit 1`,
    [clientId],
  );
  if (!rows[0]) {
    await ensureDefaultWorkflow(tx, clientId);
    rows = await tx.query<Row>(
      `select ws.*, w.id as workflow_id
      from public.content_workflow_states ws
      join public.content_workflows w on w.id = ws.workflow_id
      where w.client_id = $1 and w.is_default and ws.is_visible
      order by ws.position, ws.id limit 1`,
      [clientId],
    );
  }
  if (!rows[0])
    throw new Error(
      "El cliente necesita al menos un estado visible en su flujo.",
    );
  const state = rows[0];
  if (
    ["scheduled", "published"].includes(String(state.slug)) ||
    state.terminal_kind === "published"
  ) {
    await requireClientService(clientId, "publishing", tx);
  }
  return state;
}

function contentSelect() {
  return `select ci.*, c.slug as client_slug, c.name as client_name,
    ws.slug as workflow_state, ws.label as workflow_state_label, ws.color as workflow_state_color,
    p.id as publication_id, p.external_url as publication_url
    from public.content_items ci join public.clients c on c.id = ci.client_id
    join public.users u on u.id = c.user_id
    left join public.content_workflow_states ws on ws.id = ci.workflow_state_id
    left join public.publications p on p.id = (select p2.id from public.publications p2 where p2.content_item_id = ci.id order by p2.published_at desc nulls last, p2.created_at desc limit 1)`;
}

export async function listContentV1(
  options: {
    clientSlug?: string;
    status?: string;
    search?: string;
    includeArchived?: boolean;
    limit?: number;
  } = {},
) {
  const rows = await query<Row>(
    `${contentSelect()} where u.slug = 'martu'
    and ($1::text is null or c.slug = $1)
    and ($2::text is null or coalesce(ws.slug,ci.status) = $2)
    and ($3 or ci.archived_at is null)
    and ($4::text is null or ci.title ilike '%' || $4 || '%' or ci.caption ilike '%' || $4 || '%')
    order by ci.pipeline_position, ci.updated_at desc limit $5`,
    [
      options.clientSlug ?? null,
      options.status ?? null,
      options.includeArchived ?? false,
      options.search?.trim() || null,
      Math.min(options.limit ?? 100, 200),
    ],
  );
  return rows.map(domainDto);
}

export async function getContentV1(id: string, executor: Executor = { query }) {
  const rows = await executor.query<Row>(
    `${contentSelect()} where u.slug = 'martu' and ci.id = $1 limit 1`,
    [id],
  );
  if (!rows[0]) throw new Error("No encontré el contenido.");
  return rows[0];
}

export async function createContentV1(input: {
  clientSlug: string;
  ideaId?: string;
  scriptId?: string;
  title: string;
  format?: string;
  channel?: string;
  status?: string;
  caption?: string;
  cta?: string;
  notes?: string;
  assignee?: string;
  dueAt?: string | null;
  scheduledAt?: string | null;
  pipelinePosition?: number;
}) {
  return transaction(async (tx) => {
    const userId = await martuUserId(tx);
    const client = await ownedClient(tx, input.clientSlug);
    if (input.ideaId) {
      const idea = await getIdeaV1(input.ideaId, tx);
      if (String(idea.client_id) !== String(client.id))
        throw new Error("La idea pertenece a otro cliente.");
    }
    if (input.scriptId) {
      const script = await getScriptV1(input.scriptId, tx);
      if (String(script.client_id) !== String(client.id))
        throw new Error("El guion pertenece a otro cliente.");
    }
    const state = input.status
      ? await workflowState(tx, String(client.id), input.status)
      : await initialWorkflowState(tx, String(client.id));
    const stateSlug = String(state.slug);
    const legacyStatus = STANDARD_CONTENT_STATES.has(stateSlug)
      ? stateSlug
      : "idea";
    const rows = await tx.query<Row>(
      `insert into public.content_items
      (client_id,idea_id,script_id,title,format,channel,status,pipeline_position,caption,cta,notes,assignee,due_at,scheduled_at,workflow_id,workflow_state_id)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) returning *`,
      [
        client.id,
        input.ideaId ?? null,
        input.scriptId ?? null,
        input.title.trim(),
        input.format ?? "Reel",
        input.channel ?? "Instagram",
        legacyStatus,
        input.pipelinePosition ?? 0,
        input.caption ?? "",
        input.cta ?? "",
        input.notes ?? "",
        input.assignee ?? "Martu",
        input.dueAt ?? null,
        input.scheduledAt ?? null,
        state.workflow_id,
        state.id,
      ],
    );
    await appendDomainActivity(tx, {
      userId,
      clientId: String(client.id),
      type: "content.created",
      title: `Contenido: ${input.title.trim()}`,
      entityType: "content",
      entityId: String(rows[0]!.id),
      targetPath: `/clients/${input.clientSlug}/contenido/${rows[0]!.id}`,
    });
    return domainDto({
      ...rows[0]!,
      client_slug: input.clientSlug,
      workflow_state: state.slug,
      workflow_state_label: state.label,
    });
  });
}

export async function updateContentV1(
  id: string,
  input: {
    title?: string;
    format?: string;
    channel?: string;
    status?: string;
    caption?: string;
    cta?: string;
    notes?: string;
    assignee?: string;
    dueAt?: string | null;
    scheduledAt?: string | null;
    pipelinePosition?: number;
    archived?: boolean;
  },
) {
  return transaction(async (tx) => {
    const existing = await getContentV1(id, tx);
    let state: Row | undefined;
    if (input.status)
      state = await workflowState(tx, String(existing.client_id), input.status);
    const stateSlug = state ? String(state.slug) : input.status;
    const legacy =
      stateSlug && STANDARD_CONTENT_STATES.has(stateSlug)
        ? stateSlug
        : undefined;
    const rows = await tx.query<Row>(
      `update public.content_items set
      title = case when $2 then $3 else title end,
      format = case when $4 then $5 else format end,
      channel = case when $6 then $7 else channel end,
      status = case when $8 then $9 else status end,
      workflow_id = case when $10 then $11 else workflow_id end,
      workflow_state_id = case when $10 then $12 else workflow_state_id end,
      status_changed_at = case when $10 then now() else status_changed_at end,
      caption = case when $13 then $14 else caption end,
      cta = case when $15 then $16 else cta end,
      notes = case when $17 then $18 else notes end,
      assignee = case when $19 then $20 else assignee end,
      due_at = case when $21 then $22 else due_at end,
      scheduled_at = case when $23 then $24 else scheduled_at end,
      pipeline_position = case when $25 then $26 else pipeline_position end,
      archived_at = case when $27 then case when $28 then now() else null end else archived_at end,
      published_at = case when $10 and ($29 = 'published' or $30 = 'published') then coalesce(published_at,now()) else published_at end,
      delivered_at = case when $10 and ($29 = 'delivered' or $30 = 'delivered') then coalesce(delivered_at,now()) else delivered_at end
      where id = $1 returning *`,
      [
        id,
        present(input.title),
        input.title?.trim() ?? null,
        present(input.format),
        input.format ?? null,
        present(input.channel),
        input.channel ?? null,
        Boolean(legacy),
        legacy ?? null,
        Boolean(state),
        state?.workflow_id ?? null,
        state?.id ?? null,
        present(input.caption),
        input.caption ?? null,
        present(input.cta),
        input.cta ?? null,
        present(input.notes),
        input.notes ?? null,
        present(input.assignee),
        input.assignee ?? null,
        present(input.dueAt),
        input.dueAt ?? null,
        present(input.scheduledAt),
        input.scheduledAt ?? null,
        present(input.pipelinePosition),
        input.pipelinePosition ?? null,
        present(input.archived),
        input.archived ?? false,
        stateSlug ?? null,
        state?.terminal_kind ?? null,
      ],
    );
    if (
      state?.terminal_kind ||
      ["published", "delivered"].includes(input.status ?? "")
    ) {
      await tx.query(
        `update public.ai_nudges set lifecycle_state = 'resolved', resolved_at = now(), resolution_reason = 'content_terminal',
        status = case when status in ('pending','delivered','seen') then 'acted' else status end
        where user_id = $1 and lifecycle_state in ('active','snoozed')
          and metadata ->> 'entityType' = 'content' and metadata ->> 'entityId' = $2`,
        [await martuUserId(tx), id],
      );
    } else if (input.status) {
      await tx.query(
        `update public.ai_nudges set lifecycle_state = 'active', resolved_at = null,
        resolution_reason = null, status = 'pending', snoozed_until = null
        where user_id = $1 and lifecycle_state = 'resolved' and resolution_reason = 'content_terminal'
          and metadata ->> 'entityType' = 'content' and metadata ->> 'entityId' = $2`,
        [await martuUserId(tx), id],
      );
    }
    if (
      state &&
      String(existing.workflow_state_id ?? "") !== String(state.id)
    ) {
      await appendDomainActivity(tx, {
        userId: await martuUserId(tx),
        clientId: String(existing.client_id),
        type: "content.status_changed",
        title: `${String(rows[0]!.title)} pasó a ${String(state.label)}`,
        entityType: "content",
        entityId: id,
        targetPath: `/clients/${String(existing.client_slug)}/contenido/${id}`,
        metadata: { status: String(state.slug), label: String(state.label) },
      });
    }
    return domainDto({
      ...rows[0]!,
      workflow_state: state?.slug ?? existing.workflow_state,
      workflow_state_label: state?.label ?? existing.workflow_state_label,
    });
  });
}

export async function archiveContentV1(id: string) {
  await getContentV1(id);
  const rows = await query<Row>(
    "update public.content_items set archived_at = now() where id = $1 returning *",
    [id],
  );
  return domainDto(rows[0]!);
}

export async function reorderContentV1(
  clientSlug: string,
  orderedIds: string[],
) {
  if (!orderedIds.length) throw new Error("El orden no puede quedar vacío.");
  if (new Set(orderedIds).size !== orderedIds.length)
    throw new Error("El orden contiene piezas repetidas.");
  return transaction(async (tx) => {
    const client = await ownedClient(tx, clientSlug);
    const rows = await tx.query<Row>(
      `select id from public.content_items
      where client_id = $1 and archived_at is null order by pipeline_position, updated_at desc`,
      [client.id],
    );
    const currentIds = rows.map((row) => String(row.id));
    if (
      currentIds.length !== orderedIds.length ||
      currentIds.some((id) => !orderedIds.includes(id))
    ) {
      throw new Error(
        "La lista cambió mientras la ordenabas. Actualizá y probá de nuevo.",
      );
    }
    for (const [position, id] of orderedIds.entries()) {
      await tx.query(
        `update public.content_items set pipeline_position = $3
        where id = $1 and client_id = $2`,
        [id, client.id, position],
      );
    }
    await appendDomainActivity(tx, {
      userId: await martuUserId(tx),
      clientId: String(client.id),
      type: "content.reordered",
      title: "Martu reordenó el contenido",
      targetPath: `/clients/${clientSlug}/contenido`,
    });
    return { orderedIds };
  });
}

export async function duplicateContentV1(id: string) {
  const content = await getContentV1(id);
  return createContentV1({
    clientSlug: String(content.client_slug),
    ideaId: content.idea_id ? String(content.idea_id) : undefined,
    scriptId: content.script_id ? String(content.script_id) : undefined,
    title: `${String(content.title)} (copia)`,
    format: String(content.format),
    channel: String(content.channel),
    caption: String(content.caption),
    cta: String(content.cta),
    notes: String(content.notes),
    assignee: String(content.assignee),
    status: "idea",
  });
}

export async function saveWorkflowStatesV1(
  clientSlug: string,
  input: {
    states: Array<{
      slug?: string;
      label: string;
      color?: string;
      terminalKind?: "delivered" | "published" | "cancelled" | null;
    }>;
  },
) {
  if (!input.states.length)
    throw new Error("El flujo necesita al menos un estado.");
  return transaction(async (tx) => {
    const client = await ownedClient(tx, clientSlug);
    let workflows = await tx.query<Row>(
      "select * from public.content_workflows where client_id = $1 and is_default limit 1",
      [client.id],
    );
    if (!workflows[0]) {
      workflows = await tx.query<Row>(
        `insert into public.content_workflows (client_id,name,slug,is_default)
        values ($1,'Flujo principal','principal',true) returning *`,
        [client.id],
      );
    }
    const workflowId = String(workflows[0]!.id);
    await tx.query(
      "update public.content_workflow_states set is_visible = false where workflow_id = $1",
      [workflowId],
    );
    const used = new Set<string>();
    for (const [position, item] of input.states.entries()) {
      const base = (item.slug || item.label)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("es")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "");
      if (!base) throw new Error("Cada estado necesita un nombre válido.");
      let stateSlug = base;
      let suffix = 2;
      while (used.has(stateSlug)) stateSlug = `${base}_${suffix++}`;
      used.add(stateSlug);
      if (
        ["scheduled", "published"].includes(stateSlug) ||
        item.terminalKind === "published"
      ) {
        await requireClientService(String(client.id), "publishing", tx);
      }
      await tx.query(
        `insert into public.content_workflow_states
        (workflow_id,slug,label,color,position,is_visible,terminal_kind)
        values ($1,$2,$3,$4,$5,true,$6)
        on conflict (workflow_id,slug) do update set label = excluded.label, color = excluded.color,
          position = excluded.position, is_visible = true, terminal_kind = excluded.terminal_kind`,
        [
          workflowId,
          stateSlug,
          item.label.trim(),
          item.color ?? "#64748b",
          position,
          item.terminalKind ?? null,
        ],
      );
    }
    const rows = await tx.query<Row>(
      `select id,slug,label,color,position,terminal_kind from public.content_workflow_states
      where workflow_id = $1 and is_visible order by position`,
      [workflowId],
    );
    return rows.map(domainDto);
  });
}

export async function convertIdeaV1(id: string, target: "script" | "content") {
  const idea = await getIdeaV1(id);
  if (target === "script") {
    const script = await createScriptV1({
      clientSlug: String(idea.client_slug),
      ideaId: id,
      title: String(idea.title),
      format: String(idea.format),
      objective: String(idea.description),
      notes: String(idea.notes),
    });
    await updateIdeaV1(id, { status: "developing" });
    return { target, item: script };
  }
  const content = await createContentV1({
    clientSlug: String(idea.client_slug),
    ideaId: id,
    title: String(idea.title),
    format: String(idea.format),
    notes: String(idea.notes),
  });
  await updateIdeaV1(id, { status: "developing" });
  return { target, item: content };
}

function workSelect() {
  return `select t.*, c.slug as client_slug, c.name as client_name, c.accent as client_accent
    from public.tasks t left join public.clients c on c.id = t.client_id
    join public.users u on u.id = t.user_id`;
}

export async function listWorkV1(
  options: {
    clientSlug?: string;
    status?: string;
    bucket?: string;
    kind?: string;
    search?: string;
    includeArchived?: boolean;
    limit?: number;
  } = {},
) {
  const rows = await query<Row>(
    `${workSelect()} where u.slug = 'martu'
    and ($1::text is null or c.slug = $1) and ($2::text is null or t.status = $2)
    and ($3::text is null or t.bucket = $3) and ($4::text is null or t.work_kind = $4)
    and ($5 or t.archived_at is null)
    and ($6::text is null or t.title ilike '%' || $6 || '%' or t.description ilike '%' || $6 || '%')
    order by case t.status when 'blocked' then 0 when 'in_progress' then 1 else 2 end,
      t.due_at asc nulls last, t.sort_order, t.updated_at desc limit $7`,
    [
      options.clientSlug ?? null,
      options.status ?? null,
      options.bucket ?? null,
      options.kind ?? null,
      options.includeArchived ?? false,
      options.search?.trim() || null,
      Math.min(options.limit ?? 150, 300),
    ],
  );
  return rows.map(domainDto);
}

export async function getWorkV1(id: string, executor: Executor = { query }) {
  const rows = await executor.query<Row>(
    `${workSelect()} where u.slug = 'martu' and t.id = $1 limit 1`,
    [id],
  );
  if (!rows[0]) throw new Error("No encontré el trabajo.");
  return rows[0];
}

export async function createWorkV1(input: {
  clientSlug?: string;
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  dueAt?: string | null;
  startsAt?: string | null;
  bucket?: string;
  workKind?: string;
  waitingUntil?: string | null;
  sortOrder?: number;
  entityType?: string;
  entityId?: string;
  source?: string;
}) {
  return transaction(async (tx) => {
    const userId = await martuUserId(tx);
    const client = input.clientSlug
      ? await ownedClient(tx, input.clientSlug)
      : undefined;
    const rows = await tx.query<Row>(
      `insert into public.tasks
      (user_id,client_id,title,description,status,priority,due_at,starts_at,bucket,work_kind,waiting_until,sort_order,entity_type,entity_id,source)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning *`,
      [
        userId,
        client?.id ?? null,
        input.title.trim(),
        input.description ?? "",
        input.status ?? "pending",
        input.priority ?? "medium",
        input.dueAt ?? null,
        input.startsAt ?? null,
        input.bucket ?? (input.dueAt ? "next" : "inbox"),
        input.workKind ?? "task",
        input.waitingUntil ?? null,
        input.sortOrder ?? 0,
        input.entityType ?? null,
        input.entityId ?? null,
        input.source ?? "manual",
      ],
    );
    await appendDomainActivity(tx, {
      userId,
      clientId: client ? String(client.id) : null,
      type: "work.created",
      title: input.title.trim(),
      entityType: "task",
      entityId: String(rows[0]!.id),
      targetPath: `/work?item=${rows[0]!.id}`,
    });
    return domainDto({
      ...rows[0]!,
      client_slug: client?.slug ?? null,
      client_name: client?.name ?? null,
    });
  });
}

export async function updateWorkV1(
  id: string,
  input: {
    clientSlug?: string | null;
    title?: string;
    description?: string;
    status?: string;
    priority?: string;
    dueAt?: string | null;
    startsAt?: string | null;
    bucket?: string;
    workKind?: string;
    waitingUntil?: string | null;
    sortOrder?: number;
    entityType?: string | null;
    entityId?: string | null;
    archived?: boolean;
  },
) {
  return transaction(async (tx) => {
    await getWorkV1(id, tx);
    const client =
      present(input.clientSlug) && input.clientSlug
        ? await ownedClient(tx, input.clientSlug)
        : undefined;
    await tx.query<Row>(
      `update public.tasks set
      client_id = case when $2 then $3 else client_id end,
      title = case when $4 then $5 else title end,
      description = case when $6 then $7 else description end,
      status = case when $8 then $9 else status end,
      priority = case when $10 then $11 else priority end,
      due_at = case when $12 then $13 else due_at end,
      starts_at = case when $14 then $15 else starts_at end,
      bucket = case when $16 then $17 else bucket end,
      work_kind = case when $18 then $19 else work_kind end,
      waiting_until = case when $20 then $21 else waiting_until end,
      sort_order = case when $22 then $23 else sort_order end,
      entity_type = case when $24 then $25 else entity_type end,
      entity_id = case when $26 then $27 else entity_id end,
      archived_at = case when $28 then case when $29 then now() else null end else archived_at end,
      completed_at = case when $8 and $9 = 'completed' then now() when $8 then null else completed_at end
      where id = $1 returning *`,
      [
        id,
        present(input.clientSlug),
        client?.id ?? null,
        present(input.title),
        input.title?.trim() ?? null,
        present(input.description),
        input.description ?? null,
        present(input.status),
        input.status ?? null,
        present(input.priority),
        input.priority ?? null,
        present(input.dueAt),
        input.dueAt ?? null,
        present(input.startsAt),
        input.startsAt ?? null,
        present(input.bucket),
        input.bucket ?? null,
        present(input.workKind),
        input.workKind ?? null,
        present(input.waitingUntil),
        input.waitingUntil ?? null,
        present(input.sortOrder),
        input.sortOrder ?? null,
        present(input.entityType),
        input.entityType ?? null,
        present(input.entityId),
        input.entityId ?? null,
        present(input.archived),
        input.archived ?? false,
      ],
    );
    if (["completed", "cancelled"].includes(input.status ?? "")) {
      const userId = await martuUserId(tx);
      await tx.query(
        "update public.reminders set status = 'done' where user_id = $1 and task_id = $2 and status <> 'cancelled'",
        [userId, id],
      );
      await tx.query(
        `update public.ai_nudges set lifecycle_state = 'resolved', resolved_at = now(), resolution_reason = 'work_closed',
        status = case when status in ('pending','delivered','seen') then 'acted' else status end
        where user_id = $1 and task_id = $2 and lifecycle_state in ('active','snoozed')`,
        [userId, id],
      );
    } else if (input.status) {
      const userId = await martuUserId(tx);
      await tx.query(
        `update public.reminders set status = 'pending'
        where user_id = $1 and task_id = $2 and status = 'done'`,
        [userId, id],
      );
      await tx.query(
        `update public.ai_nudges set lifecycle_state = 'active', resolved_at = null,
        resolution_reason = null, status = 'pending', snoozed_until = null
        where user_id = $1 and task_id = $2 and lifecycle_state = 'resolved'
          and resolution_reason = 'work_closed'`,
        [userId, id],
      );
    }
    return domainDto(await getWorkV1(id, tx));
  });
}

function calendarDto(row: Row) {
  return domainDto(row);
}

export async function listCalendarEventsV1(
  options: {
    from?: string;
    to?: string;
    clientSlug?: string;
    kind?: string;
  } = {},
) {
  const from =
    options.from ?? new Date(Date.now() - 30 * 86_400_000).toISOString();
  const to = options.to ?? new Date(Date.now() + 90 * 86_400_000).toISOString();
  const params = [from, to, options.clientSlug ?? null, options.kind ?? null];
  const [manual, tasks, meetings, content] = await Promise.all([
    query<Row>(
      `select ce.id::text as id, ce.title, ce.description, ce.starts_at, ce.ends_at, ce.all_day,
      ce.kind, ce.status, ce.source, ce.entity_type, ce.entity_id, ce.target_path,
      c.id as client_id, c.slug as client_slug, c.name as client_name
      from public.calendar_events ce join public.users u on u.id = ce.user_id
      left join public.clients c on c.id = ce.client_id
      where u.slug = 'martu' and ce.archived_at is null and ce.starts_at < $2
        and coalesce(ce.ends_at,ce.starts_at) >= $1 and ($3::text is null or c.slug = $3)
        and ($4::text is null or ce.kind = $4) order by ce.starts_at`,
      params,
    ),
    query<Row>(
      `select 'task-' || t.id::text as id, t.title, t.description,
      coalesce(t.starts_at,t.due_at) as starts_at, t.due_at as ends_at, false as all_day,
      'task' as kind, t.status, 'task' as source, 'task' as entity_type, t.id as entity_id,
       '/work?item=' || t.id::text as target_path,
      c.id as client_id, c.slug as client_slug, c.name as client_name
      from public.tasks t join public.users u on u.id = t.user_id left join public.clients c on c.id = t.client_id
      where u.slug = 'martu' and t.archived_at is null and coalesce(t.starts_at,t.due_at) >= $1
        and coalesce(t.starts_at,t.due_at) < $2 and ($3::text is null or c.slug = $3)
        and ($4::text is null or $4 = 'task')`,
      params,
    ),
    query<Row>(
      `select 'meeting-' || m.id::text as id, m.title, m.summary as description, m.starts_at,
      m.starts_at + m.duration_minutes * interval '1 minute' as ends_at, false as all_day,
      'meeting' as kind, 'scheduled' as status, 'meeting' as source, 'meeting' as entity_type, m.id as entity_id,
       '/clients/' || c.slug || '/notas/' || m.id::text as target_path,
      c.id as client_id, c.slug as client_slug, c.name as client_name
      from public.meetings m join public.clients c on c.id = m.client_id join public.users u on u.id = c.user_id
      where u.slug = 'martu' and m.starts_at >= $1 and m.starts_at < $2
        and ($3::text is null or c.slug = $3) and ($4::text is null or $4 = 'meeting')`,
      params,
    ),
    query<Row>(
      `select 'content-' || ci.id::text as id, ci.title, ci.caption as description,
      coalesce(ci.scheduled_at,ci.due_at,ci.published_at) as starts_at, null::timestamptz as ends_at, false as all_day,
      'content' as kind, coalesce(ws.slug,ci.status) as status, 'content' as source, 'content' as entity_type, ci.id as entity_id,
       '/clients/' || c.slug || '/contenido/' || ci.id::text as target_path,
      c.id as client_id, c.slug as client_slug, c.name as client_name
      from public.content_items ci join public.clients c on c.id = ci.client_id join public.users u on u.id = c.user_id
      left join public.content_workflow_states ws on ws.id = ci.workflow_state_id
      where u.slug = 'martu' and ci.archived_at is null and coalesce(ci.scheduled_at,ci.due_at,ci.published_at) >= $1
        and coalesce(ci.scheduled_at,ci.due_at,ci.published_at) < $2
        and ($3::text is null or c.slug = $3) and ($4::text is null or $4 = 'content')`,
      params,
    ),
  ]);
  return [...manual, ...tasks, ...meetings, ...content]
    .sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)))
    .map(calendarDto);
}

export async function createCalendarEventV1(input: {
  clientSlug?: string;
  title: string;
  description?: string;
  startsAt: string;
  endsAt?: string | null;
  allDay?: boolean;
  kind?: string;
  status?: string;
  entityType?: string;
  entityId?: string;
  targetPath?: string;
}) {
  return transaction(async (tx) => {
    const userId = await martuUserId(tx);
    const client = input.clientSlug
      ? await ownedClient(tx, input.clientSlug)
      : undefined;
    const rows = await tx.query<Row>(
      `insert into public.calendar_events
      (user_id,client_id,title,description,starts_at,ends_at,all_day,kind,status,entity_type,entity_id,target_path)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *`,
      [
        userId,
        client?.id ?? null,
        input.title.trim(),
        input.description ?? "",
        input.startsAt,
        input.endsAt ?? null,
        input.allDay ?? false,
        input.kind ?? "event",
        input.status ?? "scheduled",
        input.entityType ?? null,
        input.entityId ?? null,
        input.targetPath ?? null,
      ],
    );
    return calendarDto({
      ...rows[0]!,
      client_slug: client?.slug ?? null,
      client_name: client?.name ?? null,
    });
  });
}

export async function getManualCalendarEventV1(
  id: string,
  executor: Executor = { query },
) {
  const rows = await executor.query<Row>(
    `select ce.*, c.slug as client_slug, c.name as client_name
    from public.calendar_events ce join public.users u on u.id = ce.user_id
    left join public.clients c on c.id = ce.client_id where u.slug = 'martu' and ce.id = $1 limit 1`,
    [id],
  );
  if (!rows[0]) throw new Error("No encontré el evento manual.");
  return rows[0];
}

export async function updateCalendarEventV1(
  id: string,
  input: {
    clientSlug?: string | null;
    title?: string;
    description?: string;
    startsAt?: string;
    endsAt?: string | null;
    allDay?: boolean;
    kind?: string;
    status?: string;
    entityType?: string | null;
    entityId?: string | null;
    targetPath?: string | null;
  },
) {
  return transaction(async (tx) => {
    await getManualCalendarEventV1(id, tx);
    const client =
      present(input.clientSlug) && input.clientSlug
        ? await ownedClient(tx, input.clientSlug)
        : undefined;
    await tx.query<Row>(
      `update public.calendar_events set
      client_id = case when $2 then $3 else client_id end,
      title = case when $4 then $5 else title end,
      description = case when $6 then $7 else description end,
      starts_at = case when $8 then $9 else starts_at end,
      ends_at = case when $10 then $11 else ends_at end,
      all_day = case when $12 then $13 else all_day end,
      kind = case when $14 then $15 else kind end,
      status = case when $16 then $17 else status end,
      entity_type = case when $18 then $19 else entity_type end,
      entity_id = case when $20 then $21 else entity_id end,
      target_path = case when $22 then $23 else target_path end
      where id = $1 returning *`,
      [
        id,
        present(input.clientSlug),
        client?.id ?? null,
        present(input.title),
        input.title?.trim() ?? null,
        present(input.description),
        input.description ?? null,
        present(input.startsAt),
        input.startsAt ?? null,
        present(input.endsAt),
        input.endsAt ?? null,
        present(input.allDay),
        input.allDay ?? null,
        present(input.kind),
        input.kind ?? null,
        present(input.status),
        input.status ?? null,
        present(input.entityType),
        input.entityType ?? null,
        present(input.entityId),
        input.entityId ?? null,
        present(input.targetPath),
        input.targetPath ?? null,
      ],
    );
    return calendarDto(await getManualCalendarEventV1(id, tx));
  });
}

export async function archiveCalendarEventV1(id: string) {
  await getManualCalendarEventV1(id);
  const rows = await query<Row>(
    "update public.calendar_events set archived_at = now(), status = 'cancelled' where id = $1 returning *",
    [id],
  );
  return calendarDto(rows[0]!);
}

export async function listClientChoicesV1() {
  const rows =
    await query<Row>(`select c.slug, c.name, c.accent from public.clients c
    join public.users u on u.id = c.user_id
    where u.slug = 'martu' and c.status <> 'archived' and c.archived_at is null
    order by c.name`);
  return rows.map(domainDto);
}

export async function listOpenLoopsV1(
  options: { status?: string; clientSlug?: string; limit?: number } = {},
) {
  const rows = await query<Row>(
    `select ol.*, c.slug as client_slug, c.name as client_name
    from public.open_loops ol join public.users u on u.id = ol.user_id
    left join public.clients c on c.id = ol.client_id
    where u.slug = 'martu' and ol.archived_at is null
      and ($1::text is null or ol.status = $1)
      and ($2::text is null or c.slug = $2)
    order by ol.salience desc, ol.updated_at desc limit $3`,
    [
      options.status ?? "open",
      options.clientSlug ?? null,
      Math.min(options.limit ?? 50, 100),
    ],
  );
  return rows.map(domainDto);
}

export async function updateOpenLoopV1(
  id: string,
  input: {
    status?: string;
    title?: string;
    body?: string;
    nextEligibleAt?: string | null;
  },
) {
  const rows = await query<Row>(
    `update public.open_loops ol set
      status = case when $2 then $3 else status end,
      title = case when $4 then $5 else title end,
      body = case when $6 then $7 else body end,
      next_eligible_at = case when $8 then $9 else next_eligible_at end,
      archived_at = case when $2 and $3 = 'archived' then now() else archived_at end
    from public.users u where ol.user_id = u.id and u.slug = 'martu' and ol.id = $1 returning ol.*`,
    [
      id,
      present(input.status),
      input.status ?? null,
      present(input.title),
      input.title?.trim() ?? null,
      present(input.body),
      input.body ?? null,
      present(input.nextEligibleAt),
      input.nextEligibleAt ?? null,
    ],
  );
  if (!rows[0]) throw new Error("No encontré ese pendiente.");
  return domainDto(rows[0]);
}

export async function listThreadsV1(
  options: {
    clientSlug?: string;
    limit?: number;
    includeArchived?: boolean;
  } = {},
) {
  const rows = await query<Row>(
    `select t.*, c.slug as client_slug, c.name as client_name
    from public.chat_threads t join public.users u on u.id = t.user_id
    left join public.clients c on c.id = t.client_id
    where u.slug = 'martu' and ($1::text is null or c.slug = $1)
      and ($2 or t.archived_at is null)
    order by coalesce(t.last_message_at,t.created_at) desc limit $3`,
    [
      options.clientSlug ?? null,
      options.includeArchived ?? false,
      Math.min(options.limit ?? 30, 100),
    ],
  );
  return rows.map(domainDto);
}

export async function getThreadV1(
  id: string,
  options: { limit?: number } = {},
) {
  const threads = await query<Row>(
    `select t.*, c.slug as client_slug, c.name as client_name
    from public.chat_threads t join public.users u on u.id = t.user_id
    left join public.clients c on c.id = t.client_id
    where u.slug = 'martu' and t.id = $1 limit 1`,
    [id],
  );
  if (!threads[0]) throw new Error("No encontré esa conversación.");
  const messages = await query<Row>(
    `select * from (
      select m.* from public.chat_messages m where m.thread_id = $1 order by m.created_at desc limit $2
    ) recent order by created_at`,
    [id, Math.min(options.limit ?? 80, 150)],
  );
  return { thread: domainDto(threads[0]), messages: messages.map(domainDto) };
}

export async function updateNudgesLifecycleV1(input: {
  id?: string;
  action: "read" | "resolve" | "dismiss" | "snooze" | "reduce_insistence";
  snoozedUntil?: string;
  reason?: string;
  all?: boolean;
}) {
  return transaction(async (tx) => {
    const userId = await martuUserId(tx);
    if (!input.id && !input.all)
      throw new Error("Falta indicar qué aviso querés cambiar.");
    const id = input.id ?? null;
    let rows: Row[];
    if (input.action === "read") {
      rows = await tx.query<Row>(
        `update public.ai_nudges set status = case when status in ('pending','delivered') then 'seen' else status end,
        seen_at = coalesce(seen_at,now())
        where user_id = $1 and ($2::bigint is null or id = $2) and status in ('pending','delivered','seen') returning *`,
        [userId, id],
      );
    } else if (input.action === "resolve") {
      rows = await tx.query<Row>(
        `update public.ai_nudges set status = 'acted', lifecycle_state = 'resolved',
        acted_at = coalesce(acted_at,now()), resolved_at = now(), resolution_reason = $3
        where user_id = $1 and ($2::bigint is null or id = $2) and lifecycle_state in ('active','snoozed') returning *`,
        [userId, id, input.reason ?? "manual"],
      );
    } else if (input.action === "snooze") {
      if (!input.snoozedUntil)
        throw new Error("Falta indicar hasta cuándo posponer.");
      rows = await tx.query<Row>(
        `update public.ai_nudges set status = 'pending', lifecycle_state = 'snoozed',
        snoozed_until = $3, deliver_after = greatest(deliver_after,$3::timestamptz)
        where user_id = $1 and ($2::bigint is null or id = $2) and lifecycle_state in ('active','snoozed') returning *`,
        [userId, id, input.snoozedUntil],
      );
    } else {
      rows = await tx.query<Row>(
        `update public.ai_nudges set status = 'dismissed', lifecycle_state = 'dismissed',
        dismissed_at = now(), resolution_reason = $3
        where user_id = $1 and ($2::bigint is null or id = $2) and lifecycle_state in ('active','snoozed') returning *`,
        [
          userId,
          id,
          input.action === "reduce_insistence"
            ? "reduce_insistence"
            : (input.reason ?? "dismissed"),
        ],
      );
      if (input.action === "reduce_insistence" && rows[0]) {
        const nudge = rows[0];
        await tx.query(
          `insert into public.notification_suppressions
          (user_id,client_id,kind,scope,reason,suppressed_until)
          values ($1,$2,$3,'kind',$4,now() + interval '90 days')`,
          [
            userId,
            nudge.client_id ?? null,
            nudge.kind ?? null,
            input.reason ?? "Menos avisos de este tipo",
          ],
        );
      }
    }
    return { count: rows.length, nudges: rows.map(domainDto) };
  });
}
