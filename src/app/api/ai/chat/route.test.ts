import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  run: vi.fn(),
  getNudge: vi.fn(),
}));

vi.mock("@/server/agent/runtime", () => ({
  getMartuRuntime: () => ({
    agent: { run: mocks.run },
    nudges: { getNudge: mocks.getNudge },
  }),
}));

import { POST } from "./route";

describe("POST /api/ai/chat", () => {
  beforeEach(() => {
    mocks.run.mockReset().mockResolvedValue({
      mode: "demo",
      message: "Listo.",
      capability: "supervisor",
      threadId: "thread-new",
      actions: [],
    });
    mocks.getNudge.mockReset();
  });

  it("preserves explicit entity, scope and fresh-thread intent", async () => {
    const request = new Request("http://localhost/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Pasalo al viernes.",
        clientSlug: "gavilan",
        pathname: "/clients/gavilan/guiones/73",
        createNewThread: true,
        contextScope: "client",
        contextEntity: {
          id: 73,
          type: "script",
          title: "Guion abierto",
          clientSlug: "gavilan",
        },
        currentView: {
          pathname: "/clients/gavilan/ideas/52",
          section: "ideas",
          clientId: 1,
          clientSlug: "gavilan",
          clientName: "Gavilán",
          entityType: "idea",
          entityId: 52,
          entityTitle: "Microhistorias",
        },
      }),
    });

    const result = await POST(request);

    expect(result.status).toBe(200);
    expect(mocks.run).toHaveBeenCalledWith({
      message: "Pasalo al viernes.",
      clientSlug: "gavilan",
      pathname: "/clients/gavilan/guiones/73",
      threadId: undefined,
      createNewThread: true,
      turnId: undefined,
      contextScope: "client",
      contextEntity: {
        id: "73",
        type: "script",
        title: "Guion abierto",
        clientId: undefined,
        clientSlug: "gavilan",
      },
      currentView: {
        pathname: "/clients/gavilan/ideas/52",
        section: "ideas",
        clientId: "1",
        clientSlug: "gavilan",
        clientName: "Gavilán",
        entityType: "idea",
        entityId: "52",
        entityTitle: "Microhistorias",
      },
      source: "web",
      metadata: undefined,
    });
  });
});
