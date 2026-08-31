import { describe, expect, it, vi } from "vitest";

import { AgentActionService } from "./action-service";
import type { AgentMutationGateway } from "./ports";

describe("AgentActionService", () => {
  it("persists an open loop in its own domain instead of creating an idea", async () => {
    const createOpenLoop = vi.fn().mockResolvedValue({
      id: "41",
      type: "open_loop",
      title: "Serie documental detrás de escena",
      clientSlug: "gavilan",
      status: "open",
    });
    const gateway = { createOpenLoop } as unknown as AgentMutationGateway;
    const service = new AgentActionService(gateway);

    const receipt = await service.execute({
      callId: "turn-1",
      name: "create_open_loop",
      arguments: {
        clientSlug: "gavilan",
        title: "Serie documental detrás de escena",
        body: "Retomarlo cuando encaje.",
        kind: "idea",
        salience: 3,
      },
    }, {
      threadId: "thread-1",
      clientSlug: "gavilan",
      source: "web",
      now: new Date("2026-08-30T15:00:00.000Z"),
    });

    expect(createOpenLoop).toHaveBeenCalledWith(expect.objectContaining({
      clientSlug: "gavilan",
      title: "Serie documental detrás de escena",
      kind: "idea",
      salience: 3,
    }));
    expect(receipt).toMatchObject({
      type: "create_open_loop",
      summary: "Guardé el hilo abierto “Serie documental detrás de escena”.",
      entity: { type: "open_loop", id: "41" },
    });
  });
});
