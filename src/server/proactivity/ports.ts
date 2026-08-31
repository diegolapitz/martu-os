import type { NotificationProvider } from "@/server/push/types";

import type {
  ComposedNudge,
  NudgeCandidate,
  PersistedNudge,
  ProactivitySnapshot,
} from "./types";

export interface ProactivityRepository {
  getSnapshot(now: Date): Promise<ProactivitySnapshot>;
  claimCandidate(candidate: NudgeCandidate, now: Date): Promise<PersistedNudge | undefined>;
  listPendingForDelivery(now: Date, limit: number): Promise<PersistedNudge[]>;
  claimPendingForDelivery(now: Date, limit: number): Promise<PersistedNudge[]>;
  releaseDeliveryLease(nudgeId: string, leaseToken: string): Promise<boolean>;
  saveComposedMessage(nudgeId: string, leaseToken: string, message: string, now: Date): Promise<boolean>;
  markDelivered(nudgeId: string, leaseToken: string, deliveredAt: Date, delivery: Record<string, unknown>): Promise<boolean>;
  markFailed(nudgeId: string, leaseToken: string, error: string, retryAt: Date): Promise<boolean>;
  appendSystemMessage(nudge: PersistedNudge, composed: ComposedNudge): Promise<void>;
}

export interface NudgeDetector {
  detect(snapshot: ProactivitySnapshot): NudgeCandidate[];
}

export interface NudgeComposer {
  compose(nudge: PersistedNudge, snapshot: ProactivitySnapshot): Promise<ComposedNudge>;
}

export type ProactivityNotificationProvider = NotificationProvider;
