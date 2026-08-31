import { z } from "zod";

import type { PushSubscriptionInput, PushSubscriptionRepository, StoredPushSubscription } from "./types";

const subscriptionSchema = z.object({
  endpoint: z.string().url().refine((value) => value.startsWith("https://"), "El endpoint push debe usar HTTPS."),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(16).max(512),
    auth: z.string().min(8).max(256),
  }),
});

export class PushSubscriptionService {
  constructor(private readonly repository: PushSubscriptionRepository) {}

  async subscribe(raw: unknown, userAgent?: string | null): Promise<StoredPushSubscription> {
    const parsed = subscriptionSchema.parse(raw);
    return this.repository.upsert({ ...parsed, userAgent: userAgent ?? null });
  }

  async unsubscribe(rawEndpoint: unknown): Promise<boolean> {
    const endpoint = z.string().url().parse(rawEndpoint);
    return this.repository.deleteByEndpoint(endpoint);
  }

  getPublicConfiguration() {
    return {
      enabled: Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
      publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null,
    };
  }
}

export function serializeBrowserSubscription(value: PushSubscriptionInput) {
  return {
    endpoint: value.endpoint,
    expirationTime: value.expirationTime ?? null,
    keys: { p256dh: value.keys.p256dh, auth: value.keys.auth },
  };
}
