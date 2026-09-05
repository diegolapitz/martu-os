import "server-only";

import {
  query,
  transaction,
  type DatabaseRow,
  type DbExecutor,
} from "@/server/db";
import { requireAppUserSlug } from "@/server/auth";

import type {
  ClientSetupPatchInput,
  CreateClientInput,
  CreateServiceInput,
  OnboardingPatchInput,
  UpdateServiceInput,
} from "./contracts";
import type {
  ClientBrief,
  ClientSetup,
  ClientStrategy,
  CreatedClient,
  FreelancerService,
  OnboardingBundle,
  OnboardingClient,
  OnboardingUserProfile,
  OnboardingState,
  OnboardingStep,
  OnboardingStatus,
  SetupItem,
} from "./types";

type Row = DatabaseRow;
type Executor = Pick<DbExecutor, "query">;

const WORKFLOW_STATES = [
  ["idea", "Idea", "#94a3b8", 10, null],
  ["script", "Guion", "#8b5cf6", 20, null],
  ["to_record", "Para grabar", "#f59e0b", 30, null],
  ["recorded", "Grabado", "#f97316", 40, null],
  ["editing", "Editando", "#0ea5e9", 50, null],
  ["ready", "Listo", "#14b8a6", 60, null],
  ["approval", "En aprobación", "#eab308", 70, null],
  ["approved", "Aprobado", "#22c55e", 80, null],
  ["scheduled", "Programado", "#3b82f6", 90, null],
  ["published", "Publicado", "#16a34a", 100, "published"],
  ["delivered", "Entregado", "#475569", 110, "delivered"],
] as const;

export class OnboardingNotFoundError extends Error {
  readonly status = 404;

  constructor(message: string) {
    super(message);
    this.name = "OnboardingNotFoundError";
  }
}

export class OnboardingConflictError extends Error {
  readonly status = 409;

  constructor(message: string) {
    super(message);
    this.name = "OnboardingConflictError";
  }
}

export async function getOnboardingBundle(
  userSlug: string,
): Promise<OnboardingBundle> {
  return transaction(async (tx) => {
    const userId = await ownedUserId(tx, userSlug);
    const onboarding = await ensureOnboardingState(tx, userId);
    const [services, clients] = await Promise.all([
      listServicesForUser(tx, userId, true),
      listOnboardingClients(tx, userId),
    ]);
    return onboardingBundle(tx, userId, onboarding, services, clients);
  });
}

export async function updateOnboarding(
  userSlug: string,
  input: OnboardingPatchInput,
): Promise<OnboardingBundle> {
  return transaction(async (tx) => {
    const userId = await ownedUserId(tx, userSlug);
    const current = await ensureOnboardingState(tx, userId, true);

    const changesProfile =
      input.profileText !== undefined ||
      input.profileName !== undefined ||
      input.timezone !== undefined ||
      input.confirmedServiceIds !== undefined;
    if (changesProfile && input.confirmed !== true) {
      throw new OnboardingConflictError(
        "Confirmá lo que entendimos antes de guardarlo.",
      );
    }

    if (input.confirmedServiceIds) {
      await requireOwnedActiveServices(tx, userId, input.confirmedServiceIds);
    }

    if (
      input.profileName !== undefined ||
      input.timezone !== undefined ||
      input.profileText !== undefined
    ) {
      await tx.query(
        `update public.users set
          name = coalesce($2, name),
          preferred_name = coalesce($2, preferred_name),
          timezone = coalesce($3, timezone),
          profile_description = coalesce($4, profile_description),
          updated_at = now()
        where id = $1`,
        [
          userId,
          input.profileName ?? null,
          input.timezone ?? null,
          input.profileText ?? null,
        ],
      );
    }

    const completed = input.completed ?? current.completed;
    const skipped = input.skipped ?? current.skipped;
    const overlap = completed.find((step) => skipped.includes(step));
    if (overlap) {
      throw new OnboardingConflictError(
        `El paso ${overlap} no puede estar completo y salteado a la vez.`,
      );
    }

    const status = input.status ?? current.status;
    const step = status === "completed" ? "complete" : (input.step ?? current.step);
    const startedAt =
      status === "not_started"
        ? current.startedAt
        : (current.startedAt ?? new Date().toISOString());
    const completedAt =
      status === "completed"
        ? (current.completedAt ?? new Date().toISOString())
        : null;
    const skippedAt =
      status === "skipped"
        ? (current.skippedAt ?? new Date().toISOString())
        : null;

    const rows = await tx.query<Row>(
      `update public.onboarding_states set
        status = $2,
        current_step = $3,
        completed_steps = $4,
        skipped_steps = $5,
        profile_text = $6,
        confirmed_service_ids = $7,
        started_at = $8,
        completed_at = $9,
        skipped_at = $10
      where user_id = $1
      returning *`,
      [
        userId,
        status,
        step,
        completed,
        skipped,
        input.profileText ?? current.profileText,
        input.confirmedServiceIds ?? current.confirmedServiceIds,
        startedAt,
        completedAt,
        skippedAt,
      ],
    );

    const [services, clients] = await Promise.all([
      listServicesForUser(tx, userId, true),
      listOnboardingClients(tx, userId),
    ]);
    return onboardingBundle(
      tx,
      userId,
      onboardingDto(rows[0]!),
      services,
      clients,
    );
  });
}

async function onboardingBundle(
  executor: Executor,
  userId: string,
  onboarding: OnboardingState,
  services: FreelancerService[],
  clients: OnboardingClient[],
): Promise<OnboardingBundle> {
  const rows = await executor.query<Row>(
    "select * from public.users where id = $1 limit 1",
    [userId],
  );
  const row = rows[0]!;
  const name = String(row.name ?? "Freelancer");
  const user: OnboardingUserProfile = {
    name,
    preferredName: String(row.preferred_name ?? name),
    email: row.email == null ? null : String(row.email),
    timezone: String(row.timezone ?? "America/Argentina/Buenos_Aires"),
    avatarUrl: row.avatar_url == null ? null : String(row.avatar_url),
    description: String(row.profile_description ?? ""),
  };
  const profileDone =
    onboarding.completed.includes("profile") ||
    Boolean(onboarding.profileText.trim());
  const servicesDone =
    onboarding.completed.includes("services") ||
    onboarding.confirmedServiceIds.length > 0;
  const hasClient = clients.length > 0;
  const stage =
    onboarding.status === "completed" || (profileDone && servicesDone && hasClient)
      ? "active"
      : onboarding.status === "skipped"
        ? "client_optional"
        : !onboarding.startedAt
          ? "account_ready"
          : !profileDone
            ? "profile_pending"
            : !servicesDone
              ? "services_pending"
              : "client_pending";
  return {
    onboarding,
    user,
    firstRun: {
      stage,
      minimumReady: servicesDone,
      nextPath:
        stage === "active"
          ? clients[0]
            ? `/clients/${clients[0].slug}`
            : "/day"
          : "/onboarding",
    },
    services,
    clients,
  };
}

export async function listFreelancerServices(
  userSlug: string,
  includeArchived = true,
): Promise<FreelancerService[]> {
  const userId = await ownedUserId({ query }, userSlug);
  return listServicesForUser({ query }, userId, includeArchived);
}

export async function createFreelancerService(
  userSlug: string,
  input: CreateServiceInput,
): Promise<FreelancerService> {
  return transaction(async (tx) => {
    const userId = await ownedUserId(tx, userSlug);
    await requireUniqueServiceName(tx, userId, input.name);
    const slug = await availableServiceSlug(tx, userId, slugify(input.name));
    const orderRows = await tx.query<Row>(
      `select coalesce(max(sort_order), 0) + 10 as next_order
      from public.services where user_id = $1 and archived_at is null`,
      [userId],
    );
    const rows = await tx.query<Row>(
      `insert into public.services
        (user_id, slug, name, short_name, tab_key, sort_order, is_custom, icon)
      values ($1,$2,$3,$3,null,$4,true,$5)
      returning *`,
      [
        userId,
        slug,
        input.name,
        Number(orderRows[0]?.next_order ?? 10),
        input.icon,
      ],
    );
    return serviceDto(rows[0]!);
  });
}

export async function updateFreelancerService(
  userSlug: string,
  serviceId: string,
  input: UpdateServiceInput,
): Promise<FreelancerService> {
  return transaction(async (tx) => {
    const userId = await ownedUserId(tx, userSlug);
    const service = await ownedService(tx, userId, serviceId, true);
    if (
      (input.name && input.name !== String(service.name)) ||
      input.active === true
    ) {
      await requireUniqueServiceName(
        tx,
        userId,
        input.name ?? String(service.name),
        serviceId,
      );
    }

    const rows = await tx.query<Row>(
      `update public.services set
        name = case when $3 then $4 else name end,
        short_name = case when $3 then $4 else short_name end,
        icon = case when $5 then $6 else icon end,
        archived_at = case
          when not $7 then archived_at
          when $8 then null
          else now()
        end
      where id = $1 and user_id = $2
      returning *`,
      [
        serviceId,
        userId,
        input.name !== undefined,
        input.name ?? null,
        input.icon !== undefined,
        input.icon ?? null,
        input.active !== undefined,
        input.active ?? true,
      ],
    );

    if (input.active === false) {
      await tx.query(
        `update public.client_services cs set is_active = false
        from public.clients c
        where cs.client_id = c.id and c.user_id = $1 and cs.service_id = $2`,
        [userId, serviceId],
      );
      if (String(service.slug) === "publishing") {
        await tx.query(
          `update public.content_workflow_states ws set is_visible = case
            when ws.slug = 'delivered' then true
            when ws.slug in ('scheduled','published') then false
            else ws.is_visible
          end
          from public.content_workflows w
          where ws.workflow_id = w.id and w.is_default
            and w.client_id in (
              select cs.client_id from public.client_services cs
              join public.clients c on c.id = cs.client_id
              where c.user_id = $1 and cs.service_id = $2
            )
            and ws.slug in ('scheduled','published','delivered')`,
          [userId, serviceId],
        );
      }
    }

    return serviceDto(rows[0]!);
  });
}

export async function reorderFreelancerServices(
  userSlug: string,
  serviceIds: string[],
): Promise<FreelancerService[]> {
  return transaction(async (tx) => {
    const userId = await ownedUserId(tx, userSlug);
    const rows = await tx.query<Row>(
      `select id from public.services
      where user_id = $1 and archived_at is null
      order by sort_order, id for update`,
      [userId],
    );
    const currentIds = rows.map((row) => String(row.id));
    if (!sameSet(currentIds, serviceIds)) {
      throw new OnboardingConflictError(
        "Mandá cada servicio activo una sola vez para guardar el orden.",
      );
    }

    await tx.query(
      `update public.services s set sort_order = ordered.position * 10
      from unnest($2::bigint[]) with ordinality as ordered(id, position)
      where s.user_id = $1 and s.id = ordered.id`,
      [userId, serviceIds],
    );
    return listServicesForUser(tx, userId, true);
  });
}

export async function createOnboardingClient(
  userSlug: string,
  input: CreateClientInput,
): Promise<{ client: CreatedClient; setup: ClientSetup }> {
  return transaction(async (tx) => {
    const userId = await ownedUserId(tx, userSlug);
    const services = await requireOwnedActiveServices(
      tx,
      userId,
      input.serviceIds,
    );
    const slug = await availableClientSlug(tx, userId, slugify(input.name));
    const rows = await tx.query<Row>(
      `insert into public.clients
        (user_id, slug, name, description, summary, status, accent,
         avatar_initial, logo_url, metadata)
      values ($1,$2,$3,$4,$4,'active',$5,$6,$7,'{}'::jsonb)
      returning *`,
      [
        userId,
        slug,
        input.name,
        input.description,
        input.color,
        firstInitial(input.name),
        input.logoUrl ?? null,
      ],
    );
    const client = rows[0]!;

    for (const service of services) {
      await tx.query(
        `insert into public.client_services (client_id, service_id, is_active)
        values ($1,$2,true)`,
        [client.id, service.id],
      );
    }
    await tx.query(
      `insert into public.briefs (client_id, status, source)
      values ($1,'missing','manual') on conflict (client_id) do nothing`,
      [client.id],
    );
    await provisionClientWorkflow(
      tx,
      String(client.id),
      services.some((service) => String(service.slug) === "publishing"),
    );
    await tx.query(
      `insert into public.script_counters (client_id, next_number)
      values ($1,1) on conflict (client_id) do nothing`,
      [client.id],
    );
    await tx.query(
      `insert into public.activity_events
        (user_id, client_id, actor, type, title, entity_type, entity_id,
         target_path, metadata)
      values ($1,$2,'Martu','client.created',$3,'client',$2,$4,'{}'::jsonb)`,
      [userId, client.id, `Cliente: ${input.name}`, `/clients/${slug}`],
    );

    const setup = await clientSetup(tx, client, input.serviceIds);
    return {
      client: createdClientDto(client, input.serviceIds),
      setup,
    };
  });
}

export async function getClientSetup(
  userSlug: string,
  clientSlug: string,
): Promise<{ client: CreatedClient; setup: ClientSetup }> {
  return transaction(async (tx) => {
    const userId = await ownedUserId(tx, userSlug);
    const client = await ownedClient(tx, userId, clientSlug);
    const serviceIds = await clientServiceIds(tx, String(client.id));
    return {
      client: createdClientDto(client, serviceIds),
      setup: await clientSetup(tx, client, serviceIds),
    };
  });
}

export async function updateClientSetup(
  userSlug: string,
  clientSlug: string,
  input: ClientSetupPatchInput,
): Promise<{ client: CreatedClient; setup: ClientSetup }> {
  return transaction(async (tx) => {
    const userId = await ownedUserId(tx, userSlug);
    let client = await ownedClient(tx, userId, clientSlug, true);

    if (input.brief?.source === "voice" && input.brief.confirmed !== true) {
      throw new OnboardingConflictError(
        "Confirmá la transcripción del brief antes de guardarla.",
      );
    }
    if (
      input.strategy?.sourceType === "voice" &&
      input.strategy.confirmed !== true
    ) {
      throw new OnboardingConflictError(
        "Confirmá la transcripción de la estrategia antes de guardarla.",
      );
    }

    if (input.serviceIds) {
      const services = await requireOwnedActiveServices(
        tx,
        userId,
        input.serviceIds,
      );
      await tx.query(
        "update public.client_services set is_active = false where client_id = $1",
        [client.id],
      );
      for (const service of services) {
        await tx.query(
          `insert into public.client_services (client_id, service_id, is_active)
          values ($1,$2,true)
          on conflict (client_id, service_id) do update set is_active = true`,
          [client.id, service.id],
        );
      }
      await syncPublishingWorkflow(
        tx,
        String(client.id),
        services.some((service) => String(service.slug) === "publishing"),
      );
    }

    if (input.brief) await upsertBrief(tx, String(client.id), input.brief);
    if (input.strategy && !input.strategy.deferred) {
      await upsertStrategy(tx, String(client.id), input.strategy);
    }
    if (input.channels || input.strategy) {
      const metadata = objectValue(client.metadata);
      const currentSetup = objectValue(metadata.setup);
      const setupMetadata = {
        ...currentSetup,
        ...input.channels,
        ...(input.strategy
          ? { strategyDeferred: input.strategy.deferred === true }
          : {}),
      };
      const nextMetadata = { ...metadata, setup: setupMetadata };
      const rows = await tx.query<Row>(
        "update public.clients set metadata = $2::jsonb where id = $1 returning *",
        [client.id, JSON.stringify(nextMetadata)],
      );
      client = rows[0]!;
    }

    const serviceIds =
      input.serviceIds ?? (await clientServiceIds(tx, String(client.id)));
    return {
      client: createdClientDto(client, serviceIds),
      setup: await clientSetup(tx, client, serviceIds),
    };
  });
}

async function ownedUserId(executor: Executor, slug: string): Promise<string> {
  const authenticatedSlug = await requireAppUserSlug(executor);
  if (authenticatedSlug !== slug) {
    throw new OnboardingNotFoundError("No encontré tu perfil.");
  }
  const rows = await executor.query<Row>(
    "select id from public.users where slug = $1 limit 1",
    [slug],
  );
  if (!rows[0]) {
    throw new OnboardingNotFoundError("No encontré tu perfil.");
  }
  return String(rows[0].id);
}

async function ensureOnboardingState(
  executor: Executor,
  userId: string,
  lock = false,
): Promise<OnboardingState> {
  await executor.query(
    `insert into public.onboarding_states (user_id)
    values ($1) on conflict (user_id) do nothing`,
    [userId],
  );
  const rows = await executor.query<Row>(
    `select * from public.onboarding_states where user_id = $1${lock ? " for update" : ""}`,
    [userId],
  );
  return onboardingDto(rows[0]!);
}

function onboardingDto(row: Row): OnboardingState {
  return {
    status: String(row.status) as OnboardingStatus,
    step: String(row.current_step) as OnboardingStep,
    completed: stringArray(row.completed_steps) as OnboardingStep[],
    skipped: stringArray(row.skipped_steps) as OnboardingStep[],
    profileText: String(row.profile_text ?? ""),
    confirmedServiceIds: stringArray(row.confirmed_service_ids),
    startedAt: nullableIso(row.started_at),
    completedAt: nullableIso(row.completed_at),
    skippedAt: nullableIso(row.skipped_at),
    updatedAt: nullableIso(row.updated_at) ?? new Date(0).toISOString(),
  };
}

async function listServicesForUser(
  executor: Executor,
  userId: string,
  includeArchived: boolean,
): Promise<FreelancerService[]> {
  const rows = await executor.query<Row>(
    `select * from public.services
    where user_id = $1 and ($2::boolean or archived_at is null)
    order by (archived_at is not null), sort_order, id`,
    [userId, includeArchived],
  );
  return rows.map(serviceDto);
}

function serviceDto(row: Row): FreelancerService {
  return {
    id: String(row.id),
    name: String(row.name),
    icon: String(row.icon ?? "briefcase-business"),
    sortOrder: Number(row.sort_order ?? 0),
    active: row.archived_at == null,
  };
}

async function listOnboardingClients(
  executor: Executor,
  userId: string,
): Promise<OnboardingClient[]> {
  const rows = await executor.query<Row>(
    `select id, slug, name, accent, logo_url from public.clients
    where user_id = $1 and archived_at is null and status <> 'archived'
    order by created_at desc, id desc`,
    [userId],
  );
  return rows.map((row) => ({
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    color: String(row.accent),
    logoUrl: row.logo_url == null ? null : String(row.logo_url),
  }));
}

async function ownedService(
  executor: Executor,
  userId: string,
  serviceId: string,
  lock = false,
): Promise<Row> {
  const rows = await executor.query<Row>(
    `select * from public.services
    where user_id = $1 and id = $2${lock ? " for update" : ""}`,
    [userId, serviceId],
  );
  if (!rows[0]) {
    throw new OnboardingNotFoundError("No encontré ese servicio.");
  }
  return rows[0];
}

async function requireUniqueServiceName(
  executor: Executor,
  userId: string,
  name: string,
  exceptId?: string,
): Promise<void> {
  const rows = await executor.query<Row>(
    `select id from public.services
    where user_id = $1 and lower(btrim(name)) = lower(btrim($2))
      and archived_at is null and ($3::bigint is null or id <> $3)
    limit 1`,
    [userId, name, exceptId ?? null],
  );
  if (rows[0]) {
    throw new OnboardingConflictError("Ya tenés un servicio con ese nombre.");
  }
}

async function availableServiceSlug(
  executor: Executor,
  userId: string,
  base: string,
): Promise<string> {
  const rows = await executor.query<Row>(
    `select slug from public.services
    where user_id = $1 and (slug = $2 or slug like $2 || '-%')`,
    [userId, base],
  );
  return availableSlug(base, rows.map((row) => String(row.slug)));
}

async function requireOwnedActiveServices(
  executor: Executor,
  userId: string,
  serviceIds: string[],
): Promise<Row[]> {
  const rows = await executor.query<Row>(
    `select id, slug from public.services
    where user_id = $1 and archived_at is null and id = any($2::bigint[])
    order by sort_order, id`,
    [userId, serviceIds],
  );
  if (!sameSet(rows.map((row) => String(row.id)), serviceIds)) {
    throw new OnboardingConflictError(
      "Hay un servicio archivado o que no pertenece a tu catálogo.",
    );
  }
  return rows;
}

async function availableClientSlug(
  executor: Executor,
  userId: string,
  base: string,
): Promise<string> {
  const rows = await executor.query<Row>(
    `select slug from public.clients
    where user_id = $1 and (slug = $2 or slug like $2 || '-%')`,
    [userId, base],
  );
  return availableSlug(base, rows.map((row) => String(row.slug)));
}

async function provisionClientWorkflow(
  executor: Executor,
  clientId: string,
  publishes: boolean,
): Promise<void> {
  const workflowRows = await executor.query<Row>(
    `insert into public.content_workflows (client_id, name, slug, is_default)
    values ($1,'Flujo principal','principal',true)
    on conflict (client_id, slug) do update set is_default = true
    returning id`,
    [clientId],
  );
  const workflowId = String(workflowRows[0]!.id);
  for (const [slug, label, color, position, terminalKind] of WORKFLOW_STATES) {
    const visible =
      slug === "delivered"
        ? !publishes
        : ["scheduled", "published"].includes(slug)
          ? publishes
          : true;
    await executor.query(
      `insert into public.content_workflow_states
        (workflow_id, slug, label, color, position, is_visible, terminal_kind)
      values ($1,$2,$3,$4,$5,$6,$7)
      on conflict (workflow_id, slug) do update set is_visible = excluded.is_visible`,
      [workflowId, slug, label, color, position, visible, terminalKind],
    );
  }
}

async function syncPublishingWorkflow(
  executor: Executor,
  clientId: string,
  publishes: boolean,
): Promise<void> {
  await executor.query(
    `update public.content_workflow_states ws set is_visible = case
      when ws.slug = 'delivered' then not $2
      when ws.slug in ('scheduled','published') then $2
      else ws.is_visible
    end
    from public.content_workflows w
    where ws.workflow_id = w.id and w.client_id = $1 and w.is_default
      and ws.slug in ('scheduled','published','delivered')`,
    [clientId, publishes],
  );
}

async function ownedClient(
  executor: Executor,
  userId: string,
  slug: string,
  lock = false,
): Promise<Row> {
  const rows = await executor.query<Row>(
    `select * from public.clients
    where user_id = $1 and slug = $2 and archived_at is null
      and status <> 'archived'${lock ? " for update" : ""}`,
    [userId, slug],
  );
  if (!rows[0]) {
    throw new OnboardingNotFoundError("No encontré ese cliente.");
  }
  return rows[0];
}

async function clientServiceIds(
  executor: Executor,
  clientId: string,
): Promise<string[]> {
  const rows = await executor.query<Row>(
    `select cs.service_id from public.client_services cs
    join public.services s on s.id = cs.service_id
    where cs.client_id = $1 and cs.is_active and s.archived_at is null
    order by s.sort_order, s.id`,
    [clientId],
  );
  return rows.map((row) => String(row.service_id));
}

async function upsertBrief(
  executor: Executor,
  clientId: string,
  input: NonNullable<ClientSetupPatchInput["brief"]>,
): Promise<void> {
  const currentRows = await executor.query<Row>(
    "select * from public.briefs where client_id = $1 limit 1",
    [clientId],
  );
  const current = currentRows[0];
  const confirmed = input.confirmed === true;
  const businessDescription =
    input.businessDescription ?? String(current?.business_description ?? "");
  const desiredOutcomes =
    input.desiredOutcomes ?? stringArray(current?.desired_outcomes);
  const currentObjectives = stringArray(current?.objectives);
  const objectives =
    input.objectives ??
    (currentObjectives.length > 0 ? currentObjectives : desiredOutcomes);
  const audience = input.audience ?? String(current?.audience ?? "");
  const differentiators =
    input.differentiators ?? stringArray(current?.differentiators);
  const tone = input.tone ?? String(current?.tone ?? "");
  const competitors = input.competitors ?? stringArray(current?.competitors);
  const avoidances = input.avoidances ?? stringArray(current?.avoidances);
  const relevantLinks =
    input.relevantLinks ?? stringArray(current?.relevant_links);
  const sourceText = input.sourceText ?? String(current?.source_text ?? "");
  const hasContentChange = Object.keys(input).some(
    (key) => !["status", "confirmed"].includes(key),
  );
  const inferredStatus =
    businessDescription.trim() && audience.trim() && objectives.length > 0
      ? "complete"
      : "draft";
  const status =
    input.status ??
    (confirmed
      ? inferredStatus
      : hasContentChange
        ? "draft"
        : String(current?.status ?? "draft"));
  const confirmedAt =
    input.confirmed === true
      ? new Date().toISOString()
      : input.confirmed === false
        ? null
        : (current?.confirmed_at ?? null);
  await executor.query(
    `insert into public.briefs
      (client_id, status, business_description, positioning, objectives,
       audience, differentiators, tone, competitors, desired_outcomes,
       avoidances, constraints, relevant_links, source, source_text, confirmed_at)
    values ($1,$2,$3,$3,$4,$5,$6,$7,$8,$9,$10,$10,$11,$12,$13,$14)
    on conflict (client_id) do update set
      status = excluded.status,
      business_description = excluded.business_description,
      positioning = excluded.positioning,
      objectives = excluded.objectives,
      audience = excluded.audience,
      differentiators = excluded.differentiators,
      tone = excluded.tone,
      competitors = excluded.competitors,
      desired_outcomes = excluded.desired_outcomes,
      avoidances = excluded.avoidances,
      constraints = excluded.constraints,
      relevant_links = excluded.relevant_links,
      source = excluded.source,
      source_text = excluded.source_text,
      confirmed_at = excluded.confirmed_at`,
    [
      clientId,
      status,
      businessDescription,
      objectives,
      audience,
      differentiators,
      tone,
      competitors,
      desiredOutcomes,
      avoidances,
      relevantLinks,
      input.source ?? String(current?.source ?? "manual"),
      sourceText,
      confirmedAt,
    ],
  );
}

async function upsertStrategy(
  executor: Executor,
  clientId: string,
  input: NonNullable<ClientSetupPatchInput["strategy"]>,
): Promise<void> {
  const currentRows = await executor.query<Row>(
    `select * from public.strategies
    where client_id = $1 order by version desc limit 1 for update`,
    [clientId],
  );
  const current = currentRows[0];
  const confirmed = input.confirmed === true;
  const hasContent = Boolean(
    (input.sourceText ?? String(current?.source_text ?? "")).trim() ||
      (input.sourceUrl ?? String(current?.source_url ?? "")) ||
      (input.objectives ?? stringArray(current?.objectives)).length > 0 ||
      (input.audience ?? String(current?.audience ?? "")).trim() ||
      (input.positioning ?? String(current?.positioning ?? "")).trim() ||
      (input.pillars ?? stringArray(current?.pillars)).length > 0 ||
      (input.notes ?? String(current?.notes ?? "")).trim(),
  );
  const nextStatus =
    input.status ?? (confirmed && hasContent ? "active" : "draft");
  if (!current) {
    await executor.query(
      `insert into public.strategies
        (client_id, title, status, version, objectives, audience, tone,
         positioning, pillars, hypotheses, decisions, notes, source_type,
         source_url, source_text, confirmed_at)
      values ($1,$2,$3,1,$4,$5,$6,$7,$8,'{}','{}',$9,$10,$11,$12,$13)`,
      [
        clientId,
        input.title ?? "Estrategia",
        nextStatus,
        input.objectives ?? [],
        input.audience ?? "",
        input.tone ?? "",
        input.positioning ?? "",
        input.pillars ?? [],
        input.notes ?? "",
        input.sourceType ?? "manual",
        input.sourceUrl ?? null,
        input.sourceText ?? "",
        confirmed ? new Date().toISOString() : null,
      ],
    );
    return;
  }

  await executor.query(
    `update public.strategies set
      title = case when $2 then $3 else title end,
      status = case when $4 then $5 else status end,
      objectives = case when $6 then $7 else objectives end,
      audience = case when $8 then $9 else audience end,
      tone = case when $10 then $11 else tone end,
      positioning = case when $12 then $13 else positioning end,
      pillars = case when $14 then $15 else pillars end,
      notes = case when $16 then $17 else notes end,
      source_type = case when $18 then $19 else source_type end,
      source_url = case when $20 then $21 else source_url end,
      source_text = case when $22 then $23 else source_text end,
      confirmed_at = case when $24 then $25 else confirmed_at end
    where id = $1`,
    [
      current.id,
      input.title !== undefined,
      input.title ?? null,
      input.status !== undefined || input.confirmed !== undefined,
      nextStatus,
      input.objectives !== undefined,
      input.objectives ?? null,
      input.audience !== undefined,
      input.audience ?? null,
      input.tone !== undefined,
      input.tone ?? null,
      input.positioning !== undefined,
      input.positioning ?? null,
      input.pillars !== undefined,
      input.pillars ?? null,
      input.notes !== undefined,
      input.notes ?? null,
      input.sourceType !== undefined,
      input.sourceType ?? null,
      input.sourceUrl !== undefined,
      input.sourceUrl ?? null,
      input.sourceText !== undefined,
      input.sourceText ?? null,
      input.confirmed !== undefined,
      confirmed ? new Date().toISOString() : null,
    ],
  );
}

async function clientSetup(
  executor: Executor,
  client: Row,
  serviceIds: string[],
): Promise<ClientSetup> {
  const [serviceRows, briefRows, strategyRows, operationRows] = await Promise.all([
    executor.query<Row>(
      `select s.slug from public.client_services cs
      join public.services s on s.id = cs.service_id
      where cs.client_id = $1 and cs.is_active and s.archived_at is null`,
      [client.id],
    ),
    executor.query<Row>("select * from public.briefs where client_id = $1", [client.id]),
    executor.query<Row>(
      `select * from public.strategies
      where client_id = $1 order by version desc limit 1`,
      [client.id],
    ),
    executor.query<Row>(
      `select
        exists(select 1 from public.content_workflows where client_id = $1 and is_default) as has_workflow,
        exists(select 1 from public.ideas where client_id = $1 and deleted_at is null) as has_planning`,
      [client.id],
    ),
  ]);
  const brief = briefRows[0] ? briefDto(briefRows[0]) : null;
  const strategy = strategyRows[0] ? strategyDto(strategyRows[0]) : null;
  const slugs = new Set(serviceRows.map((row) => String(row.slug)));
  const setupMetadata = objectValue(objectValue(client.metadata).setup);
  const hasPaidMedia = slugs.has("meta-ads") || slugs.has("google-ads");

  const sections: ClientSetup["sections"] = [
    {
      id: "base",
      label: "Base",
      items: [
        setupItem("identity", "Identidad", Boolean(String(client.name).trim() && String(client.accent).trim()), false),
        setupItem("logo", "Logo", client.logo_url != null, true),
        setupItem("services", "Servicios", serviceIds.length > 0, false),
        setupItem("brief", "Brief básico", brief?.status === "complete", true),
      ],
    },
    {
      id: "strategy",
      label: "Estrategia",
      items: [
        setupItem("strategy", "Estrategia vigente", strategy?.status === "active", true),
      ],
    },
    {
      id: "channels",
      label: "Canales",
      items: [
        setupItem("instagram", "Instagram", Boolean(setupMetadata.instagram), true),
        ...(hasPaidMedia
          ? [setupItem("meta", "Meta / pauta", Boolean(setupMetadata.metaAds), true)]
          : []),
      ],
    },
    {
      id: "operation",
      label: "Operación",
      items: [
        setupItem("workflow", "Workflow", Boolean(operationRows[0]?.has_workflow), false),
        setupItem("calendar", "Calendario conectado", setupMetadata.calendarConnected === true, true),
        setupItem("planning", "Primera planificación", Boolean(operationRows[0]?.has_planning) || setupMetadata.firstPlanningDone === true, true),
      ],
    },
  ];
  const items = sections.flatMap((section) => section.items);
  const complete = items.filter((item) => item.complete).map((item) => item.id);
  const pending = items.filter((item) => !item.complete).map((item) => item.id);
  return {
    completeness: Math.round((complete.length / Math.max(items.length, 1)) * 100),
    complete,
    pending,
    sections,
    brief,
    strategy,
    channels: {
      instagram:
        setupMetadata.instagram == null ? null : String(setupMetadata.instagram),
      metaAds:
        setupMetadata.metaAds == null ? null : String(setupMetadata.metaAds),
      calendarConnected: setupMetadata.calendarConnected === true,
      firstPlanningDone: setupMetadata.firstPlanningDone === true,
    },
    strategyDeferred: setupMetadata.strategyDeferred === true,
    nonBlocking: true,
  };
}

function setupItem(
  id: string,
  label: string,
  complete: boolean,
  optional: boolean,
): SetupItem {
  return { id, label, complete, optional };
}

function briefDto(row: Row): ClientBrief {
  return {
    status: String(row.status) as ClientBrief["status"],
    businessDescription: String(row.business_description ?? ""),
    objectives: stringArray(row.objectives),
    audience: String(row.audience ?? ""),
    differentiators: stringArray(row.differentiators),
    tone: String(row.tone ?? ""),
    competitors: stringArray(row.competitors),
    desiredOutcomes: stringArray(row.desired_outcomes),
    avoidances: stringArray(row.avoidances),
    relevantLinks: stringArray(row.relevant_links),
    source: String(row.source ?? "manual"),
    sourceText: String(row.source_text ?? ""),
    confirmedAt: nullableIso(row.confirmed_at),
  };
}

function strategyDto(row: Row): ClientStrategy {
  return {
    status: String(row.status) as ClientStrategy["status"],
    title: String(row.title),
    objectives: stringArray(row.objectives),
    audience: String(row.audience ?? ""),
    tone: String(row.tone ?? ""),
    positioning: String(row.positioning ?? ""),
    pillars: stringArray(row.pillars),
    notes: String(row.notes ?? ""),
    sourceType: String(row.source_type ?? "manual"),
    sourceUrl: row.source_url == null ? null : String(row.source_url),
    sourceText: String(row.source_text ?? ""),
    confirmedAt: nullableIso(row.confirmed_at),
  };
}

function createdClientDto(client: Row, serviceIds: string[]): CreatedClient {
  return {
    id: String(client.id),
    slug: String(client.slug),
    name: String(client.name),
    description: String(client.description ?? ""),
    color: String(client.accent),
    logoUrl: client.logo_url == null ? null : String(client.logo_url),
    serviceIds,
  };
}

function slugify(value: string): string {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("es-AR")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 70) || "cliente"
  );
}

function availableSlug(base: string, used: string[]): string {
  const occupied = new Set(used);
  if (!occupied.has(base)) return base;
  let suffix = 2;
  while (occupied.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function firstInitial(value: string): string {
  return Array.from(value.trim())[0]?.toLocaleUpperCase("es-AR") ?? "?";
}

function sameSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const values = new Set(left);
  return right.every((value) => values.has(value));
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  return [];
}

function objectValue(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return objectValue(parsed);
    } catch {
      return {};
    }
  }
  return typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function nullableIso(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}
