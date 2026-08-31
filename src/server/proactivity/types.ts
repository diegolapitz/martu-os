import type { CommunicationProfile } from "@/server/agent/types";

export type NudgeKind =
  | "task_overdue"
  | "task_due_soon"
  | "commitment_due"
  | "reminder_due"
  | "task_stale"
  | "content_stalled"
  | "meeting_action_open"
  | "missing_brief"
  | "missing_strategy"
  | "metric_opportunity"
  | "open_loop_resurface"
  | "morning_briefing"
  | "midday_check"
  | "end_of_day";

export type NudgePriority = "low" | "medium" | "high" | "urgent";

export interface ProactivityClient {
  id: string;
  slug: string;
  name: string;
  services: string[];
  hasBrief: boolean;
  hasStrategy: boolean;
}

export interface ProactivityWorkItem {
  id: string;
  clientId?: string | null;
  clientSlug?: string | null;
  clientName?: string | null;
  title: string;
  status: string;
  dueAt?: string | null;
  remindAt?: string | null;
  updatedAt: string;
  createdAt?: string;
  source?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface MetricOpportunity {
  id: string;
  clientId: string;
  clientSlug: string;
  clientName: string;
  title: string;
  evidence: string;
  deepLink: string;
}

export interface ProactivityOpenLoop {
  id: string;
  clientId?: string | null;
  clientSlug?: string | null;
  clientName?: string | null;
  title: string;
  body?: string | null;
  kind: string;
  salience: number;
  surfaceCount: number;
  nextEligibleAt?: string | null;
  lastSurfacedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExistingNudgeRef {
  id: string;
  dedupeKey: string;
  status: "pending" | "delivered" | "read" | "acted" | "dismissed" | "failed";
  lastDeliveredAt?: string | null;
  createdAt: string;
}

export interface ProactivitySnapshot {
  now: string;
  clients: ProactivityClient[];
  tasks: ProactivityWorkItem[];
  commitments: ProactivityWorkItem[];
  reminders: ProactivityWorkItem[];
  content: ProactivityWorkItem[];
  meetingActions: ProactivityWorkItem[];
  metricOpportunities: MetricOpportunity[];
  openLoops?: ProactivityOpenLoop[];
  existingNudges: ExistingNudgeRef[];
  profile: CommunicationProfile;
}

export interface NudgeCandidate {
  kind: NudgeKind;
  dedupeKey: string;
  priority: NudgePriority;
  title: string;
  facts: Record<string, unknown>;
  clientId?: string | null;
  clientSlug?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  deepLink: string;
  dueAt?: string | null;
  cooldownMinutes: number;
  quickActions: Array<
    | "do_now"
    | "reschedule"
    | "complete"
    | "snooze"
    | "dismiss"
    | "reduce_insistence"
  >;
}

export interface PersistedNudge extends NudgeCandidate {
  id: string;
  status: ExistingNudgeRef["status"];
  /** Present only while this scheduler invocation owns the delivery lease. */
  deliveryLeaseToken?: string | null;
  message?: string | null;
  scheduledFor?: string | null;
  createdAt: string;
  lastDeliveredAt?: string | null;
}

export interface ComposedNudge {
  title: string;
  body: string;
  deepLink: string;
  tag: string;
  data: Record<string, unknown>;
}

export interface ProactivityTickResult {
  detected: number;
  created: number;
  delivered: number;
  deferredQuietHours: number;
  skipped: number;
  failed: number;
  errors: string[];
}
