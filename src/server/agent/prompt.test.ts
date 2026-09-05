import { describe, expect, it } from "vitest";

import { buildAgentInstructions, serializeAgentContext } from "./prompt";
import type { AgentContext, AgentTurnPlan } from "./types";

const context = {
  now: "2026-08-30T17:30:00.000Z",
  clients: [{ id: "1", slug: "gavilan", name: "Gavilán", services: ["ideas-planning"] }],
  currentClient: { id: "1", slug: "gavilan", name: "Gavilán", services: ["ideas-planning"] },
  conversationScope: "client",
  conversationClient: { id: "1", slug: "gavilan", name: "Gavilán", services: ["ideas-planning"] },
  conversationEntity: { id: "40", type: "idea", title: "Otra idea", clientSlug: "gavilan" },
  currentView: {
    pathname: "/clients/gavilan/ideas/52",
    section: "ideas",
    clientId: "1",
    clientSlug: "gavilan",
    clientName: "Gavilán",
    entityType: "idea",
    entityId: "52",
    entityTitle: "Serie de microhistorias behind the scenes",
  },
  currentViewItem: {
    id: "52",
    type: "idea",
    title: "Serie de microhistorias behind the scenes",
    clientId: "1",
    clientSlug: "gavilan",
    status: "developing",
    body: "Mostrar escenas mínimas del proceso y cerrar con una pregunta.",
  },
  tasks: [], scripts: [], content: [], notes: [], meetings: [], metrics: [], campaigns: [],
  memories: [{ id: "m1", scope: "client", category: "preference", content: "Gavilán prefiere escenas reales.", importance: 1, clientId: "1" }],
  recentMessages: [{ id: "r1", role: "user", content: "Antes hablamos de otra idea.", createdAt: "2026-08-30T17:00:00.000Z" }],
  profile: {
    language: "es-AR", formality: 2, preferredLength: "short", humor: 3, insistenceLevel: 3,
    quietHoursStart: "22:30", quietHoursEnd: "08:30", morningBriefingAt: "09:00", morningBriefingEnabled: true,
    middayCheckAt: "13:30", middayCheckEnabled: true, endOfDayEnabled: false, expressions: [], preferences: {},
  },
} satisfies AgentContext;

const plan = {
  intent: "CREATIVE_CHAT",
  operation: "creative_feedback",
  clientSlug: "gavilan",
  entity: context.currentViewItem,
  allowedTools: [],
  maxWrites: 0,
  maxWords: 100,
  requiresClarification: false,
} satisfies AgentTurnPlan;

describe("agent CURRENT_VIEW prompt", () => {
  it("puts the exact open idea ahead of conversation history while keeping memory separate", () => {
    const serialized = JSON.parse(serializeAgentContext(context)) as Record<string, unknown>;
    const currentView = serialized.CURRENT_VIEW as Record<string, unknown>;
    const conversation = serialized.CONVERSATION_CONTEXT as Record<string, unknown>;

    expect(currentView).toMatchObject({
      client_id: "1",
      client_name: "Gavilán",
      entity_type: "idea",
      entity_id: "52",
      entity_title: "Serie de microhistorias behind the scenes",
      object: { title: "Serie de microhistorias behind the scenes", detail: "Mostrar escenas mínimas del proceso y cerrar con una pregunta." },
    });
    expect(conversation).toMatchObject({ scope: "client", object: { title: "Otra idea" } });
    expect(serialized.memories).toEqual([{ scope: "client", category: "preference", fact: "Gavilán prefiere escenas reales." }]);
    expect(serialized.recentConversation).toEqual([{ role: "user", content: "Antes hablamos de otra idea." }]);
  });

  it("instructs deictic language to resolve against CURRENT_VIEW", () => {
    const instructions = buildAgentInstructions(context, plan);
    expect(instructions).toMatch(/“esto”.*resolvé primero contra CURRENT_VIEW/i);
    expect(instructions).toMatch(/historial de conversación y la memoria explícita son fuentes distintas/i);
  });

  it("keeps the editorial direction out of the visible response and blocks report language", () => {
    const instructions = buildAgentInstructions(context, plan, {
      conclusion: "Resolver la consulta de forma simple.",
      depth: "short",
      tone: "warm",
      maxWords: 70,
      structure: "paragraph",
      evidence: ["Una tarea real"],
      offerNextAction: true,
    });

    expect(instructions).toContain("Criterio editorial interno — no lo nombres ni lo expliques");
    expect(instructions).toMatch(/no empieces con “Conclusión”, “Evidencia”, “Señales”, “Observaciones”, “Análisis”/);
    expect(instructions).toContain("como máximo una pregunta de seguimiento");
    expect(instructions).toContain("no hables de “evidencia insuficiente”");
  });
});
