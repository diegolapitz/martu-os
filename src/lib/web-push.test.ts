import { describe, expect, it, vi } from "vitest";
import { registerActivePushServiceWorker } from "@/lib/web-push";

function asRegistration(active: boolean) {
  return { active: active ? {} : null } as unknown as ServiceWorkerRegistration;
}

function asContainer(
  register: () => Promise<ServiceWorkerRegistration>,
  ready: Promise<ServiceWorkerRegistration>,
) {
  return {
    register,
    ready,
  } as unknown as ServiceWorkerContainer;
}

describe("registerActivePushServiceWorker", () => {
  it("uses an already-active registration immediately", async () => {
    const registration = asRegistration(true);
    const register = vi.fn().mockResolvedValue(registration);
    const container = asContainer(register, new Promise(() => undefined));

    await expect(registerActivePushServiceWorker(container)).resolves.toBe(registration);
    expect(register).toHaveBeenCalledWith("/sw.js");
  });

  it("waits for serviceWorker.ready before the first push subscription", async () => {
    const readyRegistration = asRegistration(true);
    const container = asContainer(
      vi.fn().mockResolvedValue(asRegistration(false)),
      Promise.resolve(readyRegistration),
    );

    await expect(registerActivePushServiceWorker(container)).resolves.toBe(readyRegistration);
  });

  it("fails clearly if the ready registration has no active worker", async () => {
    const container = asContainer(
      vi.fn().mockResolvedValue(asRegistration(false)),
      Promise.resolve(asRegistration(false)),
    );

    await expect(registerActivePushServiceWorker(container)).rejects.toThrow(
      "El service worker no llegó a activarse.",
    );
  });
});
