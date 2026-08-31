import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  requireMartuSession: vi.fn(),
  getOnboardingBundle: vi.fn(),
  updateOnboarding: vi.fn(),
  createOnboardingClient: vi.fn(),
}));

vi.mock("@/server/auth", () => {
  class MartuAuthenticationError extends Error {
    readonly status = 401;
  }
  return {
    MartuAuthenticationError,
    requireMartuSession: mocks.requireMartuSession,
  };
});

vi.mock("@/server/onboarding", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/onboarding")>();
  return {
    ...original,
    getOnboardingBundle: mocks.getOnboardingBundle,
    updateOnboarding: mocks.updateOnboarding,
    createOnboardingClient: mocks.createOnboardingClient,
  };
});

import { POST as createClient } from "@/app/api/clients/route";

import { PATCH } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireMartuSession.mockResolvedValue({ userSlug: "martu" });
});

describe("onboarding API contract", () => {
  it("does not persist detected profile text before confirmation", async () => {
    const response = await PATCH(
      new Request("http://local.test/api/onboarding", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          profileText: "Hago contenido y pauta.",
          confirmedServiceIds: ["1", "2"],
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      message: "Confirmá lo que entendimos antes de guardarlo.",
    });
    expect(mocks.updateOnboarding).not.toHaveBeenCalled();
  });

  it("returns the compact client/setup contract on quick create", async () => {
    mocks.createOnboardingClient.mockResolvedValue({
      client: {
        id: "91",
        slug: "cliente-nuevo",
        name: "Cliente Nuevo",
        description: "",
        color: "#456789",
        logoUrl: null,
        serviceIds: ["1"],
      },
      setup: {
        completeness: 33,
        complete: ["identity", "services", "workflow"],
        pending: ["brief", "strategy"],
        sections: [],
        brief: null,
        strategy: null,
        channels: {
          instagram: null,
          metaAds: null,
          calendarConnected: false,
          firstPlanningDone: false,
        },
        strategyDeferred: false,
        nonBlocking: true,
      },
    });

    const response = await createClient(
      new Request("http://local.test/api/clients", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Cliente Nuevo",
          color: "#456789",
          serviceIds: ["1"],
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      client: { slug: "cliente-nuevo", serviceIds: ["1"] },
      setup: { nonBlocking: true },
    });
    expect(mocks.createOnboardingClient).toHaveBeenCalledWith(
      "martu",
      expect.objectContaining({
        name: "Cliente Nuevo",
        description: "",
        color: "#456789",
        serviceIds: ["1"],
      }),
    );
  });
});
