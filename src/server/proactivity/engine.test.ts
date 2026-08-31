import { describe, expect, it, vi } from "vitest";

import type { CommunicationProfile } from "@/server/agent/types";

import { ProactivityEngine } from "./engine";
import type { NudgeCandidate, PersistedNudge, ProactivitySnapshot } from "./types";

const profile: CommunicationProfile = {
  language: "es-AR",
  formality: 2,
  preferredLength: "short",
  humor: 3,
  insistenceLevel: 3,
  quietHoursStart: "22:30",
  quietHoursEnd: "08:30",
  morningBriefingAt: "09:00",
  morningBriefingEnabled: true,
  middayCheckAt: "13:30",
  middayCheckEnabled: true,
  endOfDayEnabled: false,
  expressions: ["che", "dale"],
  preferences: {},
};

const snapshot: ProactivitySnapshot = {
  now: "2026-08-29T15:00:00.000Z",
  clients: [],
  tasks: [],
  commitments: [],
  reminders: [],
  content: [],
  meetingActions: [],
  metricOpportunities: [],
  existingNudges: [],
  profile,
};

const candidate: NudgeCandidate = {
  kind: "task_overdue",
  dedupeKey: "task_overdue:1:2026-08-29T14",
  priority: "urgent",
  title: "Cerrar un pendiente",
  facts: { title: "Cerrar un pendiente" },
  entityType: "task",
  entityId: "1",
  deepLink: "/day?assistant=open",
  dueAt: "2026-08-29T14:00:00.000Z",
  cooldownMinutes: 60,
  quickActions: ["complete"],
};

const persisted: PersistedNudge = {
  ...candidate,
  id: "9",
  status: "pending",
  deliveryLeaseToken: "lease-9",
  createdAt: "2026-08-29T14:00:00.000Z",
};

describe("ProactivityEngine", () => {
  it("treats the durable in-app message as delivered when Web Push is unavailable", async () => {
    const repository = {
      getSnapshot: vi.fn().mockResolvedValue(snapshot),
      claimCandidate: vi.fn().mockResolvedValue(persisted),
      listPendingForDelivery: vi.fn().mockResolvedValue([]),
      claimPendingForDelivery: vi.fn().mockResolvedValue([persisted]),
      releaseDeliveryLease: vi.fn().mockResolvedValue(true),
      saveComposedMessage: vi.fn().mockResolvedValue(true),
      markDelivered: vi.fn().mockResolvedValue(true),
      markFailed: vi.fn().mockResolvedValue(true),
      appendSystemMessage: vi.fn().mockResolvedValue(undefined),
    };
    const engine = new ProactivityEngine(
      repository,
      { detect: () => [candidate] },
      { compose: async () => ({ title: "Martu OS", body: "Un aviso", deepLink: persisted.deepLink, tag: persisted.dedupeKey, data: {} }) },
      { channel: "web_push", deliver: vi.fn().mockResolvedValue({ accepted: false, reason: "Sin suscripciones" }) },
    );

    const result = await engine.tick(new Date(snapshot.now));

    expect(repository.appendSystemMessage).toHaveBeenCalledOnce();
    expect(repository.markFailed).not.toHaveBeenCalled();
    expect(repository.markDelivered).toHaveBeenCalledWith("9", "lease-9", expect.any(Date), expect.objectContaining({ channel: "in_app" }));
    expect(result).toMatchObject({ created: 1, delivered: 1, skipped: 1, failed: 0 });
  });

  it("caps the delivery batch to avoid a post-catch-up notification burst", async () => {
    const repository = {
      getSnapshot: vi.fn().mockResolvedValue(snapshot),
      claimCandidate: vi.fn().mockResolvedValue(undefined),
      listPendingForDelivery: vi.fn().mockResolvedValue([]),
      claimPendingForDelivery: vi.fn().mockResolvedValue([]),
      releaseDeliveryLease: vi.fn().mockResolvedValue(true),
      saveComposedMessage: vi.fn(),
      markDelivered: vi.fn(),
      markFailed: vi.fn(),
      appendSystemMessage: vi.fn(),
    };
    const engine = new ProactivityEngine(
      repository,
      { detect: () => [] },
      { compose: vi.fn() },
      { channel: "web_push", deliver: vi.fn() },
    );

    await engine.tick(new Date(snapshot.now));

    expect(repository.claimPendingForDelivery).toHaveBeenCalledWith(expect.any(Date), 1);
  });

  it("retries a real Push transport failure without duplicating the in-app message", async () => {
    const repository = {
      getSnapshot: vi.fn().mockResolvedValue(snapshot), claimCandidate: vi.fn().mockResolvedValue(undefined),
      listPendingForDelivery: vi.fn().mockResolvedValue([]), claimPendingForDelivery: vi.fn().mockResolvedValue([persisted]),
      releaseDeliveryLease: vi.fn().mockResolvedValue(true),
      saveComposedMessage: vi.fn().mockResolvedValue(true),
      markDelivered: vi.fn().mockResolvedValue(true), markFailed: vi.fn().mockResolvedValue(true), appendSystemMessage: vi.fn(),
    };
    const engine = new ProactivityEngine(
      repository,
      { detect: () => [] },
      { compose: async () => ({ title: "Martu OS", body: "Un aviso", deepLink: persisted.deepLink, tag: persisted.dedupeKey, data: {} }) },
      { channel: "web_push", deliver: vi.fn().mockResolvedValue({ accepted: false, reason: "timeout", details: { attempted: 1, errors: ["timeout"] } }) },
    );

    await engine.tick(new Date(snapshot.now));

    expect(repository.appendSystemMessage).toHaveBeenCalledOnce();
    expect(repository.markFailed).toHaveBeenCalledWith("9", "lease-9", "timeout", expect.any(Date));
    expect(repository.markDelivered).not.toHaveBeenCalled();
  });

  it("applies a global interruption cooldown across scheduler ticks", async () => {
    const recentSnapshot = {
      ...snapshot,
      existingNudges: [{
        id: "8", dedupeKey: "other", status: "delivered" as const,
        lastDeliveredAt: "2026-08-29T14:59:00.000Z", createdAt: "2026-08-29T14:59:00.000Z",
      }],
    };
    const repository = {
      getSnapshot: vi.fn().mockResolvedValue(recentSnapshot), claimCandidate: vi.fn().mockResolvedValue(undefined),
      listPendingForDelivery: vi.fn().mockResolvedValue([]), claimPendingForDelivery: vi.fn().mockResolvedValue([persisted]), saveComposedMessage: vi.fn(),
      releaseDeliveryLease: vi.fn().mockResolvedValue(true),
      markDelivered: vi.fn(), markFailed: vi.fn(), appendSystemMessage: vi.fn(),
    };
    const composer = { compose: vi.fn() };
    const notifications = { channel: "web_push", deliver: vi.fn() };

    const result = await new ProactivityEngine(repository, { detect: () => [] }, composer, notifications)
      .tick(new Date(snapshot.now));

    expect(composer.compose).not.toHaveBeenCalled();
    expect(notifications.deliver).not.toHaveBeenCalled();
    expect(repository.releaseDeliveryLease).toHaveBeenCalledWith("9", "lease-9");
    expect(result.skipped).toBe(1);
  });
});
