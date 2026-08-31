import { describe, expect, it } from "vitest";

import { presentAgentResult, sanitizeAssistantMessage } from "./presenter";
import type { AgentTurnPlan } from "./types";

describe("agent presenter", () => {
  it("removes internal labels, identifiers and tool names", () => {
    const message = sanitizeAssistantMessage(
      "CONTEXTO RECUPERADO create_task clientSlug: gavilan, pending id: 7f8f31aa-2d1d-4a4e-8fd0-43ca7e50b139",
    );

    expect(message).not.toMatch(/CONTEXTO|create_task|clientSlug|pending|7f8f31aa|\bid\b/i);
    expect(message).toContain("pendiente");
  });

  it("enforces the deterministic word budget after model output", () => {
    const plan = {
      intent: "CREATIVE_CHAT",
      operation: "creative_feedback",
      allowedTools: [],
      maxWrites: 0,
      maxWords: 6,
      requiresClarification: false,
    } satisfies AgentTurnPlan;
    const result = presentAgentResult(plan, {
      message: "Yo iría mucho más directo y después sumaría apenas el contexto necesario.",
      capability: "creative",
      actions: [],
    });

    expect(result.message.trim().split(/\s+/)).toHaveLength(6);
  });

  it("humanizes workflow states and UTC timestamps from model prose", () => {
    const message = sanitizeAssistantMessage(
      "Estado actual: scheduled para 2026-08-31 19:00 UTC. Después queda ready.",
    );

    expect(message).toContain("programado");
    expect(message).toContain("listo");
    expect(message).not.toMatch(/scheduled|ready|UTC|2026-08-31/i);
  });
});
