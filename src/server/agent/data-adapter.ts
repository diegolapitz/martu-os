import "server-only";
import { requireAppUserId } from "@/server/auth";

import {
  appendActivity,
  appendChatMessage,
  createCommitment,
  createReminder,
  createScript,
  createTask,
  getCommunicationProfile,
  getOrCreateChatThread,
  listChatMessages,
  listMemories,
  query,
  updateCommunicationProfile,
  updateContentV1,
  updateWorkV1,
  upsertMemory,
  type ChatMessage as DataChatMessage,
  type CommunicationProfile as DataCommunicationProfile,
  type Memory as DataMemory,
} from "@/server/data";

import type { AgentConversationStore, AgentMutationGateway, ResolvedEntity } from "./ports";
import type {
  AgentContext,
  AgentContextItem,
  AgentEntityRef,
  AgentMemory,
  AgentPlanningContext,
  AgentRequest,
  ClientRef,
  CommunicationProfile,
  RecentChatMessage,
} from "./types";

type Row = Record<string, unknown>;

export class MartuAgentDataAdapter implements AgentConversationStore, AgentMutationGateway {
  async getClient(slug: string): Promise<ClientRef | undefined> {
    return (await loadClients()).find((client) => client.slug === slug);
  }

  async getOrCreateThread(input: Parameters<AgentConversationStore["getOrCreateThread"]>[0]): Promise<string> {
    const thread = await getOrCreateChatThread({
      threadId: input.threadId,
      clientSlug: input.clientSlug,
      title: input.title ?? "Supervisora",
      source: "web",
      createNew: input.createNew,
    });
    return String(thread.id);
  }

  async appendMessage(input: Parameters<AgentConversationStore["appendMessage"]>[0]): Promise<void> {
    await appendChatMessage({
      threadId: input.threadId,
      role: input.role,
      content: input.content,
      mode: modeFromMetadata(input.metadata),
      toolName: input.role === "tool" ? String(input.metadata?.toolName ?? "") || undefined : undefined,
      toolPayload: input.metadata,
      actionResult: input.metadata,
    });
  }

  async buildPlanningContext(input: AgentRequest & {
    threadId: string;
    now: Date;
    signal?: AbortSignal;
  }): Promise<AgentPlanningContext> {
    const clients = await loadClients(input.signal);
    const threadScope = await loadThreadScope(input.threadId, input.signal);
    const pathnameSlug = input.pathname?.match(/\/(?:clients|clientes)\/([^/?#]+)/)?.[1];
    const conversationScope = threadScope?.scope
      ?? input.contextScope
      ?? (input.clientSlug || input.contextEntity?.clientSlug ? "client" : "global");
    const conversationClient = clients.find((client) => client.slug === threadScope?.clientSlug)
      ?? (conversationScope === "client"
        ? clients.find((client) => client.slug === (input.clientSlug ?? input.contextEntity?.clientSlug ?? pathnameSlug))
        : undefined);
    const userId = await martuUserId(input.signal);
    const currentViewItem = await loadCurrentViewItem({
      view: input.currentView,
      clients,
      conversationScope,
      conversationClient,
      userId,
      signal: input.signal,
    });
    const messages = await contextRead(input.signal, () => listChatMessages(input.threadId, { limit: 12 }));
    const recentMessages = messages.map(mapChatMessage);
    const requestedConversationEntity = conversationEntityFromMessages(recentMessages) ?? input.contextEntity;
    const conversationEntity = entityWithinConversationScope(requestedConversationEntity, conversationScope, conversationClient)
      ? requestedConversationEntity
      : undefined;
    return {
      now: input.now.toISOString(),
      clients,
      conversationScope,
      conversationClient,
      conversationEntity,
      currentView: canonicalCurrentView(input.currentView, currentViewItem, clients),
      currentViewItem,
      recentMessages,
      lastReferencedEntity: conversationEntity ?? entityFromNotification(input.metadata) ?? lastEntityFromMessages(recentMessages),
    };
  }

  async buildContext(input: AgentRequest & {
    threadId: string;
    now: Date;
    signal?: AbortSignal;
    clientOverride?: string;
    retrievalPlan?: import("./types").AgentRetrievalPlan;
  }): Promise<AgentContext> {
    const clients = await loadClients(input.signal);
    const threadScope = await loadThreadScope(input.threadId, input.signal);
    const pathnameSlug = input.pathname?.match(/\/(?:clients|clientes)\/([^/?#]+)/)?.[1];
    const conversationScope = threadScope?.scope
      ?? input.contextScope
      ?? (input.clientSlug || input.contextEntity?.clientSlug ? "client" : "global");
    const conversationClient = clients.find((client) => client.slug === threadScope?.clientSlug)
      ?? (conversationScope === "client"
        ? clients.find((client) => client.slug === (input.clientSlug ?? input.contextEntity?.clientSlug ?? pathnameSlug))
        : undefined);
    const scopedSlug = input.clientOverride ?? input.retrievalPlan?.clientSlug ?? conversationClient?.slug;
    const currentClient = clients.find((client) => client.slug === scopedSlug);
    const clientId = currentClient?.id;
    const scopedClause = clientId ? "and client_id = $2" : "";
    const userId = await martuUserId(input.signal);
    const params = clientId ? [userId, clientId] : [userId];
    const currentViewItem = await loadCurrentViewItem({
      view: input.currentView,
      clients,
      conversationScope,
      conversationClient,
      clientOverride: input.clientOverride,
      userId,
      signal: input.signal,
    });

    // The cloud runtime deliberately owns one postgres.js connection. Keep
    // context reads in order so a dead first socket cannot strand nine queued
    // leases and prevent the generation from being retired.
    const shouldRead = (source: NonNullable<typeof input.retrievalPlan>["sources"][number]) =>
      !input.retrievalPlan || input.retrievalPlan.sources.includes(source);
    const tasks = shouldRead("work") ? await contextRead(input.signal, () => query<Row>(`select id, client_id, title, status, due_at, updated_at, description, entity_type, entity_id
        from public.tasks where user_id = $1 ${scopedClause} and archived_at is null
        and status not in ('cancelled') order by due_at nulls last, updated_at desc limit 20`, params)) : [];
    const scripts = currentClient && shouldRead("scripts")
      ? await contextRead(input.signal, () => query<Row>(`select id, client_id, title, status, due_at, updated_at, body, script_number
        from public.scripts where client_id = $1 and status <> 'archived' order by due_at nulls last, script_number nulls last, updated_at desc limit 16`, [clientId]))
      : [];
    const content = currentClient && shouldRead("content")
      ? await contextRead(input.signal, () => query<Row>(`select id, client_id, title, status, due_at, updated_at, status_changed_at, script_id
        from public.content_items where client_id = $1 and archived_at is null order by due_at nulls last, updated_at desc limit 16`, [clientId]))
      : [];
    const notes = currentClient && shouldRead("notes")
      ? await contextRead(input.signal, () => query<Row>(`select id, client_id, text, tags, created_at, updated_at
        from public.notes where client_id = $1 order by created_at desc limit 10`, [clientId]))
      : [];
    const meetings = currentClient && shouldRead("meetings")
      ? await contextRead(input.signal, () => query<Row>(`select id, client_id, title, summary, decisions, next_steps, starts_at, updated_at
        from public.meetings where client_id = $1 order by starts_at desc limit 6`, [clientId]))
      : [];
    const metricRows = currentClient && shouldRead("metrics")
      ? await contextRead(input.signal, () => query<Row>(`select cm.id, c.slug as client_slug, ci.title, cm.reach, cm.views, cm.avg_watch_seconds,
          cm.retention_rate, cm.saves, cm.shares, cm.comments, cm.clicks, cm.inquiries, cm.conversions, cm.captured_at
        from public.content_metrics cm join public.content_items ci on ci.id = cm.content_item_id
        join public.clients c on c.id = ci.client_id where ci.client_id = $1
        order by cm.captured_at desc limit 12`, [clientId]))
      : [];
    const instagramMetricRows = currentClient && shouldRead("metrics")
      ? await contextRead(input.signal, () => query<Row>(`select im.id, c.slug as client_slug,
          coalesce(ci.title, nullif(left(im.caption, 100), ''), 'Publicación de Instagram') as title,
          im.instagram_media_id as external_id, im.media_type, im.media_product_type,
          im.published_at, im.permalink,
          coalesce(jsonb_object_agg(imi.metric_name, imi.metric_value)
            filter (where imi.metric_name is not null), '{}'::jsonb) as observed_metrics,
          'instagram_api'::text as source, 'observed'::text as evidence_kind
        from public.instagram_media im
        join public.instagram_connections ic on ic.id = im.connection_id
        join public.clients c on c.id = ic.client_id
        left join public.content_items ci on ci.id = im.content_item_id
        left join public.instagram_media_insights imi on imi.media_id = im.id
        where ic.client_id = $1
        group by im.id, c.slug, ci.title order by im.published_at desc nulls last limit 20`, [clientId]))
      : [];
    const campaigns = currentClient && shouldRead("campaigns")
      ? await contextRead(input.signal, () => query<Row>(`select ac.*, c.slug as client_slug from public.ad_campaigns ac
        join public.clients c on c.id = ac.client_id where ac.client_id = $1 order by ac.updated_at desc limit 8`, [clientId]))
      : [];
    const memoriesRaw = shouldRead("memories") ? await contextRead(input.signal, () => listMemories({
      clientSlug: currentClient?.slug,
      includeGlobal: true,
      limit: 20,
    })) : [];
    const profileRaw = await contextRead(input.signal, () => getCommunicationProfile());
    const messagesRaw = await contextRead(input.signal, () => listChatMessages(input.threadId, { limit: 12 }));

    const recentMessages = messagesRaw.map(mapChatMessage);
    const requestedConversationEntity = conversationEntityFromMessages(recentMessages) ?? input.contextEntity;
    const conversationEntity = entityWithinConversationScope(
      requestedConversationEntity,
      conversationScope,
      conversationClient,
    ) ? requestedConversationEntity : undefined;
    const currentView = canonicalCurrentView(input.currentView, currentViewItem, clients);
    return {
      now: input.now.toISOString(),
      clients,
      currentClient,
      conversationScope,
      conversationClient,
      conversationEntity,
      currentView,
      currentViewItem,
      tasks: tasks.map((row) => mapItem(row, "task", clients)),
      scripts: scripts.map((row) => mapItem(row, "script", clients)),
      content: content.map((row) => mapItem(row, "content", clients)),
      notes: notes.map((row) => mapItem({ ...row, title: truncate(String(row.text ?? "Nota"), 80), body: row.text, status: "saved" }, "note", clients)),
      meetings: meetings.map((row) => mapItem({ ...row, body: row.summary, status: "held", due_at: row.starts_at }, "meeting", clients)),
      metrics: [...instagramMetricRows, ...metricRows].map(normalizeRecord),
      campaigns: campaigns.map(normalizeRecord),
      memories: memoriesRaw.map(mapMemory),
      profile: mapProfile(profileRaw),
      recentMessages,
      lastReferencedEntity: conversationEntity ?? entityFromNotification(input.metadata) ?? lastEntityFromMessages(recentMessages),
      lastUndoToken: lastUndoTokenFromMessages(recentMessages),
      summary: currentClient ? `${currentClient.name}: ${currentClient.services?.join(", ")}` : "Vista global de Martu",
    };
  }

  async findEntity(input: Parameters<AgentMutationGateway["findEntity"]>[0]): Promise<ResolvedEntity | undefined> {
    const table = tableFor(input.type);
    const client = input.clientSlug ? await this.getClient(input.clientSlug) : undefined;
    if (input.type === "content" && client && !input.id && !input.ordinal && input.query) {
      const linkedRows = await query<Row>(`select ci.id, ci.client_id, ci.title as content_title,
          ci.status, ci.due_at, ci.updated_at, c.slug as client_slug, t.title
        from public.tasks t
        join public.content_items ci on ci.id = t.entity_id and t.entity_type = 'content'
        join public.clients c on c.id = ci.client_id
        where t.user_id = $1 and t.client_id = $2 and t.status not in ('completed','cancelled')
        order by case t.priority when 'urgent' then 4 when 'high' then 3 when 'medium' then 2 else 1 end desc,
          t.due_at nulls last`, [await martuUserId(), client.id]);
      const linked = bestTextMatch(linkedRows, input.query);
      if (linked) return mapResolved({ ...linked, title: linked.content_title }, "content");
    }
    const params: unknown[] = [];
    const where: string[] = [];
    if (input.id) {
      params.push(input.id);
      where.push(`e.id = $${params.length}`);
    }
    if (client) {
      params.push(client.id);
      where.push(`e.client_id = $${params.length}`);
    }
    if (input.type === "task") {
      params.push(await martuUserId());
      where.push(`e.user_id = $${params.length}`);
    }
    if (input.type === "task" || input.type === "content") where.push("e.archived_at is null");
    if (input.type === "script") where.push("e.status <> 'archived'");
    const rows = await query<Row>(`select e.id, e.client_id, e.title, e.status, e.due_at, e.updated_at,
        c.slug as client_slug, c.name as client_name
      from public.${table} e left join public.clients c on c.id = e.client_id
      ${where.length ? `where ${where.join(" and ")}` : ""}
      order by ${input.type === "script" ? "e.script_number nulls last," : ""} e.created_at asc limit 60`, params);
    if (!rows.length) return undefined;
    let row: Row | undefined;
    if (input.id) row = rows[0];
    else if (input.ordinal) row = rows[input.ordinal - 1];
    else row = bestTextMatch(rows, input.query) ?? (rows.length === 1 ? rows[0] : undefined);
    return row ? mapResolved(row, input.type) : undefined;
  }

  async createTask(input: Record<string, unknown>): Promise<ResolvedEntity> {
    const row = await createTask({
      clientSlug: optionalString(input.clientSlug),
      title: String(input.title),
      description: optionalString(input.description) ?? "",
      dueAt: optionalString(input.dueAt),
      priority: optionalString(input.priority) ?? "medium",
      source: optionalString(input.source) ?? "chat",
    });
    return mapResolved(row as Row, "task");
  }

  async completeEntity(entity: ResolvedEntity): Promise<ResolvedEntity> {
    if (entity.type === "task") {
      const updated = await updateWorkV1(entity.id, { status: "completed" });
      return domainResolved(updated as Row, entity);
    }
    if (entity.type === "content") {
      const updated = await updateContentV1(entity.id, { status: "delivered" });
      return domainResolved(updated as Row, entity);
    }
    const configuration = completeConfiguration(entity.type);
    const rows = await query<Row>(`update public.${configuration.table} set status = $2${configuration.extra}
      where id = $1 returning id, client_id, title, status, due_at, updated_at`, [entity.id, configuration.status]);
    if (entity.type === "commitment") {
      await query("update public.reminders set status = 'done' where commitment_id = $1 and status <> 'cancelled'", [entity.id]);
    }
    return mapResolved({ ...rows[0], client_slug: entity.clientSlug }, entity.type);
  }

  async rescheduleEntity(entity: ResolvedEntity, dueAt: string): Promise<ResolvedEntity> {
    if (entity.type === "task") {
      const updated = await updateWorkV1(entity.id, { dueAt, status: "pending" });
      return domainResolved(updated as Row, entity);
    }
    if (entity.type === "content") {
      const updated = await updateContentV1(entity.id, { dueAt });
      return domainResolved(updated as Row, entity);
    }
    const table = tableFor(entity.type as "task" | "script" | "content" | "commitment");
    const rows = await query<Row>(`update public.${table} set due_at = $2${entity.type === "commitment" ? ", status = 'open'" : ""}
      where id = $1 returning id, client_id, title, status, due_at, updated_at`, [entity.id, dueAt]);
    if (entity.type === "commitment") {
      await query(`update public.reminders set remind_at = $2, status = 'pending', next_followup_at = null
        where commitment_id = $1 and status in ('pending', 'sent', 'snoozed')`, [entity.id, dueAt]);
    }
    return mapResolved({ ...rows[0], client_slug: entity.clientSlug }, entity.type);
  }

  async createNote(input: Record<string, unknown>): Promise<ResolvedEntity> {
    const client = await requiredClient(optionalString(input.clientSlug));
    const rows = await query<Row>(`insert into public.notes (user_id, client_id, text, tags, source)
      values ($1, $2, $3, $4, $5) returning id, client_id, text as title, text as body, created_at as updated_at`, [
      await martuUserId(), client.id, String(input.body), input.tags ?? [], optionalString(input.source) ?? "chat",
    ]);
    await appendActivity({ clientId: client.id, type: "note_created", title: "Nota privada agregada", entityType: "note", entityId: String(rows[0].id), targetPath: `/clients/${client.slug}/notas` });
    return mapResolved({ ...rows[0], status: "saved", client_slug: client.slug }, "note");
  }

  async createIdea(input: Record<string, unknown>): Promise<ResolvedEntity> {
    const client = await requiredClient(optionalString(input.clientSlug));
    const rows = await query<Row>(`insert into public.ideas (client_id, title, description, origin, status, tags)
      values ($1, $2, $3, 'ai_chat', 'new', $4) returning id, client_id, title, status, updated_at`, [
      client.id, String(input.title), optionalString(input.description) ?? "", input.tags ?? [],
    ]);
    await appendActivity({ clientId: client.id, type: "idea_created", title: `Idea: ${String(input.title)}`, entityType: "idea", entityId: String(rows[0].id), targetPath: `/clients/${client.slug}/ideas` });
    return mapResolved({ ...rows[0], client_slug: client.slug }, "idea");
  }

  async createOpenLoop(input: Record<string, unknown>): Promise<ResolvedEntity> {
    const requestedSlug = optionalString(input.clientSlug);
    const client = requestedSlug ? await this.getClient(requestedSlug) : undefined;
    if (requestedSlug && !client) throw new Error(`No encontré el cliente ${requestedSlug}.`);
    const title = String(input.title).trim();
    const rows = await query<Row>(`insert into public.open_loops
        (user_id, client_id, kind, title, body, status, salience)
      values ($1, $2, $3, $4, $5, 'open', $6)
      returning id, client_id, title, status, created_at as updated_at`, [
      await martuUserId(), client?.id ?? null, optionalString(input.kind) ?? "topic", title,
      optionalString(input.body) ?? "", Number(input.salience ?? 3),
    ]);
    await appendActivity({
      clientId: client?.id,
      type: "open_loop_created",
      title: `Hilo abierto: ${title}`,
      entityType: "open_loop",
      entityId: String(rows[0].id),
      targetPath: client ? `/clients/${client.slug}?assistant=open` : "/supervisor",
    });
    return mapResolved({ ...rows[0], client_slug: client?.slug }, "open_loop");
  }

  async createScript(input: Record<string, unknown>): Promise<ResolvedEntity> {
    const row = await createScript({
      clientSlug: optionalString(input.clientSlug),
      title: String(input.title),
      format: optionalString(input.format) ?? "Reel",
      objective: optionalString(input.objective) ?? "",
      hook: optionalString(input.hook) ?? "",
      body: optionalString(input.body) ?? "",
      cta: optionalString(input.cta) ?? "",
      status: "draft",
    });
    return mapResolved(row as Row, "script");
  }

  async updateContentStatus(entity: ResolvedEntity, status: string): Promise<ResolvedEntity> {
    const allowed = ["idea", "script", "to_record", "recorded", "editing", "ready", "approval", "approved", "scheduled", "published", "delivered"];
    if (!allowed.includes(status)) throw new Error(`Estado de contenido inválido: ${status}`);
    const updated = await updateContentV1(entity.id, { status });
    return domainResolved(updated as Row, entity);
  }

  async createCommitment(input: Record<string, unknown>): Promise<ResolvedEntity> {
    const targetType = optionalString(input.targetType);
    const targetId = optionalString(input.targetId);
    if (targetType && targetId) {
      const foreignKey = ({ task: "task_id", script: "script_id", content: "content_item_id" } as const)[targetType as "task" | "script" | "content"];
      if (foreignKey) {
        const existing = await query<Row>(`select co.*, c.slug as client_slug from public.commitments co
          left join public.clients c on c.id = co.client_id
          where co.${foreignKey} = $1 and co.status = 'open' order by co.created_at desc limit 1`, [targetId]);
        if (existing[0]) {
          const updated = await query<Row>(`update public.commitments set intention = $2, due_at = $3, source = $4
            where id = $1 returning *`, [existing[0].id, String(input.intent), String(input.dueAt), optionalString(input.source) ?? "chat"]);
          return mapResolved({ ...updated[0], client_slug: existing[0].client_slug }, "commitment");
        }
      }
    }
    const row = await createCommitment({
      clientSlug: optionalString(input.clientSlug),
      title: commitmentTitle(String(input.intent)),
      intention: String(input.intent),
      dueAt: String(input.dueAt),
      source: optionalString(input.source) ?? "chat",
      taskId: targetType === "task" ? optionalString(input.targetId) : undefined,
      scriptId: targetType === "script" ? optionalString(input.targetId) : undefined,
      contentItemId: targetType === "content" ? optionalString(input.targetId) : undefined,
    });
    return mapResolved(row as Row, "commitment");
  }

  async createReminder(input: Record<string, unknown>): Promise<{ id: string }> {
    const existing = await query<Row>(`select id from public.reminders where commitment_id = $1
      and status in ('pending','sent','snoozed') order by created_at desc limit 1`, [String(input.commitmentId)]);
    if (existing[0]) {
      await query(`update public.reminders set remind_at = $2, status = 'pending', next_followup_at = null,
        target_path = $3 where id = $1`, [
        existing[0].id, String(input.remindAt), optionalString(input.clientSlug) ? `/clients/${String(input.clientSlug)}?assistant=open` : "/day?assistant=open",
      ]);
      return { id: String(existing[0].id) };
    }
    const row = await createReminder({
      clientSlug: optionalString(input.clientSlug),
      commitmentId: String(input.commitmentId),
      title: String(input.title),
      remindAt: String(input.remindAt),
      channel: "web_push",
      targetPath: optionalString(input.clientSlug) ? `/clients/${String(input.clientSlug)}?assistant=open` : "/day?assistant=open",
    });
    return { id: String(row.id) };
  }

  async saveMemory(input: Record<string, unknown>): Promise<{ id: string; content: string }> {
    const client = optionalString(input.clientSlug) ? await this.getClient(String(input.clientSlug)) : undefined;
    const row = await upsertMemory({
      clientId: input.scope === "client" ? client?.id : undefined,
      scope: String(input.scope) as "global" | "client",
      category: String(input.category),
      fact: String(input.content),
      importance: Math.max(1, Math.min(5, Math.round(Number(input.importance ?? 0.6) * 5))),
      source: optionalString(input.source) ?? "chat",
    });
    return { id: String(row.id), content: String(row.fact) };
  }

  async updateCommunicationProfile(input: Record<string, unknown>): Promise<void> {
    const preferences: string[] = [];
    if (input.preferenceKey) preferences.push(`${String(input.preferenceKey)}=${JSON.stringify(input.preferenceValue)}`);
    const currentProfile = preferences.length ? await getCommunicationProfile() : undefined;
    await updateCommunicationProfile({
      insistenceLevel: typeof input.insistenceLevel === "number" ? Math.max(1, Math.min(5, Math.round(input.insistenceLevel * 5))) : undefined,
      quietHoursStart: optionalString(input.quietHoursStart),
      quietHoursEnd: optionalString(input.quietHoursEnd),
      preferredLength: optionalString(input.preferredLength) as "short" | "medium" | "long" | undefined,
      explicitPreferences: preferences.length
        ? [...new Set([...(currentProfile?.explicitPreferences ?? []), ...preferences])].slice(-50)
        : undefined,
    });
  }

  async storeUndo(input: Parameters<AgentMutationGateway["storeUndo"]>[0]): Promise<string> {
    const event = await appendActivity({
      clientId: input.entity.clientId ?? undefined,
      actor: "Supervisora",
      type: "agent_action",
      title: input.context.source === "system" ? input.type : `Acción de Supervisora: ${input.type}`,
      description: input.entity.title,
      entityType: input.entity.type,
      entityId: input.entity.id,
      targetPath: input.entity.clientSlug ? `/clients/${input.entity.clientSlug}` : "/day",
      metadata: { undo: { type: input.type, before: input.before, after: input.after }, threadId: input.context.threadId },
    });
    return `activity:${String(event.id)}`;
  }

  async undo(token: string, context: Parameters<AgentMutationGateway["undo"]>[1]) {
    const match = token.match(/^activity:(\d+)$/);
    if (!match) return undefined;
    const rows = await query<Row>(`select * from public.activity_events where id = $1 and type = 'agent_action' limit 1`, [match[1]]);
    const event = rows[0];
    if (!event) return undefined;
    const metadata = asObject(event.metadata);
    if (metadata.undoneAt) return undefined;
    const undo = asObject(metadata.undo);
    const before = asObject(undo.before);
    const entityType = String(event.entity_type) as ResolvedEntity["type"];
    const entityId = String(event.entity_id);
    const table = tableFor(entityType as "task" | "script" | "content" | "commitment");
    if (undo.type === "reschedule") {
      if (entityType === "task") await updateWorkV1(entityId, { dueAt: optionalString(before.dueAt) ?? null });
      else if (entityType === "content") await updateContentV1(entityId, { dueAt: optionalString(before.dueAt) ?? null });
      else await query(`update public.${table} set due_at = $2 where id = $1`, [entityId, before.dueAt ?? null]);
      if (entityType === "commitment") {
        await query(`update public.reminders set remind_at = $2, status = 'pending'
          where commitment_id = $1 and status <> 'cancelled'`, [entityId, before.dueAt ?? new Date().toISOString()]);
      }
    } else if (undo.type === "complete" || undo.type === "content_status") {
      if (entityType === "task") await updateWorkV1(entityId, { status: String(before.status) });
      else if (entityType === "content") await updateContentV1(entityId, { status: String(before.status) });
      else {
        const resetTimestamp = entityType === "script" ? ", approved_at = null"
          : entityType === "commitment" ? ", completed_at = null"
            : "";
        await query(`update public.${table} set status = $2${resetTimestamp} where id = $1`, [entityId, before.status]);
      }
    } else return undefined;
    await query(`update public.activity_events set metadata = metadata || $2::jsonb where id = $1`, [match[1], JSON.stringify({ undoneAt: context.now.toISOString() })]);
    return { type: "undo", summary: `Deshice el cambio sobre “${String(event.description)}”.`, undoToken: undefined };
  }
}

async function martuUserId(signal?: AbortSignal): Promise<string> {
  return contextRead(signal, () => requireAppUserId());
}

async function requiredClient(slug?: string): Promise<ClientRef> {
  if (!slug) throw new Error("Falta indicar el cliente.");
  const client = (await loadClients()).find((item) => item.slug === slug);
  if (!client) throw new Error(`No encontré el cliente ${slug}.`);
  return client;
}

async function loadClients(signal?: AbortSignal): Promise<ClientRef[]> {
  const userId = await martuUserId(signal);
  const rows = await contextRead(signal, () => query<Row>(`select c.id, c.slug, c.name,
      coalesce(array_agg(s.slug order by s.sort_order) filter (where cs.is_active), '{}') as services
    from public.clients c
    left join public.client_services cs on cs.client_id = c.id
    left join public.services s on s.id = cs.service_id
    where c.user_id = $1 and c.status = 'active' and c.archived_at is null group by c.id order by c.name`, [userId]));
  return rows.map((row) => ({ id: String(row.id), slug: String(row.slug), name: String(row.name), services: toStringArray(row.services) }));
}

async function loadThreadScope(threadId: string, signal?: AbortSignal): Promise<{
  scope: "global" | "client";
  clientSlug?: string;
} | undefined> {
  const userId = await martuUserId(signal);
  const rows = await contextRead(signal, () => query<Row>(`select t.scope, c.slug as client_slug
    from public.chat_threads t join public.users u on u.id = t.user_id
    left join public.clients c on c.id = t.client_id
    where t.id = $1 and u.id = $2 limit 1`, [threadId, userId]));
  if (!rows[0]) return undefined;
  return {
    scope: rows[0].scope === "client" ? "client" : "global",
    clientSlug: optionalString(rows[0].client_slug),
  };
}

const CURRENT_VIEW_QUERIES: Record<AgentEntityRef["type"], {
  table: string;
  title: string;
  status: string;
  dueAt: string;
  body: string;
  userOwned?: boolean;
}> = {
  task: { table: "tasks", title: "e.title", status: "e.status", dueAt: "e.due_at", body: "e.description", userOwned: true },
  script: { table: "scripts", title: "e.title", status: "e.status", dueAt: "e.due_at", body: "concat_ws(E'\\n', e.objective, e.hook, e.body, e.cta)" },
  content: { table: "content_items", title: "e.title", status: "e.status", dueAt: "e.due_at", body: "e.caption" },
  commitment: { table: "commitments", title: "e.title", status: "e.status", dueAt: "e.due_at", body: "e.intention", userOwned: true },
  note: { table: "notes", title: "left(e.text, 80)", status: "'saved'::text", dueAt: "null::timestamptz", body: "e.text", userOwned: true },
  idea: { table: "ideas", title: "e.title", status: "e.status", dueAt: "null::timestamptz", body: "e.description" },
  open_loop: { table: "open_loops", title: "e.title", status: "e.status", dueAt: "e.next_eligible_at", body: "e.body", userOwned: true },
  meeting: { table: "meetings", title: "e.title", status: "'held'::text", dueAt: "e.starts_at", body: "e.summary" },
};

async function loadCurrentViewItem(input: {
  view?: AgentRequest["currentView"];
  clients: ClientRef[];
  conversationScope: "global" | "client";
  conversationClient?: ClientRef;
  clientOverride?: string;
  userId: string;
  signal?: AbortSignal;
}): Promise<AgentContextItem | undefined> {
  const view = input.view;
  if (!view?.entityType || !view.entityId || !/^\d+$/.test(view.entityId)) return undefined;
  const viewClient = view.clientSlug
    ? input.clients.find((client) => client.slug === view.clientSlug)
    : undefined;
  if (view.clientSlug && !viewClient) return undefined;
  const overrideClient = input.clientOverride
    ? input.clients.find((client) => client.slug === input.clientOverride)
    : undefined;
  const withinFixedScope = input.conversationScope === "global"
    || !view.clientSlug
    || view.clientSlug === input.conversationClient?.slug
    || view.clientSlug === overrideClient?.slug;
  if (!withinFixedScope) return undefined;

  const targetClient = viewClient ?? overrideClient ?? input.conversationClient;
  const configuration = CURRENT_VIEW_QUERIES[view.entityType];
  const params: unknown[] = [view.entityId, input.userId];
  const ownership = configuration.userOwned
    ? "e.user_id = $2"
    : "e.client_id in (select id from public.clients where user_id = $2)";
  let clientClause = "";
  if (targetClient) {
    params.push(targetClient.id);
    clientClause = "and e.client_id = $3";
  }
  const rows = await contextRead(input.signal, () => query<Row>(`select e.id, e.client_id,
      ${configuration.title} as title, ${configuration.status} as status,
      ${configuration.dueAt} as due_at, e.updated_at, ${configuration.body} as body
    from public.${configuration.table} e
    where e.id = $1 and ${ownership} ${clientClause} limit 1`, params));
  return rows[0] ? mapItem(rows[0], view.entityType, input.clients) : undefined;
}

function canonicalCurrentView(
  view: AgentRequest["currentView"],
  item: AgentContextItem | undefined,
  clients: ClientRef[],
): AgentRequest["currentView"] {
  if (!view) return undefined;
  const client = clients.find((candidate) => candidate.slug === (item?.clientSlug ?? view.clientSlug));
  return {
    ...view,
    clientId: item?.clientId ?? view.clientId,
    clientSlug: item?.clientSlug ?? view.clientSlug,
    clientName: client?.name ?? view.clientName,
    entityType: item?.type ?? view.entityType,
    entityId: item?.id ?? view.entityId,
    entityTitle: item?.title ?? view.entityTitle,
  };
}

async function contextRead<T>(
  signal: AbortSignal | undefined,
  read: () => Promise<T>,
): Promise<T> {
  signal?.throwIfAborted();
  const result = await read();
  signal?.throwIfAborted();
  return result;
}

function mapItem(row: Row, type: AgentContextItem["type"], clients: ClientRef[]): AgentContextItem {
  const clientId = row.client_id == null ? null : String(row.client_id);
  const client = clients.find((item) => item.id === clientId);
  return {
    id: String(row.id), type, title: String(row.title ?? "Sin título"),
    clientId, clientSlug: client?.slug ?? null, status: optionalString(row.status),
    dueAt: iso(row.due_at), updatedAt: iso(row.updated_at), body: optionalString(row.body ?? row.description),
    metadata: normalizeRecord(row),
  };
}

function mapResolved(row: Row, type: ResolvedEntity["type"]): ResolvedEntity {
  return {
    id: String(row.id), type, title: String(row.title ?? "Sin título"),
    clientId: row.client_id == null ? null : String(row.client_id), clientSlug: optionalString(row.client_slug),
    status: optionalString(row.status), dueAt: iso(row.due_at), metadata: normalizeRecord(row),
  };
}

function domainResolved(row: Row, fallback: ResolvedEntity): ResolvedEntity {
  return {
    ...fallback,
    id: String(row.id ?? fallback.id),
    title: String(row.title ?? fallback.title),
    clientId:
      row.clientId == null ? fallback.clientId : String(row.clientId),
    clientSlug: optionalString(row.clientSlug) ?? fallback.clientSlug,
    status:
      optionalString(row.workflowStateLabel ?? row.status) ?? fallback.status,
    dueAt: iso(row.dueAt) ?? fallback.dueAt,
    metadata: normalizeRecord(row),
  };
}

function mapMemory(row: DataMemory): AgentMemory {
  return { id: row.id, scope: row.scope, category: row.category, content: row.fact, importance: row.importance / 5, clientId: row.clientId ?? null };
}

function mapChatMessage(row: DataChatMessage): RecentChatMessage {
  return { id: row.id, role: row.role, content: row.content, createdAt: row.createdAt, metadata: row.actionResult ?? row.toolPayload ?? {} };
}

function mapProfile(row: DataCommunicationProfile | undefined): CommunicationProfile {
  return {
    language: row?.language ?? "es-AR", formality: row?.formality ?? 2, preferredLength: row?.preferredLength ?? "short",
    humor: row?.humor ?? 3, insistenceLevel: row?.insistenceLevel ?? 3,
    quietHoursStart: row?.quietHoursStart?.slice(0, 5) ?? "22:30", quietHoursEnd: row?.quietHoursEnd?.slice(0, 5) ?? "08:30",
    morningBriefingAt: row?.morningBriefingAt?.slice(0, 5) ?? "09:00", morningBriefingEnabled: row?.morningBriefingEnabled ?? true,
    middayCheckAt: row?.middayCheckAt?.slice(0, 5) ?? "13:30", middayCheckEnabled: row?.middayCheckEnabled ?? true,
    endOfDayAt: row?.endOfDayAt?.slice(0, 5) ?? null, endOfDayEnabled: row?.endOfDayEnabled ?? false,
    expressions: row?.expressions ?? ["che", "dale"], preferences: { explicit: row?.explicitPreferences ?? [], minorTaskLeadHours: row?.minorTaskLeadHours ?? 24 },
  };
}

function lastEntityFromMessages(messages: RecentChatMessage[]) {
  for (const message of [...messages].reverse()) {
    const actions = message.metadata?.actions;
    if (!Array.isArray(actions)) continue;
    const entity = asObject(asObject(actions[0]).entity);
    if (entity.id && entity.type && entity.title) return entity as unknown as AgentContext["lastReferencedEntity"];
  }
  return undefined;
}

function conversationEntityFromMessages(messages: RecentChatMessage[]): AgentEntityRef | undefined {
  for (const message of messages) {
    const entity = asObject(message.metadata?.conversationContext);
    const type = String(entity.type ?? "");
    if (!entity.id || !entity.title || !Object.hasOwn(CURRENT_VIEW_QUERIES, type)) continue;
    return {
      id: String(entity.id),
      type: type as AgentEntityRef["type"],
      title: String(entity.title),
      clientId: entity.clientId == null ? undefined : String(entity.clientId),
      clientSlug: entity.clientSlug == null ? undefined : String(entity.clientSlug),
    };
  }
  return undefined;
}

function entityWithinConversationScope(
  entity: AgentEntityRef | undefined,
  scope: "global" | "client",
  client: ClientRef | undefined,
): boolean {
  if (!entity || scope === "global") return true;
  return !entity.clientSlug || entity.clientSlug === client?.slug;
}

function lastUndoTokenFromMessages(messages: RecentChatMessage[]): string | undefined {
  for (const message of [...messages].reverse()) {
    const actions = message.metadata?.actions;
    if (!Array.isArray(actions)) continue;
    for (const action of actions) {
      const token = asObject(action).undoToken;
      if (typeof token === "string" && token) return token;
    }
  }
  return undefined;
}

function entityFromNotification(metadata?: Record<string, unknown>): AgentContext["lastReferencedEntity"] {
  const context = asObject(metadata?.notificationContext);
  const type = String(context.entityType ?? "");
  if (!context.entityId || !context.title || !["task", "script", "content", "commitment"].includes(type)) return undefined;
  return {
    id: String(context.entityId),
    type: type as "task" | "script" | "content" | "commitment",
    title: String(context.title),
    clientSlug: context.clientSlug ? String(context.clientSlug) : undefined,
  };
}

function tableFor(type: "task" | "script" | "content" | "commitment"): string {
  return ({ task: "tasks", script: "scripts", content: "content_items", commitment: "commitments" })[type];
}

function completeConfiguration(type: ResolvedEntity["type"]) {
  if (type === "task") return { table: "tasks", status: "completed", extra: ", completed_at = now()" };
  if (type === "script") return { table: "scripts", status: "approved", extra: ", approved_at = now()" };
  if (type === "content") return { table: "content_items", status: "delivered", extra: ", delivered_at = now(), status_changed_at = now()" };
  if (type === "commitment") return { table: "commitments", status: "done", extra: ", completed_at = now()" };
  throw new Error("Ese elemento no se puede completar.");
}

function bestTextMatch(rows: Row[], queryText?: string): Row | undefined {
  if (!queryText) return undefined;
  const tokens = normalize(queryText).split(" ").filter((token) => token.length >= 4 && !STOPWORDS.has(token));
  const scored = rows.map((row) => ({ row, score: tokens.filter((token) => normalize(String(row.title)).includes(token)).length }));
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.score ? scored[0].row : undefined;
}

const STOPWORDS = new Set(["pasa", "pasalo", "manana", "viernes", "guion", "tarea", "gavilan", "luma", "termino", "cerrar"]);
function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function optionalString(value: unknown): string | undefined { return value == null || String(value).trim() === "" ? undefined : String(value); }
function iso(value: unknown): string | null { if (!value) return null; const date = value instanceof Date ? value : new Date(String(value)); return Number.isNaN(date.getTime()) ? String(value) : date.toISOString(); }
function asObject(value: unknown): Record<string, unknown> { if (typeof value === "string") { try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; } } return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function normalizeRecord(row: Row): Record<string, unknown> { return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value])); }
function toStringArray(value: unknown): string[] { return Array.isArray(value) ? value.map(String) : typeof value === "string" ? value.replace(/^\{|\}$/g, "").split(",").filter(Boolean) : []; }
function truncate(value: string, length: number) { return value.length <= length ? value : `${value.slice(0, length - 1)}…`; }
function commitmentTitle(intent: string) {
  const clean = intent
    .replace(/^(?:mañana|hoy)\s+(?:voy a\s+)?/i, "")
    .replace(/^termino\b/i, "Terminar")
    .replace(/^cierro\b/i, "Cerrar")
    .replace(/^completo\b/i, "Completar")
    .replace(/^edito\b/i, "Editar")
    .replace(/^hago\b/i, "Hacer")
    .replace(/[.!]+$/, "");
  return truncate(clean.charAt(0).toUpperCase() + clean.slice(1), 120);
}
function modeFromMetadata(metadata?: Record<string, unknown>) { const mode = metadata?.capability; return ["supervisor", "strategist", "creative", "analyst"].includes(String(mode)) ? mode as "supervisor" | "strategist" | "creative" | "analyst" : "supervisor"; }
