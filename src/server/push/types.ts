import type { ComposedNudge } from "@/server/proactivity/types";

export interface StoredPushSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
  expirationTime?: number | null;
  createdAt?: string;
}

export interface PushSubscriptionInput {
  endpoint: string;
  expirationTime?: number | null;
  keys: { p256dh: string; auth: string };
  userAgent?: string | null;
}

export interface PushSubscriptionRepository {
  upsert(subscription: PushSubscriptionInput): Promise<StoredPushSubscription>;
  deleteByEndpoint(endpoint: string): Promise<boolean>;
  listActive(): Promise<StoredPushSubscription[]>;
  markUsed(id: string, at: Date): Promise<void>;
  markFailed(id: string, at: Date): Promise<void>;
}

export interface NotificationDeliveryResult {
  accepted: boolean;
  reason?: string;
  details?: Record<string, unknown>;
}

export interface NotificationProvider {
  readonly channel: string;
  deliver(notification: ComposedNudge): Promise<NotificationDeliveryResult>;
}
