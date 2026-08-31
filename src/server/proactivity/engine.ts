import type { NudgeComposer, NudgeDetector, ProactivityNotificationProvider, ProactivityRepository } from "./ports";
import { isQuietTime } from "./quiet-hours";
import type { ProactivityTickResult } from "./types";

export class ProactivityEngine {
  constructor(
    private readonly repository: ProactivityRepository,
    private readonly detector: NudgeDetector,
    private readonly composer: NudgeComposer,
    private readonly notifications: ProactivityNotificationProvider,
  ) {}

  async tick(now = new Date()): Promise<ProactivityTickResult> {
    const result: ProactivityTickResult = {
      detected: 0,
      created: 0,
      delivered: 0,
      deferredQuietHours: 0,
      skipped: 0,
      failed: 0,
      errors: [],
    };
    const snapshot = await this.repository.getSnapshot(now);
    const candidates = this.detector.detect(snapshot);
    result.detected = candidates.length;

    for (const candidate of candidates) {
      try {
        const claimed = await this.repository.claimCandidate(candidate, now);
        if (claimed) result.created += 1;
        else result.skipped += 1;
      } catch (error) {
        result.failed += 1;
        result.errors.push(messageOf(error));
      }
    }

    // A tick may detect many latent issues at once (especially after a deploy).
    // Cap interruptions while leaving the rest queued for a later catch-up.
    if (isQuietTime(now, snapshot.profile.quietHoursStart, snapshot.profile.quietHoursEnd)) {
      const pending = await this.repository.listPendingForDelivery(now, 5);
      result.deferredQuietHours = pending.length;
      return result;
    }

    // The repository atomically leases one row. Keeping the batch at one
    // preserves the product's one-interruption-per-tick contract and prevents
    // concurrent Vercel cron invocations from composing or sending the same nudge.
    const pending = await this.repository.claimPendingForDelivery(now, 1);
    let lastInterruptionAt = latestDeliveredAt(snapshot);
    for (const nudge of pending) {
      const leaseToken = nudge.deliveryLeaseToken;
      if (!leaseToken) {
        result.failed += 1;
        result.errors.push(`El nudge ${nudge.id} no tiene lease de entrega.`);
        continue;
      }
      const minimumGapMinutes = nudge.priority === "urgent" ? 5 : 15;
      if (lastInterruptionAt && now.getTime() - lastInterruptionAt.getTime() < minimumGapMinutes * 60_000) {
        try {
          await this.repository.releaseDeliveryLease(nudge.id, leaseToken);
        } catch (error) {
          result.failed += 1;
          result.errors.push(messageOf(error));
        }
        result.skipped += 1;
        continue;
      }
      try {
        const composed = await this.composer.compose(nudge, snapshot);
        // Composition may call a remote model. Revalidate the live target after
        // that delay and immediately before creating any durable notification.
        const stillOwned = await this.repository.saveComposedMessage(nudge.id, leaseToken, composed.body, now);
        if (!stillOwned) {
          result.skipped += 1;
          continue;
        }
        // In-app proactivity is durable even when push permission has not been granted yet.
        // The repository keeps this append idempotent across delivery retries.
        await this.repository.appendSystemMessage(nudge, composed);
        lastInterruptionAt = now;
        const delivery = await this.notifications.deliver(composed);
        if (!delivery.accepted) {
          result.skipped += 1;
          const attempted = Number(delivery.details?.attempted ?? 0);
          const pushErrors = Array.isArray(delivery.details?.errors) ? delivery.details.errors : [];
          if (attempted > 0 && pushErrors.length > 0) {
            // A real transport failed after subscriptions were found. Keep the
            // nudge queued for Push while appendSystemMessage stays idempotent.
            await this.repository.markFailed(nudge.id, leaseToken, delivery.reason ?? "Falló Web Push", new Date(now.getTime() + 15 * 60_000));
            continue;
          }
          // The durable in-app thread above is itself a successful delivery.
          // Push permission/configuration is optional and must not create an
          // endless retry loop or duplicate conversation messages.
          const finalized = await this.repository.markDelivered(nudge.id, leaseToken, now, {
            channel: "in_app",
            push: { accepted: false, reason: delivery.reason, ...(delivery.details ?? {}) },
          });
          if (finalized) result.delivered += 1;
          else result.failed += 1;
          continue;
        }
        const finalized = await this.repository.markDelivered(
          nudge.id,
          leaseToken,
          now,
          { channel: "in_app+web_push", ...(delivery.details ?? {}) },
        );
        if (finalized) result.delivered += 1;
        else result.failed += 1;
      } catch (error) {
        result.failed += 1;
        const message = messageOf(error);
        result.errors.push(message);
        await this.repository.markFailed(nudge.id, leaseToken, message, new Date(now.getTime() + 15 * 60_000));
      }
    }

    return result;
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Error desconocido";
}

function latestDeliveredAt(snapshot: Awaited<ReturnType<ProactivityRepository["getSnapshot"]>>): Date | undefined {
  return snapshot.existingNudges.reduce<Date | undefined>((latest, nudge) => {
    if (!nudge.lastDeliveredAt) return latest;
    const delivered = new Date(nudge.lastDeliveredAt);
    if (Number.isNaN(delivered.getTime())) return latest;
    return !latest || delivered > latest ? delivered : latest;
  }, undefined);
}
