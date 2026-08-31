import { formatInTimeZone } from "date-fns-tz";

import { MARTU_TIME_ZONE } from "@/server/agent/types";

import type {
  NudgeCandidate,
  NudgeKind,
  NudgePriority,
  ProactivityOpenLoop,
  ProactivitySnapshot,
  ProactivityWorkItem,
} from "./types";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const FINAL_STATUSES = new Set([
  "done",
  "completed",
  "cancelled",
  "canceled",
  "published",
  "delivered",
  "entregado",
  "publicado",
  "aprobado",
]);
const ACTIVE_CONTENT_STATUSES = new Set([
  "script",
  "guion",
  "to_record",
  "ready_to_record",
  "para_grabar",
  "recorded",
  "grabado",
  "editing",
  "editando",
  "ready",
  "listo",
  "approval",
  "in_approval",
  "en_aprobacion",
  "approved",
]);

export class DeterministicNudgeDetector {
  detect(snapshot: ProactivitySnapshot): NudgeCandidate[] {
    const now = new Date(snapshot.now);
    const candidates: NudgeCandidate[] = [];
    const dueReminderTargets = new Set<string>();

    for (const reminder of snapshot.reminders) {
      const due = asDate(reminder.remindAt ?? reminder.dueAt);
      if (
        !due ||
        isClosed(reminder) ||
        due > now ||
        now.getTime() - due.getTime() > 3 * DAY
      )
        continue;
      if (
        reminder.targetType === "commitment" &&
        !snapshot.commitments.some((item) => item.id === reminder.targetId)
      )
        continue;
      if (
        reminder.targetType === "task" &&
        !snapshot.tasks.some((item) => item.id === reminder.targetId)
      )
        continue;
      candidates.push(
        workCandidate("reminder_due", reminder, "high", due, 12 * HOUR),
      );
      if (reminder.targetType && reminder.targetId)
        dueReminderTargets.add(`${reminder.targetType}:${reminder.targetId}`);
    }

    for (const commitment of snapshot.commitments) {
      const due = asDate(commitment.dueAt);
      if (
        !due ||
        isClosed(commitment) ||
        dueReminderTargets.has(`commitment:${commitment.id}`) ||
        due > now ||
        now.getTime() - due.getTime() > 7 * DAY
      )
        continue;
      candidates.push(
        workCandidate("commitment_due", commitment, "urgent", due, 6 * HOUR),
      );
    }

    for (const task of snapshot.tasks) {
      if (
        isClosed(task) ||
        task.source === "meeting" ||
        dueReminderTargets.has(`task:${task.id}`)
      )
        continue;
      const due = asDate(task.dueAt);
      if (due && due <= now && now.getTime() - due.getTime() <= 14 * DAY) {
        candidates.push(
          workCandidate("task_overdue", task, "urgent", due, 8 * HOUR),
        );
      } else if (
        due &&
        due.getTime() - now.getTime() <= 24 * HOUR &&
        due > now
      ) {
        candidates.push(
          workCandidate("task_due_soon", task, "high", due, 12 * HOUR),
        );
      }
      const updated = asDate(task.updatedAt);
      if (!due && updated && now.getTime() - updated.getTime() >= 5 * DAY) {
        candidates.push(
          workCandidate("task_stale", task, "medium", undefined, 3 * DAY),
        );
      }
    }

    const stalledClients = new Set<string>();
    for (const item of [...snapshot.content].sort((left, right) =>
      left.updatedAt.localeCompare(right.updatedAt),
    )) {
      if (
        isClosed(item) ||
        !ACTIVE_CONTENT_STATUSES.has(normalizeStatus(item.status))
      )
        continue;
      const updated = asDate(item.updatedAt);
      if (!updated || now.getTime() - updated.getTime() < 4 * DAY) continue;
      const clientKey = item.clientId ?? item.clientSlug ?? "global";
      if (stalledClients.has(clientKey)) continue;
      stalledClients.add(clientKey);
      candidates.push(
        workCandidate("content_stalled", item, "medium", undefined, 2 * DAY),
      );
    }

    for (const action of snapshot.meetingActions) {
      if (isClosed(action)) continue;
      const due = asDate(action.dueAt);
      if (due && due > now) continue;
      candidates.push(
        workCandidate("meeting_action_open", action, "high", due, DAY),
      );
    }

    const dateKey = formatInTimeZone(now, MARTU_TIME_ZONE, "yyyy-MM-dd");
    for (const client of snapshot.clients) {
      const services = client.services.map(normalizeStatus);
      const needsStrategy = services.some((service) =>
        /estrateg|meta_ads|pauta/.test(service),
      );
      if (needsStrategy && !client.hasBrief) {
        candidates.push(clientGapCandidate("missing_brief", client, dateKey));
      } else if (needsStrategy && !client.hasStrategy) {
        candidates.push(
          clientGapCandidate("missing_strategy", client, dateKey),
        );
      }
    }

    for (const opportunity of snapshot.metricOpportunities) {
      candidates.push({
        kind: "metric_opportunity",
        dedupeKey: `metric_opportunity:${opportunity.id}`,
        priority: "medium",
        title: opportunity.title,
        facts: {
          clientName: opportunity.clientName,
          evidence: opportunity.evidence,
        },
        clientId: opportunity.clientId,
        clientSlug: opportunity.clientSlug,
        entityType: "metric_opportunity",
        entityId: opportunity.id,
        deepLink: opportunity.deepLink,
        cooldownMinutes: 7 * 24 * 60,
        quickActions: ["do_now", "dismiss"],
      });
    }

    for (const openLoop of snapshot.openLoops ?? []) {
      if (!shouldSurfaceOpenLoop(openLoop, now)) continue;
      candidates.push(openLoopCandidate(openLoop));
    }

    candidates.push(...checkInCandidates(snapshot, now, dateKey));
    return applyInsistenceProfile(
      dedupeCandidates(candidates),
      snapshot.profile.insistenceLevel,
    );
  }
}

function openLoopCandidate(openLoop: ProactivityOpenLoop): NudgeCandidate {
  const surfaceNumber = openLoop.surfaceCount + 1;
  const clientPath = openLoop.clientSlug
    ? `/clients/${openLoop.clientSlug}`
    : "/supervisor";
  return {
    kind: "open_loop_resurface",
    dedupeKey: `open_loop:${openLoop.id}:surface:${surfaceNumber}`,
    priority:
      openLoop.salience >= 5
        ? "high"
        : openLoop.salience >= 4
          ? "medium"
          : "low",
    title: openLoop.title,
    facts: {
      title: openLoop.title,
      body: openLoop.body,
      kind: openLoop.kind,
      clientName: openLoop.clientName,
      surfaceCount: openLoop.surfaceCount,
      createdAt: openLoop.createdAt,
    },
    clientId: openLoop.clientId,
    clientSlug: openLoop.clientSlug,
    entityType: "open_loop",
    entityId: openLoop.id,
    deepLink: `${clientPath}?assistant=open&openLoop=${encodeURIComponent(openLoop.id)}`,
    cooldownMinutes: openLoopCooldownDays(openLoop.surfaceCount) * 24 * 60,
    quickActions: ["do_now", "snooze", "dismiss"],
  };
}

function shouldSurfaceOpenLoop(
  openLoop: ProactivityOpenLoop,
  now: Date,
): boolean {
  if (openLoop.salience < 3 || openLoop.surfaceCount >= 3) return false;
  const createdAt = asDate(openLoop.createdAt);
  if (!createdAt) return false;
  const minimumAge =
    openLoop.salience >= 5 ? DAY : openLoop.salience >= 4 ? 3 * DAY : 7 * DAY;
  if (now.getTime() - createdAt.getTime() < minimumAge) return false;

  const nextEligibleAt = asDate(openLoop.nextEligibleAt);
  if (nextEligibleAt && nextEligibleAt > now) return false;
  const lastSurfacedAt = asDate(openLoop.lastSurfacedAt);
  if (
    lastSurfacedAt &&
    now.getTime() - lastSurfacedAt.getTime() <
      openLoopCooldownDays(Math.max(openLoop.surfaceCount - 1, 0)) * DAY
  ) {
    return false;
  }
  return true;
}

function openLoopCooldownDays(surfaceCount: number): number {
  return 14 * 2 ** Math.min(Math.max(surfaceCount, 0), 2);
}

function workCandidate(
  kind: NudgeKind,
  item: ProactivityWorkItem,
  priority: NudgePriority,
  due?: Date,
  cooldownMs = DAY,
): NudgeCandidate {
  const clientPath = item.clientSlug ? `/clients/${item.clientSlug}` : "/day";
  const entityType =
    kind === "reminder_due"
      ? (item.targetType ?? "reminder")
      : kind.startsWith("commitment")
        ? "commitment"
        : kind.startsWith("content")
          ? "content"
          : "task";
  const entityId =
    kind === "reminder_due" ? (item.targetId ?? item.id) : item.id;
  return {
    kind,
    dedupeKey: `${kind}:${item.id}:${due ? due.toISOString().slice(0, 13) : "open"}`,
    priority,
    title: item.title,
    facts: {
      title: item.title,
      clientName: item.clientName,
      dueAt: due?.toISOString(),
      source: item.source,
      status: item.status,
      createdAt: item.createdAt,
      reminderId: kind === "reminder_due" ? item.id : undefined,
    },
    clientId: item.clientId,
    clientSlug: item.clientSlug,
    entityType,
    entityId,
    deepLink: `${clientPath}?assistant=open&nudge=${encodeURIComponent(`${kind}:${item.id}`)}`,
    dueAt: due?.toISOString(),
    cooldownMinutes: Math.round(cooldownMs / 60_000),
    quickActions:
      kind === "reminder_due" && entityType === "reminder"
        ? ["snooze", "dismiss"]
        : kind === "commitment_due" || entityType === "commitment"
          ? ["do_now", "reschedule", "complete", "reduce_insistence"]
          : ["do_now", "reschedule", "complete", "snooze", "dismiss"],
  };
}

function clientGapCandidate(
  kind: "missing_brief" | "missing_strategy",
  client: ProactivitySnapshot["clients"][number],
  dateKey: string,
): NudgeCandidate {
  const label = kind === "missing_brief" ? "brief" : "estrategia";
  return {
    kind,
    dedupeKey: `${kind}:${client.id}:${dateKey}`,
    priority: "low",
    title: `${client.name} todavía no tiene ${label} completo`,
    facts: { clientName: client.name, missing: label },
    clientId: client.id,
    clientSlug: client.slug,
    entityType: label,
    deepLink: `/clients/${client.slug}/estrategia?assistant=open`,
    cooldownMinutes: 7 * 24 * 60,
    quickActions: ["snooze", "dismiss"],
  };
}

function checkInCandidates(
  snapshot: ProactivitySnapshot,
  now: Date,
  dateKey: string,
): NudgeCandidate[] {
  const localTime = formatInTimeZone(now, MARTU_TIME_ZONE, "HH:mm");
  const checks: Array<{
    kind: "morning_briefing" | "midday_check" | "end_of_day";
    at?: string | null;
    enabled: boolean;
  }> = [
    {
      kind: "morning_briefing",
      at: snapshot.profile.morningBriefingAt,
      enabled: snapshot.profile.morningBriefingEnabled,
    },
    {
      kind: "midday_check",
      at: snapshot.profile.middayCheckAt,
      enabled: snapshot.profile.middayCheckEnabled,
    },
    {
      kind: "end_of_day",
      at: snapshot.profile.endOfDayAt,
      enabled: snapshot.profile.endOfDayEnabled,
    },
  ];
  return checks.flatMap(({ kind, at, enabled }) => {
    if (!enabled || !at || !isWithinCatchUpWindow(localTime, at, 120))
      return [];
    return [
      {
        kind,
        dedupeKey: `${kind}:${dateKey}`,
        priority:
          kind === "morning_briefing" ? ("high" as const) : ("medium" as const),
        title:
          kind === "morning_briefing"
            ? "Tu foco de hoy"
            : kind === "midday_check"
              ? "Chequeo de mitad de día"
              : "Cierre del día",
        facts: {
          openTasks: snapshot.tasks.filter((item) => !isClosed(item)).length,
          overdue: snapshot.tasks.filter(
            (item) =>
              !isClosed(item) &&
              asDate(item.dueAt) &&
              asDate(item.dueAt)! <= now,
          ).length,
        },
        deepLink: "/day?assistant=open",
        cooldownMinutes: 20 * 60,
        quickActions: ["do_now", "dismiss"] as NudgeCandidate["quickActions"],
      },
    ];
  });
}

function isWithinCatchUpWindow(
  current: string,
  scheduled: string,
  minutes: number,
): boolean {
  const currentMinutes = timeToMinutes(current);
  const scheduledMinutes = timeToMinutes(scheduled);
  return (
    currentMinutes >= scheduledMinutes &&
    currentMinutes - scheduledMinutes <= minutes
  );
}

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function isClosed(item: ProactivityWorkItem): boolean {
  return FINAL_STATUSES.has(normalizeStatus(item.status));
}

function normalizeStatus(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-AR")
    .replace(/[\s-]+/g, "_");
}

function asDate(value?: string | null): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function dedupeCandidates(candidates: NudgeCandidate[]): NudgeCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.dedupeKey)) return false;
    seen.add(candidate.dedupeKey);
    return true;
  });
}

function applyInsistenceProfile(
  candidates: NudgeCandidate[],
  level: number,
): NudgeCandidate[] {
  if (level <= 1) {
    return candidates.filter(
      (candidate) =>
        candidate.priority === "urgent" ||
        candidate.kind === "reminder_due" ||
        candidate.kind === "commitment_due",
    );
  }
  if (level <= 2)
    return candidates.filter((candidate) => candidate.priority !== "low");
  return candidates;
}
