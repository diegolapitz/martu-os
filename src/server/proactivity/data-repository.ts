import "server-only";

import { randomUUID } from "node:crypto";

import {
  appendChatMessage,
  getCommunicationProfile,
  getOrCreateChatThread,
  query,
  transaction,
  type CommunicationProfile as DataCommunicationProfile,
} from "@/server/data";

import type { CommunicationProfile } from "@/server/agent/types";

import type { NudgeActionGateway } from "./action-service";
import type { ProactivityRepository } from "./ports";
import type {
  ComposedNudge,
  NudgeCandidate,
  PersistedNudge,
  ProactivitySnapshot,
  ProactivityWorkItem,
} from "./types";
import { humanizeNotificationCopy } from "./copy";

type Row = Record<string, unknown>;
const DELIVERY_LEASE_MS = 2 * 60_000;
const DELIVERY_LEASE_RESOURCE = "proactivity_delivery";

export class MartuProactivityDataRepository
  implements ProactivityRepository, NudgeActionGateway
{
  async listForCenter(
    options: { status?: string; limit?: number } = {},
  ): Promise<PersistedNudge[]> {
    const params: unknown[] = [await martuUserId()];
    const where = [
      "n.user_id = $1",
      "n.lifecycle_state in ('active','snoozed')",
      "(n.snoozed_until is null or n.snoozed_until <= now())",
    ];
    if (options.status) {
      params.push(options.status === "read" ? "seen" : options.status);
      where.push(`n.status = $${params.length}`);
    } else {
      where.push("n.status in ('delivered', 'seen')");
    }
    params.push(Math.min(100, Math.max(1, options.limit ?? 30)));
    const rows = await query<Row>(
      `select n.*, c.slug as client_slug, c.name as client_name,
      co.title as commitment_title from public.ai_nudges n
      left join public.clients c on c.id = n.client_id
      left join public.commitments co on co.id = n.commitment_id where ${where.join(" and ")}
      order by n.created_at desc limit $${params.length}`,
      params,
    );
    return rows.map(mapNudge);
  }

  async markSeen(id: string): Promise<void> {
    await query(
      `update public.ai_nudges set status = 'seen', seen_at = now()
      where id = $1 and user_id = $2 and status = 'delivered'`,
      [id, await martuUserId()],
    );
  }

  async getSnapshot(now: Date): Promise<ProactivitySnapshot> {
    const userId = await martuUserId();
    // Vercel keeps one postgres.js connection per warm runtime. Sequential
    // snapshot reads avoid filling that single queue with leases: if one read
    // times out, the DB layer can retire its generation immediately and the
    // scheduler fails fast instead of blocking every request for 60 seconds.
    const clients = await query<Row>(
        `select c.id, c.slug, c.name,
          coalesce(array_agg(s.slug order by s.sort_order) filter (where cs.is_active), '{}') as services,
          exists(select 1 from public.briefs b where b.client_id = c.id and b.status = 'complete') as has_brief,
          exists(select 1 from public.strategies st where st.client_id = c.id and st.status = 'active') as has_strategy
        from public.clients c
        left join public.client_services cs on cs.client_id = c.id
        left join public.services s on s.id = cs.service_id
        where c.user_id = $1 and c.status = 'active' and c.archived_at is null group by c.id order by c.name`,
        [userId],
      );
    const tasks = await query<Row>(
        `select t.*, c.slug as client_slug, c.name as client_name from public.tasks t
        left join public.clients c on c.id = t.client_id where t.user_id = $1
        and t.archived_at is null and (t.client_id is null or c.archived_at is null)
        and t.status not in ('completed','cancelled') order by t.due_at nulls last limit 100`,
        [userId],
      );
    const commitments = await query<Row>(
        `select co.*, c.slug as client_slug, c.name as client_name from public.commitments co
        left join public.clients c on c.id = co.client_id where co.user_id = $1
        and (co.client_id is null or c.archived_at is null) and co.status = 'open'
        order by co.due_at limit 100`,
        [userId],
      );
    const reminders = await query<Row>(
        `select r.*, c.slug as client_slug, c.name as client_name from public.reminders r
        left join public.clients c on c.id = r.client_id where r.user_id = $1
        and (r.client_id is null or c.archived_at is null) and r.status in ('pending','snoozed')
        order by r.remind_at limit 100`,
        [userId],
      );
    const content = await query<Row>(
        `select ci.*, c.slug as client_slug, c.name as client_name from public.content_items ci
        join public.clients c on c.id = ci.client_id
        left join public.content_workflow_states ws on ws.id = ci.workflow_state_id where c.user_id = $1
        and ci.archived_at is null and c.archived_at is null
        and ws.terminal_kind is null and ci.status not in ('published','delivered')
        order by ci.status_changed_at limit 100`,
        [userId],
      );
    const meetingActions = await query<Row>(
        `select t.*, c.slug as client_slug, c.name as client_name from public.tasks t
        left join public.clients c on c.id = t.client_id where t.user_id = $1 and t.source = 'meeting'
        and t.archived_at is null and (t.client_id is null or c.archived_at is null)
        and t.status not in ('completed','cancelled') order by t.due_at nulls last limit 50`,
        [userId],
      );
    const opportunities = await query<Row>(
        `select cm.id, ci.client_id, c.slug as client_slug, c.name as client_name, ci.title,
          cm.retention_rate, cm.saves, cm.shares, cm.views
        from public.content_metrics cm join public.content_items ci on ci.id = cm.content_item_id
        join public.clients c on c.id = ci.client_id
        where c.user_id = $1 and c.archived_at is null and ci.archived_at is null
          and cm.retention_rate >= 0.58
        order by cm.captured_at desc limit 5`,
        [userId],
      );
    const openLoops = await query<Row>(
        `select ol.*, c.slug as client_slug, c.name as client_name
        from public.open_loops ol
        left join public.clients c on c.id = ol.client_id
        where ol.user_id = $1 and ol.status = 'open' and ol.archived_at is null
          and ol.salience >= 3 and ol.surface_count < 3
          and (ol.client_id is null or c.archived_at is null)
          and (ol.next_eligible_at is null or ol.next_eligible_at <= $2)
        order by ol.salience desc, coalesce(ol.last_surfaced_at,ol.created_at) asc
        limit 20`,
        [userId, now.toISOString()],
      );
    const nudges = await query<Row>(
        `select id, dedupe_key, status, delivered_at as last_delivered_at, created_at
        from public.ai_nudges where user_id = $1 and created_at >= $2 order by created_at desc`,
        [userId, new Date(now.getTime() - 30 * 24 * 60 * 60_000).toISOString()],
      );
    const profile = await getCommunicationProfile();

    return {
      now: now.toISOString(),
      clients: clients.map((row) => ({
        id: String(row.id),
        slug: String(row.slug),
        name: String(row.name),
        services: toStringArray(row.services),
        hasBrief: Boolean(row.has_brief),
        hasStrategy: Boolean(row.has_strategy),
      })),
      tasks: tasks.map((row) => mapWork(row)),
      commitments: commitments.map((row) => mapWork(row)),
      reminders: reminders.map((row) =>
        mapWork({
          ...row,
          target_type:
            row.commitment_id != null
              ? "commitment"
              : row.task_id != null
                ? "task"
                : "reminder",
          target_id: row.commitment_id ?? row.task_id ?? row.id,
        }),
      ),
      content: content.map((row) =>
        mapWork({
          ...row,
          updated_at: row.status_changed_at ?? row.updated_at,
        }),
      ),
      meetingActions: meetingActions.map((row) => mapWork(row)),
      metricOpportunities: opportunities.map((row) => ({
        id: String(row.id),
        clientId: String(row.client_id),
        clientSlug: String(row.client_slug),
        clientName: String(row.client_name),
        title: `Repetir el patrón de “${String(row.title)}”`,
        evidence: `retención ${Math.round(Number(row.retention_rate) * 100)}%, ${Number(row.saves)} guardados y ${Number(row.shares)} compartidos`,
        deepLink: `/clients/${String(row.client_slug)}/metricas?assistant=open`,
      })),
      openLoops: openLoops.map((row) => ({
        id: String(row.id),
        clientId: row.client_id == null ? null : String(row.client_id),
        clientSlug: stringOrNull(row.client_slug),
        clientName: stringOrNull(row.client_name),
        title: String(row.title),
        body: stringOrNull(row.body),
        kind: String(row.kind),
        salience: Number(row.salience),
        surfaceCount: Number(row.surface_count ?? 0),
        nextEligibleAt: iso(row.next_eligible_at),
        lastSurfacedAt: iso(row.last_surfaced_at),
        createdAt: iso(row.created_at) ?? now.toISOString(),
        updatedAt: iso(row.updated_at) ?? now.toISOString(),
      })),
      existingNudges: nudges.map((row) => ({
        id: String(row.id),
        dedupeKey: String(row.dedupe_key),
        status: status(row.status),
        lastDeliveredAt: iso(row.last_delivered_at),
        createdAt: iso(row.created_at) ?? now.toISOString(),
      })),
      profile: mapProfile(profile),
    };
  }

  async claimCandidate(
    candidate: NudgeCandidate,
    now: Date,
  ): Promise<PersistedNudge | undefined> {
    const userId = await martuUserId();
    const suppressions = await query<Row>(
      `select id from public.notification_suppressions
      where user_id = $1 and (suppressed_until is null or suppressed_until > $2)
        and (
          scope = 'global'
          or (scope = 'client' and client_id = $3)
          or (scope = 'kind' and kind = $4 and (client_id is null or client_id = $3))
        )
      limit 1`,
      [userId, now.toISOString(), candidate.clientId ?? null, candidate.kind],
    );
    if (suppressions.length) return undefined;
    const existing = await query<Row>(
      `select id, status, cooldown_until from public.ai_nudges
      where user_id = $1 and dedupe_key = $2 order by created_at desc limit 1`,
      [userId, candidate.dedupeKey],
    );
    if (existing[0]) {
      const existingStatus = String(existing[0].status);
      const cooldownUntil = iso(existing[0].cooldown_until);
      if (
        existingStatus === "dismissed" ||
        existingStatus === "pending" ||
        existingStatus === "delivered" ||
        (cooldownUntil && new Date(cooldownUntil) > now)
      )
        return undefined;
      // The partial unique index intentionally covers seen nudges. Expire a
      // cooled-down copy before creating the next supervision cycle.
      if (existingStatus === "seen") {
        await query(
          "update public.ai_nudges set status = 'expired' where id = $1",
          [existing[0].id],
        );
      }
    }
    const semanticTarget = await this.findPendingForSameTarget(
      candidate,
      userId,
      now,
    );
    if (semanticTarget) return undefined;
    const taskId = candidate.entityType === "task" ? candidate.entityId : null;
    const commitmentId =
      candidate.entityType === "commitment" ? candidate.entityId : null;
    const reminderId =
      candidate.kind === "reminder_due"
        ? String(
            candidate.facts.reminderId ??
              (candidate.entityType === "reminder" ? candidate.entityId : ""),
          ) || null
        : null;
    const rows = await query<Row>(
      `insert into public.ai_nudges
      (user_id, client_id, task_id, commitment_id, reminder_id, kind, severity, title, message, status,
       dedupe_key, deliver_after, cooldown_until, target_path, quick_actions, metadata)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',$10,$11,$12,$13,$14::jsonb,$15::jsonb)
      on conflict do nothing returning *`,
      [
        userId,
        candidate.clientId ?? null,
        taskId,
        commitmentId,
        reminderId,
        candidate.kind,
        candidate.priority,
        candidate.title,
        candidate.title,
        candidate.dedupeKey,
        now.toISOString(),
        new Date(
          now.getTime() + candidate.cooldownMinutes * 60_000,
        ).toISOString(),
        candidate.deepLink,
        JSON.stringify(candidate.quickActions),
        JSON.stringify({
          ...candidate.facts,
          entityType: candidate.entityType,
          entityId: candidate.entityId,
          clientSlug: candidate.clientSlug,
          dueAt: candidate.dueAt,
        }),
      ],
    );
    return rows[0] ? mapNudge(rows[0]) : undefined;
  }

  private async findPendingForSameTarget(
    candidate: NudgeCandidate,
    userId: string,
    now: Date,
  ): Promise<boolean> {
    if (!candidate.entityId) return false;
    const target = String(candidate.entityId);
    let expression: string;
    if (candidate.entityType === "task") expression = "n.task_id = $4";
    else if (candidate.entityType === "commitment")
      expression = "n.commitment_id = $4";
    else if (candidate.entityType === "content")
      expression =
        "n.metadata ->> 'entityType' = 'content' and n.metadata ->> 'entityId' = $4";
    else if (candidate.entityType === "open_loop")
      expression =
        "n.metadata ->> 'entityType' = 'open_loop' and n.metadata ->> 'entityId' = $4";
    else if (candidate.entityType === "reminder")
      expression = "n.reminder_id = $4";
    else return false;
    const rows = await query<Row>(
      `select n.id from public.ai_nudges n
      where n.user_id = $1 and n.dedupe_key <> $2
      and n.lifecycle_state in ('active','snoozed')
      and (
        n.status = 'pending'
        or (n.status in ('delivered', 'seen') and n.cooldown_until > $3)
      )
      and ($5::text <> 'reminder_due' or n.kind = 'reminder_due')
      and (${expression}) limit 1`,
      [userId, candidate.dedupeKey, now.toISOString(), target, candidate.kind],
    );
    return rows.length > 0;
  }

  async listPendingForDelivery(
    now: Date,
    limit: number,
  ): Promise<PersistedNudge[]> {
    const userId = await martuUserId();
    await this.expireStalePending(userId, now);
    const rows = await query<Row>(
      `select n.*, c.slug as client_slug, c.name as client_name,
      co.title as commitment_title from public.ai_nudges n
      left join public.clients c on c.id = n.client_id
      left join public.commitments co on co.id = n.commitment_id
       where n.user_id = $1 and n.status = 'pending' and n.deliver_after <= $2
       and n.lifecycle_state in ('active','snoozed')
       and (n.snoozed_until is null or n.snoozed_until <= $2)
      and (${VALID_PENDING_NUDGE_SQL})
      and coalesce(n.metadata ->> 'deliveryLeaseUntil', '') <= $2::text
      order by case n.severity when 'urgent' then 4 when 'high' then 3 when 'medium' then 2 else 1 end desc,
      n.deliver_after asc limit $3`,
      [userId, now.toISOString(), limit],
    );
    return rows.map(mapNudge);
  }

  async claimPendingForDelivery(
    now: Date,
    limit: number,
  ): Promise<PersistedNudge[]> {
    const userId = await martuUserId();
    await this.expireStalePending(userId, now);
    const leaseToken = randomUUID();
    const leaseUntil = new Date(
      now.getTime() + DELIVERY_LEASE_MS,
    ).toISOString();
    const rows = await transaction(async (tx) => {
      const globalLease = await tx.query<Row>(
        `insert into public.scheduler_leases
        (user_id, resource, owner_token, lease_until, updated_at)
        values ($1,$2,$3,$4,$5)
        on conflict (user_id, resource) do update set
          owner_token = excluded.owner_token,
          lease_until = excluded.lease_until,
          updated_at = excluded.updated_at
        where public.scheduler_leases.lease_until <= $5
        returning owner_token`,
        [
          userId,
          DELIVERY_LEASE_RESOURCE,
          leaseToken,
          leaseUntil,
          now.toISOString(),
        ],
      );
      if (!globalLease[0]) return [];

      const claimed = await tx.query<Row>(
        `with eligible as materialized (
          select n.id from public.ai_nudges n
          where n.user_id = $1 and n.status = 'pending' and n.deliver_after <= $2
          and n.lifecycle_state in ('active','snoozed')
          and (n.snoozed_until is null or n.snoozed_until <= $2)
          and (${VALID_PENDING_NUDGE_SQL})
          and coalesce(n.metadata ->> 'deliveryLeaseUntil', '') <= $2::text
          and not exists (
            select 1 from public.ai_nudges recent_delivery
            where recent_delivery.user_id = n.user_id and recent_delivery.delivered_at is not null
              and recent_delivery.delivered_at > $2::timestamptz - case
                when n.severity = 'urgent' then interval '5 minutes'
                else interval '15 minutes'
              end
          )
          order by case n.severity when 'urgent' then 4 when 'high' then 3 when 'medium' then 2 else 1 end desc,
            n.deliver_after asc
          for update skip locked
          limit $3
        ), leased as (
          update public.ai_nudges n set lifecycle_state = 'active', snoozed_until = null, metadata =
            (n.metadata - 'deliveryLeaseToken' - 'deliveryLeaseUntil') ||
            jsonb_build_object('deliveryLeaseToken', $4::text, 'deliveryLeaseUntil', $5::text)
          from eligible where n.id = eligible.id and n.status = 'pending'
            and coalesce(n.metadata ->> 'deliveryLeaseUntil', '') <= $2::text
          returning n.*
        )
        select leased.*, c.slug as client_slug, c.name as client_name,
          co.title as commitment_title from leased
        left join public.clients c on c.id = leased.client_id
        left join public.commitments co on co.id = leased.commitment_id`,
        [
          userId,
          now.toISOString(),
          Math.min(10, Math.max(1, limit)),
          leaseToken,
          leaseUntil,
        ],
      );
      if (claimed.length === 0) {
        await tx.query(
          `delete from public.scheduler_leases
          where user_id = $1 and resource = $2 and owner_token = $3`,
          [userId, DELIVERY_LEASE_RESOURCE, leaseToken],
        );
      }
      return claimed;
    });
    return rows.map(mapNudge);
  }

  async saveComposedMessage(
    nudgeId: string,
    leaseToken: string,
    message: string,
    now: Date,
  ): Promise<boolean> {
    const userId = await martuUserId();
    return transaction(async (tx) => {
      const rows = await tx.query<Row>(
        `update public.ai_nudges n set message = $5
        where n.user_id = $1 and n.id = $3 and n.status = 'pending'
          and n.metadata ->> 'deliveryLeaseToken' = $4
          and (${VALID_PENDING_NUDGE_SQL})
        returning id`,
        [userId, now.toISOString(), nudgeId, leaseToken, message],
      );
      if (rows[0]) return true;

      // If the target changed while composition was running, retire the stale
      // notification and release both leases without recording a delivery failure.
      await tx.query(
        `update public.ai_nudges set status = 'expired', lifecycle_state = 'resolved',
        resolved_at = now(), resolution_reason = 'target_changed_before_delivery',
        metadata = (metadata - 'deliveryLeaseToken' - 'deliveryLeaseUntil') ||
          jsonb_build_object('expiredReason', 'target_changed_before_delivery', 'expiredAt', $3::text)
        where id = $1 and user_id = $4 and status = 'pending'
          and metadata ->> 'deliveryLeaseToken' = $2`,
        [nudgeId, leaseToken, now.toISOString(), userId],
      );
      await tx.query(
        `delete from public.scheduler_leases
        where user_id = $1 and resource = $2 and owner_token = $3`,
        [userId, DELIVERY_LEASE_RESOURCE, leaseToken],
      );
      return false;
    });
  }

  async releaseDeliveryLease(
    nudgeId: string,
    leaseToken: string,
  ): Promise<boolean> {
    const userId = await martuUserId();
    return transaction(async (tx) => {
      const rows = await tx.query<Row>(
        `update public.ai_nudges set
        metadata = metadata - 'deliveryLeaseToken' - 'deliveryLeaseUntil'
        where id = $1 and user_id = $3 and status = 'pending' and metadata ->> 'deliveryLeaseToken' = $2
        returning id`,
        [nudgeId, leaseToken, userId],
      );
      await tx.query(
        `delete from public.scheduler_leases
        where user_id = $1 and resource = $2 and owner_token = $3`,
        [userId, DELIVERY_LEASE_RESOURCE, leaseToken],
      );
      return rows.length === 1;
    });
  }

  async markDelivered(
    nudgeId: string,
    leaseToken: string,
    deliveredAt: Date,
    delivery: Record<string, unknown>,
  ): Promise<boolean> {
    const userId = await martuUserId();
    return transaction(async (tx) => {
      const rows = await tx.query<Row>(
        `update public.ai_nudges set status = 'delivered', lifecycle_state = 'active',
        snoozed_until = null, delivered_at = $3,
        metadata = (metadata - 'deliveryLeaseToken' - 'deliveryLeaseUntil') || $4::jsonb
        where id = $1 and user_id = $5 and status = 'pending' and metadata ->> 'deliveryLeaseToken' = $2
        returning reminder_id, kind, metadata`,
        [
          nudgeId,
          leaseToken,
          deliveredAt.toISOString(),
          JSON.stringify({ delivery }),
          userId,
        ],
      );
      if (rows[0]?.reminder_id != null) {
        // A reminder can have one explicit follow-up. Advancing it in the same
        // transaction prevents a sent push from being reopened by a partial DB failure.
        await tx.query(
          `update public.reminders set last_triggered_at = $2,
          status = case when next_followup_at is null then 'sent' else 'pending' end,
          remind_at = coalesce(next_followup_at, remind_at), next_followup_at = null
          where id = $1 and user_id = $3 and status in ('pending', 'snoozed')
            and remind_at <= $2`,
          [rows[0].reminder_id, deliveredAt.toISOString(), userId],
        );
      }
      if (String(rows[0]?.kind ?? "") === "open_loop_resurface") {
        const metadata = asObject(rows[0]?.metadata);
        const openLoopId = stringOrNull(metadata.entityId);
        const surfaceCount = Math.max(0, Number(metadata.surfaceCount ?? 0));
        const cooldownDays = 14 * 2 ** Math.min(surfaceCount, 2);
        if (openLoopId) {
          await tx.query(
            `update public.open_loops set
              last_surfaced_at = $2,
              surface_count = surface_count + 1,
              next_eligible_at = greatest(
                coalesce(next_eligible_at,$2::timestamptz),
                $2::timestamptz + $3::integer * interval '1 day'
              )
            where id = $1 and user_id = $4 and status = 'open' and archived_at is null`,
            [openLoopId, deliveredAt.toISOString(), cooldownDays, userId],
          );
        }
      }
      await tx.query(
        `delete from public.scheduler_leases
        where user_id = $1 and resource = $2 and owner_token = $3`,
        [userId, DELIVERY_LEASE_RESOURCE, leaseToken],
      );
      return Boolean(rows[0]);
    });
  }

  async markFailed(
    nudgeId: string,
    leaseToken: string,
    error: string,
    retryAt: Date,
  ): Promise<boolean> {
    const userId = await martuUserId();
    return transaction(async (tx) => {
      const rows = await tx.query<Row>(
        `update public.ai_nudges set
        status = case when coalesce((metadata ->> 'deliveryFailures')::integer, 0) + 1 >= 3
          then 'dismissed' else 'pending' end,
        lifecycle_state = case when coalesce((metadata ->> 'deliveryFailures')::integer, 0) + 1 >= 3
          then 'dismissed' else lifecycle_state end,
        dismissed_at = case when coalesce((metadata ->> 'deliveryFailures')::integer, 0) + 1 >= 3
          then now() else dismissed_at end,
        resolution_reason = case when coalesce((metadata ->> 'deliveryFailures')::integer, 0) + 1 >= 3
          then 'delivery_failed' else resolution_reason end,
        deliver_after = $3,
        metadata = (metadata - 'deliveryLeaseToken' - 'deliveryLeaseUntil') || jsonb_build_object(
          'deliveryFailures', coalesce((metadata ->> 'deliveryFailures')::integer, 0) + 1,
          'lastDeliveryError', $4::text
        )
        where id = $1 and user_id = $5 and status = 'pending' and metadata ->> 'deliveryLeaseToken' = $2
        returning id`,
        [nudgeId, leaseToken, retryAt.toISOString(), error, userId],
      );
      await tx.query(
        `delete from public.scheduler_leases
        where user_id = $1 and resource = $2 and owner_token = $3`,
        [userId, DELIVERY_LEASE_RESOURCE, leaseToken],
      );
      return rows.length === 1;
    });
  }

  private async expireStalePending(userId: string, now: Date): Promise<void> {
    await query(
      `update public.ai_nudges n set status = 'expired', lifecycle_state = 'resolved',
      resolved_at = now(), resolution_reason = 'target_no_longer_eligible',
      metadata = (metadata - 'deliveryLeaseToken' - 'deliveryLeaseUntil') ||
        jsonb_build_object('expiredReason', 'target_no_longer_eligible', 'expiredAt', $2::text)
       where n.user_id = $1 and n.status = 'pending' and n.deliver_after <= $2
       and n.lifecycle_state in ('active','snoozed')
       and (n.snoozed_until is null or n.snoozed_until <= $2)
      and coalesce(n.metadata ->> 'deliveryLeaseUntil', '') <= $2::text
      and not (${VALID_PENDING_NUDGE_SQL})`,
      [userId, now.toISOString()],
    );
  }

  async appendSystemMessage(
    nudge: PersistedNudge,
    composed: ComposedNudge,
  ): Promise<void> {
    const existing = await query<Row>(
      `select id from public.chat_messages
      where action_result ->> 'nudgeId' = $1 limit 1`,
      [nudge.id],
    );
    if (existing.length) return;
    const thread = await getOrCreateChatThread({
      clientSlug: nudge.clientSlug ?? undefined,
      title: "Supervisora",
      source: "system",
    });
    await appendChatMessage({
      threadId: String(thread.id),
      role: "system",
      content: composed.body,
      mode: "supervisor",
      actionResult: {
        nudgeId: nudge.id,
        deepLink: nudge.deepLink,
        quickActions: nudge.quickActions,
      },
    });
  }

  async getNudge(id: string): Promise<PersistedNudge | undefined> {
    const rows = await query<Row>(
      `select n.*, c.slug as client_slug, c.name as client_name,
      co.title as commitment_title from public.ai_nudges n
      left join public.clients c on c.id = n.client_id
      left join public.commitments co on co.id = n.commitment_id
      where n.id = $1 and n.user_id = $2 limit 1`,
      [id, await martuUserId()],
    );
    return rows[0] ? mapNudge(rows[0]) : undefined;
  }

  async markActed(
    id: string,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    await query(
      `update public.ai_nudges set status = 'acted', lifecycle_state = 'resolved',
      acted_at = now(), resolved_at = now(), resolution_reason = 'action', snoozed_until = null,
      metadata = metadata || $2::jsonb
      where id = $1 and user_id = $3`,
      [id, JSON.stringify({ action: metadata }), await martuUserId()],
    );
  }

  async dismiss(id: string, reason = "dismissed"): Promise<void> {
    await query(
      `update public.ai_nudges set status = 'dismissed', lifecycle_state = 'dismissed',
      dismissed_at = now(), resolution_reason = $2, snoozed_until = null,
      metadata = metadata || $3::jsonb
      where id = $1 and user_id = $4`,
      [
        id,
        reason,
        JSON.stringify({ dismissalReason: reason }),
        await martuUserId(),
      ],
    );
  }

  async snooze(id: string, until: Date): Promise<void> {
    await query(
      `update public.ai_nudges set status = 'pending', lifecycle_state = 'snoozed',
      snoozed_until = $2, deliver_after = greatest(deliver_after,$2::timestamptz),
      metadata = metadata || $3::jsonb where id = $1 and user_id = $4`,
      [
        id,
        until.toISOString(),
        JSON.stringify({ snoozedUntil: until.toISOString() }),
        await martuUserId(),
      ],
    );
  }
}

async function martuUserId(): Promise<string> {
  const rows = await query<Row>(
    "select id from public.users where slug = 'martu' limit 1",
  );
  if (!rows[0]) throw new Error("La usuaria demo Martu no está inicializada.");
  return String(rows[0].id);
}

function mapWork(row: Row): ProactivityWorkItem {
  return {
    id: String(row.id),
    clientId: row.client_id == null ? null : String(row.client_id),
    clientSlug: stringOrNull(row.client_slug),
    clientName: stringOrNull(row.client_name),
    title: String(row.title ?? "Sin título"),
    status: String(row.status),
    dueAt: iso(row.due_at),
    remindAt: iso(row.remind_at),
    updatedAt: iso(row.updated_at) ?? new Date().toISOString(),
    createdAt: iso(row.created_at) ?? undefined,
    source: stringOrNull(row.source),
    targetType: stringOrNull(row.target_type ?? row.entity_type),
    targetId:
      row.target_id == null && row.entity_id == null
        ? null
        : String(row.target_id ?? row.entity_id),
    metadata: normalizeRecord(row),
  };
}

function mapNudge(row: Row): PersistedNudge {
  const metadata = asObject(row.metadata);
  const deliveryLeaseToken = metadata.deliveryLeaseToken;
  const factMetadata = { ...metadata };
  delete factMetadata.deliveryLeaseToken;
  delete factMetadata.deliveryLeaseUntil;
  const facts = {
    ...factMetadata,
    clientName: metadata.clientName ?? row.client_name,
    clientSlug: metadata.clientSlug ?? row.client_slug,
    title: metadata.title ?? row.commitment_title ?? row.title,
  };
  return {
    id: String(row.id),
    kind: normalizeNudgeKind(row.kind),
    dedupeKey: String(row.dedupe_key),
    priority: String(row.severity) as PersistedNudge["priority"],
    title: String(row.title),
    facts,
    clientId: row.client_id == null ? null : String(row.client_id),
    clientSlug: stringOrNull(row.client_slug ?? metadata.clientSlug),
    deliveryLeaseToken: stringOrNull(deliveryLeaseToken),
    entityType: stringOrNull(
      metadata.entityType ??
        (row.commitment_id
          ? "commitment"
          : row.task_id
            ? "task"
            : row.reminder_id
              ? "reminder"
              : null),
    ),
    entityId:
      row.commitment_id != null
        ? String(row.commitment_id)
        : row.task_id != null
          ? String(row.task_id)
          : row.reminder_id != null
            ? String(row.reminder_id)
            : stringOrNull(metadata.entityId),
    deepLink: String(row.target_path),
    dueAt: stringOrNull(metadata.dueAt),
    cooldownMinutes: 0,
    quickActions: normalizeQuickActions(row.quick_actions),
    status: status(row.status),
    message: humanizedMessage(row.message),
    scheduledFor: iso(row.deliver_after),
    createdAt: iso(row.created_at) ?? new Date().toISOString(),
    lastDeliveredAt: iso(row.delivered_at),
  };
}

function humanizedMessage(value: unknown): string | null {
  const message = stringOrNull(value);
  return message ? humanizeNotificationCopy(message) : null;
}

// This predicate mirrors DeterministicNudgeDetector against live relational
// state. It is intentionally used both while expiring stale queue rows and in
// the atomic claim statement so a delayed nudge cannot bypass revalidation.
// Parameters: $1 = Martu user id, $2 = scheduler timestamp (ISO string).
const VALID_PENDING_NUDGE_SQL = `case
  when n.kind in ('commitment_due', 'commitment_overdue') then exists (
    select 1 from public.commitments current_commitment
    where current_commitment.id = n.commitment_id
      and current_commitment.user_id = $1
      and current_commitment.status = 'open'
      and (current_commitment.client_id is null or exists (
        select 1 from public.clients commitment_client
        where commitment_client.id = current_commitment.client_id
          and commitment_client.user_id = $1 and commitment_client.archived_at is null
      ))
      and current_commitment.due_at between $2::timestamptz - interval '7 days' and $2::timestamptz
      and not exists (
        select 1 from public.reminders explicit_reminder
        where explicit_reminder.user_id = $1 and explicit_reminder.commitment_id = current_commitment.id
          and explicit_reminder.status in ('pending', 'snoozed')
          and explicit_reminder.remind_at between $2::timestamptz - interval '3 days' and $2::timestamptz
      )
  )
  when n.kind = 'reminder_due' then exists (
    select 1 from public.reminders current_reminder
    where current_reminder.id = n.reminder_id
      and current_reminder.user_id = $1
      and current_reminder.status in ('pending', 'snoozed')
      and (current_reminder.client_id is null or exists (
        select 1 from public.clients reminder_client
        where reminder_client.id = current_reminder.client_id
          and reminder_client.user_id = $1 and reminder_client.archived_at is null
      ))
      and current_reminder.remind_at between $2::timestamptz - interval '3 days' and $2::timestamptz
      and (
        (current_reminder.commitment_id is not null and exists (
          select 1 from public.commitments linked_commitment
          where linked_commitment.id = current_reminder.commitment_id
            and linked_commitment.user_id = $1 and linked_commitment.status = 'open'
            and (linked_commitment.client_id is null or exists (
              select 1 from public.clients linked_commitment_client
              where linked_commitment_client.id = linked_commitment.client_id
                and linked_commitment_client.user_id = $1 and linked_commitment_client.archived_at is null
            ))
        ))
        or (current_reminder.commitment_id is null and current_reminder.task_id is not null and exists (
          select 1 from public.tasks linked_task
          where linked_task.id = current_reminder.task_id
            and linked_task.user_id = $1 and linked_task.archived_at is null
            and linked_task.status not in ('completed', 'cancelled')
            and (linked_task.client_id is null or exists (
              select 1 from public.clients linked_task_client
              where linked_task_client.id = linked_task.client_id
                and linked_task_client.user_id = $1 and linked_task_client.archived_at is null
            ))
        ))
        or (current_reminder.commitment_id is null and current_reminder.task_id is null)
      )
  )
  when n.kind = 'task_overdue' then exists (
    select 1 from public.tasks current_task
    where current_task.id = n.task_id and current_task.user_id = $1
      and current_task.archived_at is null
      and current_task.status not in ('completed', 'cancelled')
      and (current_task.client_id is null or exists (
        select 1 from public.clients overdue_task_client
        where overdue_task_client.id = current_task.client_id
          and overdue_task_client.user_id = $1 and overdue_task_client.archived_at is null
      ))
      and current_task.source <> 'meeting'
      and current_task.due_at between $2::timestamptz - interval '14 days' and $2::timestamptz
      and not exists (
        select 1 from public.reminders explicit_reminder
        where explicit_reminder.user_id = $1 and explicit_reminder.task_id = current_task.id
          and explicit_reminder.status in ('pending', 'snoozed')
          and explicit_reminder.remind_at between $2::timestamptz - interval '3 days' and $2::timestamptz
      )
  )
  when n.kind = 'task_due_soon' then exists (
    select 1 from public.tasks current_task
    where current_task.id = n.task_id and current_task.user_id = $1
      and current_task.archived_at is null
      and current_task.status not in ('completed', 'cancelled')
      and (current_task.client_id is null or exists (
        select 1 from public.clients soon_task_client
        where soon_task_client.id = current_task.client_id
          and soon_task_client.user_id = $1 and soon_task_client.archived_at is null
      ))
      and current_task.source <> 'meeting'
      and current_task.due_at > $2::timestamptz
      and current_task.due_at <= $2::timestamptz + interval '24 hours'
      and not exists (
        select 1 from public.reminders explicit_reminder
        where explicit_reminder.user_id = $1 and explicit_reminder.task_id = current_task.id
          and explicit_reminder.status in ('pending', 'snoozed')
          and explicit_reminder.remind_at between $2::timestamptz - interval '3 days' and $2::timestamptz
      )
  )
  when n.kind = 'task_stale' then exists (
    select 1 from public.tasks current_task
    where current_task.id = n.task_id and current_task.user_id = $1
      and current_task.archived_at is null
      and current_task.status not in ('completed', 'cancelled')
      and (current_task.client_id is null or exists (
        select 1 from public.clients stale_task_client
        where stale_task_client.id = current_task.client_id
          and stale_task_client.user_id = $1 and stale_task_client.archived_at is null
      ))
      and current_task.source <> 'meeting'
      and current_task.due_at is null
      and current_task.updated_at <= $2::timestamptz - interval '5 days'
      and not exists (
        select 1 from public.reminders explicit_reminder
        where explicit_reminder.user_id = $1 and explicit_reminder.task_id = current_task.id
          and explicit_reminder.status in ('pending', 'snoozed')
          and explicit_reminder.remind_at between $2::timestamptz - interval '3 days' and $2::timestamptz
      )
  )
  when n.kind = 'content_stalled' then exists (
    select 1 from public.content_items current_content
    join public.clients content_client on content_client.id = current_content.client_id
    left join public.content_workflow_states current_state on current_state.id = current_content.workflow_state_id
    where current_content.id::text = n.metadata ->> 'entityId'
      and content_client.user_id = $1
      and content_client.archived_at is null and current_content.archived_at is null
      and current_state.terminal_kind is null
      and coalesce(current_state.slug,current_content.status) not in ('idea','published','delivered')
      and current_content.status_changed_at <= $2::timestamptz - interval '4 days'
  )
  when n.kind = 'meeting_action_open' then exists (
    select 1 from public.tasks meeting_task
    where meeting_task.id = n.task_id and meeting_task.user_id = $1
      and meeting_task.archived_at is null
      and meeting_task.source = 'meeting'
      and meeting_task.status not in ('completed', 'cancelled')
      and (meeting_task.client_id is null or exists (
        select 1 from public.clients meeting_task_client
        where meeting_task_client.id = meeting_task.client_id
          and meeting_task_client.user_id = $1 and meeting_task_client.archived_at is null
      ))
      and (meeting_task.due_at is null or meeting_task.due_at <= $2::timestamptz)
  )
  when n.kind = 'missing_brief' then exists (
    select 1 from public.clients gap_client
    where gap_client.id = n.client_id and gap_client.user_id = $1 and gap_client.status = 'active'
      and gap_client.archived_at is null
      and exists (
        select 1 from public.client_services gap_cs
        join public.services gap_service on gap_service.id = gap_cs.service_id
        where gap_cs.client_id = gap_client.id and gap_cs.is_active
          and (lower(gap_service.slug) like '%estrateg%' or lower(gap_service.slug) like '%meta_ads%' or lower(gap_service.slug) like '%meta-ads%' or lower(gap_service.slug) like '%pauta%')
      )
      and not exists (
        select 1 from public.briefs current_brief
        where current_brief.client_id = gap_client.id and current_brief.status = 'complete'
      )
  )
  when n.kind = 'missing_strategy' then exists (
    select 1 from public.clients gap_client
    where gap_client.id = n.client_id and gap_client.user_id = $1 and gap_client.status = 'active'
      and gap_client.archived_at is null
      and exists (
        select 1 from public.client_services gap_cs
        join public.services gap_service on gap_service.id = gap_cs.service_id
        where gap_cs.client_id = gap_client.id and gap_cs.is_active
          and (lower(gap_service.slug) like '%estrateg%' or lower(gap_service.slug) like '%meta_ads%' or lower(gap_service.slug) like '%meta-ads%' or lower(gap_service.slug) like '%pauta%')
      )
      and exists (
        select 1 from public.briefs current_brief
        where current_brief.client_id = gap_client.id and current_brief.status = 'complete'
      )
      and not exists (
        select 1 from public.strategies current_strategy
        where current_strategy.client_id = gap_client.id and current_strategy.status = 'active'
      )
  )
  when n.kind = 'metric_opportunity' then exists (
    select 1 from public.content_metrics current_metric
    join public.content_items metric_content on metric_content.id = current_metric.content_item_id
    join public.clients metric_client on metric_client.id = metric_content.client_id
    where current_metric.id::text = n.metadata ->> 'entityId'
      and metric_client.user_id = $1 and metric_client.archived_at is null
      and metric_content.archived_at is null and current_metric.retention_rate >= 0.58
  )
  when n.kind = 'open_loop_resurface' then exists (
    select 1 from public.open_loops current_loop
    left join public.clients loop_client on loop_client.id = current_loop.client_id
    where current_loop.id::text = n.metadata ->> 'entityId'
      and current_loop.user_id = $1 and current_loop.status = 'open'
      and current_loop.archived_at is null and current_loop.surface_count < 3
      and (current_loop.client_id is null or loop_client.archived_at is null)
      and (current_loop.next_eligible_at is null or current_loop.next_eligible_at <= $2::timestamptz)
  )
  when n.kind = 'morning_briefing' then exists (
    select 1 from public.communication_profiles current_profile
    where current_profile.user_id = $1 and current_profile.morning_briefing_enabled
      and right(n.dedupe_key, 10) = to_char($2::timestamptz at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD')
      and ($2::timestamptz at time zone 'America/Argentina/Buenos_Aires')::time >= current_profile.morning_briefing_at
      and ($2::timestamptz at time zone 'America/Argentina/Buenos_Aires')::time <= current_profile.morning_briefing_at + interval '120 minutes'
  )
  when n.kind = 'midday_check' then exists (
    select 1 from public.communication_profiles current_profile
    where current_profile.user_id = $1 and current_profile.midday_check_enabled
      and right(n.dedupe_key, 10) = to_char($2::timestamptz at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD')
      and ($2::timestamptz at time zone 'America/Argentina/Buenos_Aires')::time >= current_profile.midday_check_at
      and ($2::timestamptz at time zone 'America/Argentina/Buenos_Aires')::time <= current_profile.midday_check_at + interval '120 minutes'
  )
  when n.kind = 'end_of_day' then exists (
    select 1 from public.communication_profiles current_profile
    where current_profile.user_id = $1 and current_profile.end_of_day_enabled and current_profile.end_of_day_at is not null
      and right(n.dedupe_key, 10) = to_char($2::timestamptz at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD')
      and ($2::timestamptz at time zone 'America/Argentina/Buenos_Aires')::time >= current_profile.end_of_day_at
      and ($2::timestamptz at time zone 'America/Argentina/Buenos_Aires')::time <= current_profile.end_of_day_at + interval '120 minutes'
  )
  else true
end`;

function mapProfile(
  row: DataCommunicationProfile | undefined,
): CommunicationProfile {
  return {
    language: row?.language ?? "es-AR",
    formality: row?.formality ?? 2,
    preferredLength: row?.preferredLength ?? "short",
    humor: row?.humor ?? 3,
    insistenceLevel: row?.insistenceLevel ?? 3,
    quietHoursStart: row?.quietHoursStart?.slice(0, 5) ?? "22:30",
    quietHoursEnd: row?.quietHoursEnd?.slice(0, 5) ?? "08:30",
    morningBriefingAt: row?.morningBriefingAt?.slice(0, 5) ?? "09:00",
    morningBriefingEnabled: row?.morningBriefingEnabled ?? true,
    middayCheckAt: row?.middayCheckAt?.slice(0, 5) ?? "13:30",
    middayCheckEnabled: row?.middayCheckEnabled ?? true,
    endOfDayAt: row?.endOfDayAt?.slice(0, 5) ?? null,
    endOfDayEnabled: row?.endOfDayEnabled ?? false,
    expressions: row?.expressions ?? ["che", "dale"],
    preferences: { explicit: row?.explicitPreferences ?? [] },
  };
}

function status(value: unknown): PersistedNudge["status"] {
  const mapped = String(value) === "seen" ? "read" : String(value);
  return mapped as PersistedNudge["status"];
}
function iso(value: unknown): string | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}
function stringOrNull(value: unknown): string | null {
  return value == null ? null : String(value);
}
function asObject(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(String)
    : typeof value === "string"
      ? value
          .replace(/^\{|\}$/g, "")
          .split(",")
          .filter(Boolean)
      : [];
}
function normalizeRecord(row: Row) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      value instanceof Date ? value.toISOString() : value,
    ]),
  );
}
function normalizeNudgeKind(value: unknown): PersistedNudge["kind"] {
  return (
    String(value) === "commitment_overdue" ? "commitment_due" : String(value)
  ) as PersistedNudge["kind"];
}
function normalizeQuickActions(value: unknown): PersistedNudge["quickActions"] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<PersistedNudge["quickActions"][number]>([
    "do_now",
    "reschedule",
    "complete",
    "snooze",
    "dismiss",
    "reduce_insistence",
  ]);
  return value.flatMap((entry) => {
    const object = asObject(entry);
    const raw = typeof entry === "string" ? entry : String(object.id ?? "");
    const label =
      typeof entry === "string" ? "" : String(object.label ?? "").toLowerCase();
    const action =
      raw === "now"
        ? "do_now"
        : raw === "done"
          ? "complete"
          : raw === "dismiss" && label.includes("no me jodas")
            ? "reduce_insistence"
            : raw;
    return allowed.has(action as PersistedNudge["quickActions"][number])
      ? [action as PersistedNudge["quickActions"][number]]
      : [];
  });
}
