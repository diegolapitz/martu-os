import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  tick: vi.fn(async () => ({ generated: 1 })),
  query: vi.fn(async () => [{ id: "42" }]),
  runAsSystemUser: vi.fn(async (_id: string, work: () => Promise<unknown>) => work()),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ query: mocks.query }));
vi.mock("@/server/auth", () => ({ runAsSystemUser: mocks.runAsSystemUser }));
vi.mock("@/server/agent/runtime", () => ({
  getMartuRuntime: () => ({ proactivity: { tick: mocks.tick } }),
}));
vi.mock("@/server/proactivity/cron-auth", () => ({
  authorizeCron: () => ({ ok: true }),
}));

import { POST } from "./route";

describe("alpha scheduler identity", () => {
  it("binds the authorized cron to the sole personal workspace", async () => {
    const response = await POST(new Request("http://localhost/api/scheduler/tick", { method: "POST" }));
    expect(response.status).toBe(200);
    expect(mocks.runAsSystemUser).toHaveBeenCalledWith("42", expect.any(Function));
    expect(mocks.tick).toHaveBeenCalledOnce();
  });
});
