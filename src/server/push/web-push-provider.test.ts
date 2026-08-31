import { describe, expect, it, vi } from "vitest";

import type { PushSubscriptionRepository } from "./types";
import { WebPushNotificationProvider, type WebPushTransport } from "./web-push-provider";

function repository(): PushSubscriptionRepository {
  return {
    upsert: vi.fn(),
    deleteByEndpoint: vi.fn().mockResolvedValue(true),
    listActive: vi.fn().mockResolvedValue([{ id: "1", endpoint: "https://push.example/sub", p256dh: "p".repeat(32), auth: "a".repeat(16) }]),
    markUsed: vi.fn(),
    markFailed: vi.fn(),
  };
}

describe("WebPushNotificationProvider", () => {
  it("delivers deep-link payloads to stored subscriptions", async () => {
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "public");
    vi.stubEnv("VAPID_PRIVATE_KEY", "private");
    const repo = repository();
    const transport: WebPushTransport = { configure: vi.fn(), send: vi.fn().mockResolvedValue({}) };
    const provider = new WebPushNotificationProvider(repo, transport);
    const result = await provider.deliver({
      title: "Martu OS",
      body: "Gavilán vence mañana.",
      deepLink: "/clients/gavilan?assistant=open",
      tag: "task:1",
      data: { nudgeId: "7", quickActions: ["do_now", "complete"] },
    });
    expect(result.accepted).toBe(true);
    expect(transport.send).toHaveBeenCalledOnce();
    expect(repo.markUsed).toHaveBeenCalledWith("1", expect.any(Date));
    expect(repo.markFailed).not.toHaveBeenCalled();
    expect(String(vi.mocked(transport.send).mock.calls[0][1])).toContain("/clients/gavilan?assistant=open");
    vi.unstubAllEnvs();
  });

  it("tracks a transient failure even when another subscription was delivered", async () => {
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "public");
    vi.stubEnv("VAPID_PRIVATE_KEY", "private");
    const repo = repository();
    vi.mocked(repo.listActive).mockResolvedValue([
      { id: "ok", endpoint: "https://push.example/ok", p256dh: "p".repeat(32), auth: "a".repeat(16) },
      { id: "failed", endpoint: "https://push.example/failed", p256dh: "q".repeat(32), auth: "b".repeat(16) },
    ]);
    const transport: WebPushTransport = {
      configure: vi.fn(),
      send: vi.fn().mockImplementation(async (subscription) => {
        if (subscription.endpoint.endsWith("/failed")) throw Object.assign(new Error("push service unavailable"), { statusCode: 503 });
        return {};
      }),
    };

    const result = await new WebPushNotificationProvider(repo, transport).deliver({
      title: "Martu OS", body: "Test", deepLink: "/day", tag: "test", data: { quickActions: [] },
    });

    expect(result).toMatchObject({
      accepted: true,
      details: { attempted: 2, delivered: 1, expired: 0, errors: ["push service unavailable"] },
    });
    expect(repo.markUsed).toHaveBeenCalledWith("ok", expect.any(Date));
    expect(repo.markFailed).toHaveBeenCalledWith("failed", expect.any(Date));
    expect(repo.deleteByEndpoint).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("expires gone browser subscriptions", async () => {
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "public");
    vi.stubEnv("VAPID_PRIVATE_KEY", "private");
    const repo = repository();
    const gone = Object.assign(new Error("gone"), { statusCode: 410 });
    const transport: WebPushTransport = { configure: vi.fn(), send: vi.fn().mockRejectedValue(gone) };
    const result = await new WebPushNotificationProvider(repo, transport).deliver({
      title: "Martu OS", body: "Test", deepLink: "/day", tag: "test", data: { quickActions: [] },
    });
    expect(result.accepted).toBe(false);
    expect(repo.deleteByEndpoint).toHaveBeenCalledWith("https://push.example/sub");
    expect(repo.markFailed).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});
