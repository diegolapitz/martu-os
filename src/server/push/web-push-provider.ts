import webpush from "web-push";

import type { ComposedNudge } from "@/server/proactivity/types";

import { serializeBrowserSubscription } from "./subscription-service";
import type {
  NotificationDeliveryResult,
  NotificationProvider,
  PushSubscriptionRepository,
  StoredPushSubscription,
} from "./types";

export interface WebPushTransport {
  configure(subject: string, publicKey: string, privateKey: string): void;
  send(subscription: ReturnType<typeof serializeBrowserSubscription>, payload: string): Promise<unknown>;
}

const defaultTransport: WebPushTransport = {
  configure(subject, publicKey, privateKey) {
    webpush.setVapidDetails(subject, publicKey, privateKey);
  },
  send(subscription, payload) {
    return webpush.sendNotification(subscription, payload);
  },
};

export class WebPushNotificationProvider implements NotificationProvider {
  readonly channel = "web_push";
  private configured = false;

  constructor(
    private readonly subscriptions: PushSubscriptionRepository,
    private readonly transport: WebPushTransport = defaultTransport,
  ) {}

  async deliver(notification: ComposedNudge): Promise<NotificationDeliveryResult> {
    const configuration = this.configure();
    if (!configuration.ok) return { accepted: false, reason: configuration.reason };
    const subscriptions = await this.subscriptions.listActive();
    if (subscriptions.length === 0) return { accepted: false, reason: "No hay suscripciones Web Push activas." };

    const payload = JSON.stringify({
      title: notification.title,
      body: notification.body,
      icon: "/icon.svg",
      badge: "/icon.svg",
      tag: notification.tag,
      deepLink: notification.deepLink,
      data: notification.data,
      actions: notification.data.quickActions,
    });
    let delivered = 0;
    let expired = 0;
    const errors: string[] = [];

    await Promise.all(subscriptions.map(async (subscription) => {
      try {
        await this.transport.send(toBrowserSubscription(subscription), payload);
        await this.subscriptions.markUsed(subscription.id, new Date());
        delivered += 1;
      } catch (error) {
        const statusCode = statusOf(error);
        if (statusCode === 404 || statusCode === 410) {
          await this.subscriptions.deleteByEndpoint(subscription.endpoint);
          expired += 1;
          return;
        }
        await this.subscriptions.markFailed(subscription.id, new Date());
        errors.push(error instanceof Error ? error.message : "Falló un envío Web Push");
      }
    }));

    return {
      accepted: delivered > 0,
      reason: delivered > 0 ? undefined : errors[0] ?? "Las suscripciones ya no eran válidas.",
      details: { channel: this.channel, attempted: subscriptions.length, delivered, expired, errors },
    };
  }

  private configure(): { ok: true } | { ok: false; reason: string } {
    if (this.configured) return { ok: true };
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    if (!publicKey || !privateKey) return { ok: false, reason: "Faltan las claves VAPID." };
    const subject = process.env.VAPID_SUBJECT ?? "mailto:martu-os@example.invalid";
    this.transport.configure(subject, publicKey, privateKey);
    this.configured = true;
    return { ok: true };
  }
}

function toBrowserSubscription(subscription: StoredPushSubscription) {
  return serializeBrowserSubscription({
    endpoint: subscription.endpoint,
    expirationTime: subscription.expirationTime,
    keys: { p256dh: subscription.p256dh, auth: subscription.auth },
  });
}

function statusOf(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const statusCode = Reflect.get(error, "statusCode");
  return typeof statusCode === "number" ? statusCode : undefined;
}
