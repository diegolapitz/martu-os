import { describe, expect, it, vi } from "vitest";

import type { AgentContext } from "./types";
import { DemoAgentProvider } from "./demo-provider";
import { routeAgentTurn } from "./intent-router";

const baseContext: AgentContext = {
  now: "2026-08-29T15:00:00.000Z",
  clients: [{ id: "1", slug: "gavilan", name: "Gavilán" }],
  currentClient: { id: "1", slug: "gavilan", name: "Gavilán" },
  tasks: [
    { id: "10", type: "task", title: "Cerrar tercer guion de Gavilán", clientId: "1", clientSlug: "gavilan", status: "in_progress", dueAt: "2026-08-30T21:00:00.000Z" },
    { id: "11", type: "task", title: "Editar reel Laguna de los Patos", clientId: "1", clientSlug: "gavilan", status: "pending", dueAt: "2026-08-29T20:00:00.000Z" },
  ],
  scripts: [
    { id: "1", type: "script", title: "Guion viejo que no debe desplazar tareas", clientId: "1", clientSlug: "gavilan", status: "draft", dueAt: "2026-08-15T21:00:00.000Z" },
  ],
  content: [],
  notes: [],
  meetings: [],
  metrics: [{ id: "99", clientSlug: "gavilan", title: "Reel Laguna", reach: 8_189, views: 12_400, retention_rate: 0.71 }],
  campaigns: [{ id: "77", clientSlug: "gavilan", name: "Escapadas primavera", spend: 184_320, ctr: 0.013, cpa: 612.36, roas: 3.42 }],
  memories: [
    { id: "global", scope: "global", category: "style", content: "Martu prefiere mensajes cortos y directos.", importance: 1 },
    { id: "client", scope: "client", category: "decision", clientId: "1", content: "Gavilán decidió probar videos cortos y verticales antes que institucionales largos.", importance: 1 },
  ],
  profile: {
    language: "es-AR", formality: 0.2, preferredLength: "short", humor: 0.3,
    insistenceLevel: 0.7, quietHoursStart: "21:30", quietHoursEnd: "08:45",
    morningBriefingAt: "08:45", morningBriefingEnabled: true,
    middayCheckAt: "13:30", middayCheckEnabled: true, endOfDayEnabled: false,
    expressions: [], preferences: {},
  },
  recentMessages: [],
};

async function ask(message: string) {
  const context = structuredClone(baseContext);
  const request = { message, clientSlug: "gavilan", now: new Date(baseContext.now) };
  return new DemoAgentProvider().generate({
    request,
    context,
    plan: routeAgentTurn(request, context),
    mutationContext: { threadId: "1", clientSlug: "gavilan", source: "web", now: new Date(baseContext.now) },
    executeTool: vi.fn(),
  });
}

describe("DemoAgentProvider contextual answers", () => {
  it("prioritizes actionable tasks over stale draft scripts", async () => {
    const result = await ask("¿Qué tengo pendiente con Gavilán?");
    expect(result.message).toContain("Cerrar tercer guion de Gavilán");
    expect(result.message).not.toContain("Guion viejo");
  });

  it("prefers client decision memory over a coincidental global word match", async () => {
    const result = await ask("¿Por qué habíamos decidido hacer videos más cortos?");
    expect(result.message).toContain("Gavilán decidió probar videos cortos y verticales");
    expect(result.message).not.toContain("mensajes cortos");
  });

  it("describes metrics without exposing internal database fields", async () => {
    const result = await ask("Dame una hipótesis con estas métricas");
    expect(result.message).toContain("alcance: 8.189");
    expect(result.message).toContain("retención: 71%");
    expect(result.message).not.toMatch(/clientSlug|client_slug|id:/);
  });

  it("summarizes campaign performance with user-facing labels", async () => {
    const result = await ask("¿Qué harías con la pauta?");
    expect(result.message).toContain("inversión:");
    expect(result.message).toContain("CTR:");
    expect(result.message).not.toMatch(/clientSlug|client_id|seed_key/);
  });

  it("answers 'cómo sigo con esto' from the exact idea in CURRENT_VIEW", async () => {
    const context = structuredClone(baseContext);
    context.conversationScope = "client";
    context.conversationClient = context.currentClient;
    context.currentView = {
      pathname: "/clients/gavilan/ideas/52",
      clientSlug: "gavilan",
      clientName: "Gavilán",
      entityType: "idea",
      entityId: "52",
      entityTitle: "Serie de microhistorias behind the scenes",
    };
    context.currentViewItem = {
      id: "52",
      type: "idea",
      title: "Serie de microhistorias behind the scenes",
      clientId: "1",
      clientSlug: "gavilan",
      status: "developing",
      body: "Mostrar escenas mínimas del proceso.",
    };
    const request = {
      message: "¿Cómo sigo con esto?",
      clientSlug: "gavilan",
      currentView: context.currentView,
      now: new Date(baseContext.now),
    };

    const result = await new DemoAgentProvider().generate({
      request,
      context,
      plan: routeAgentTurn(request, context),
      mutationContext: { threadId: "1", clientSlug: "gavilan", source: "web", now: new Date(baseContext.now) },
      executeTool: vi.fn(),
    });

    expect(result.message).toContain("Serie de microhistorias behind the scenes");
    expect(result.message).toContain("Mostrar escenas mínimas del proceso");
    expect(result.message).not.toContain("Editar reel Laguna de los Patos");
  });

  it("reschedules the exact entity referenced by a notification", async () => {
    const executeTool = vi.fn().mockResolvedValue({
      type: "change_deadline",
      summary: "Pasé el tercer guion a mañana.",
      entity: { id: "10", type: "task", title: "Cerrar tercer guion de Gavilán" },
    });
    const context = structuredClone(baseContext);
    context.lastReferencedEntity = {
      id: "10",
      type: "task",
      title: "Cerrar tercer guion de Gavilán",
      clientSlug: "gavilan",
    };
    await new DemoAgentProvider().generate({
      request: { message: "Pasalo a mañana", clientSlug: "gavilan", now: new Date(baseContext.now) },
      context,
      plan: routeAgentTurn({ message: "Pasalo a mañana", clientSlug: "gavilan", now: new Date(baseContext.now) }, context),
      mutationContext: { threadId: "1", clientSlug: "gavilan", source: "web", now: new Date(baseContext.now) },
      executeTool,
    });
    expect(executeTool).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "change_deadline",
        arguments: expect.objectContaining({ targetId: "10" }),
      }),
      expect.any(Object),
    );
  });
});
