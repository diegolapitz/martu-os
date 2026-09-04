import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/data", () => ({ query: queryMock }));
vi.mock("@/server/auth", () => ({ requireAppUserId: vi.fn(async () => "42") }));

import { MartuPushSubscriptionRepository } from "./data-repository";

describe("MartuPushSubscriptionRepository delivery health", () => {
  beforeEach(() => {
    queryMock.mockReset();
    queryMock.mockResolvedValue([]);
  });

  it("increments transient failures and expires the subscription on the third one", async () => {
    const at = new Date("2026-08-29T15:00:00.000Z");

    await new MartuPushSubscriptionRepository().markFailed("subscription-1", at);

    const [statement, params] = queryMock.mock.calls[0];
    expect(String(statement)).toContain("failure_count = failure_count + 1");
    expect(String(statement)).toContain("failure_count + 1 >= 3");
    expect(String(statement)).toContain("status = 'active'");
    expect(params).toEqual(["subscription-1", at.toISOString(), "42"]);
  });

  it("resets the failure counter after a successful delivery", async () => {
    const at = new Date("2026-08-29T15:05:00.000Z");

    await new MartuPushSubscriptionRepository().markUsed("subscription-1", at);

    const [statement, params] = queryMock.mock.calls[0];
    expect(String(statement)).toContain("failure_count = 0");
    expect(params).toEqual(["subscription-1", at.toISOString(), "42"]);
  });
});
