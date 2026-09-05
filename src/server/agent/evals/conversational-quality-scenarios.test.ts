import { describe, expect, it } from "vitest";

import { routeAgentTurn } from "../intent-router";
import { AgentOrchestrator } from "../orchestrator";
import type { AgentConversationStore, AgentModelProvider, AgentToolExecutor } from "../ports";
import type { AgentContext, RequestPlan } from "../types";
import { CONVERSATIONAL_QUALITY_SCENARIOS } from "./conversational-quality-scenarios";

const context = {
  now: "2026-09-05T12:00:00.000Z",
  clients: [{ id: "gavilan", slug: "gavilan", name: "Gavilán" }],
  currentClient: { id: "gavilan", slug: "gavilan", name: "Gavilán" },
  tasks: [], scripts: [], content: [], notes: [], meetings: [], metrics: [], campaigns: [], memories: [], recentMessages: [],
  profile: { language: "es-AR", formality: 2, preferredLength: "short", humor: 2, insistenceLevel: 2, quietHoursStart: "22:00", quietHoursEnd: "08:00", morningBriefingAt: "09:00", morningBriefingEnabled: true, middayCheckAt: "13:30", middayCheckEnabled: false, endOfDayEnabled: false, expressions: [], preferences: {} },
} satisfies AgentContext;

function semanticPlan(scenario: typeof CONVERSATIONAL_QUALITY_SCENARIOS[number]): RequestPlan {
  return {
    job: scenario.job,
    scope: "global",
    relevantEntities: [],
    timeHorizon: { kind: "unspecified" },
    informationNeeds: ["work"],
    ambiguities: scenario.shouldClarify ? ["Falta el objeto de la acción."] : [],
    requiresClarification: scenario.shouldClarify,
    sideEffectsExplicitlyRequested: scenario.sideEffect,
    response: { type: "answer", depth: "short" },
  };
}

describe("conversational quality contracts", () => {
  it("keeps a representative 24-scenario behavior battery", () => {
    expect(CONVERSATIONAL_QUALITY_SCENARIOS).toHaveLength(24);
  });

  it.each(CONVERSATIONAL_QUALITY_SCENARIOS)("routes $id according to its clarification contract", (scenario) => {
    const routed = routeAgentTurn({ message: scenario.message, now: new Date(context.now) }, context, semanticPlan(scenario));
    expect(routed.requiresClarification).toBe(scenario.shouldClarify);
    if (!scenario.sideEffect && !scenario.shouldClarify) expect(routed.allowedTools).toEqual([]);
  });

  it("answers a daily agenda question before asking anything back", async () => {
    const provider = {
      mode: "demo" as const,
      generate: async () => ({ message: "Mañana no tenés nada cargado por ahora. Si querés, dejamos ordenadas las tres cosas más importantes antes de cerrar hoy.", capability: "supervisor" as const, actions: [] }),
    } satisfies AgentModelProvider;
    const conversations: AgentConversationStore = {
      getOrCreateThread: async () => "quality-thread",
      appendMessage: async () => undefined,
      buildContext: async (input) => ({ ...context, now: input.now.toISOString() }),
    };
    const tools: AgentToolExecutor = {
      execute: async () => { throw new Error("No debe ejecutar herramientas."); },
      undo: async () => undefined,
    };

    const reply = await new AgentOrchestrator(conversations, tools, provider).run({
      message: "¿Qué tengo mañana?",
      now: new Date(context.now),
    });

    expect(reply.intent).toBe("READ");
    expect(reply.timings?.fastPath).toBe(false);
    expect(reply.message).toContain("Mañana no tenés nada cargado");
    expect(reply.message).not.toMatch(/qu[eé] quer[eé]s cambiar/i);
  });
});
