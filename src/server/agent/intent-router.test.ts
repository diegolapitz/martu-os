import { describe, expect, it } from "vitest";

import { routeAgentTurn } from "./intent-router";
import { authorizeToolCall } from "./policy";
import type { AgentContext, AgentIntent, AgentToolName } from "./types";

const NOW = new Date("2026-08-30T15:00:00.000Z");
const context = {
  now: NOW.toISOString(),
  clients: [
    { id: "1", slug: "gavilan", name: "Gavilán", services: ["ideas-planning", "scripts", "metrics-reporting"] },
    { id: "2", slug: "luma-estudio", name: "Luma Estudio", services: ["scripts", "editing"] },
  ],
  tasks: [], scripts: [], content: [], notes: [], meetings: [], metrics: [], campaigns: [], memories: [], recentMessages: [],
  profile: {
    language: "es-AR", formality: 2, preferredLength: "short", humor: 3, insistenceLevel: 3,
    quietHoursStart: "22:30", quietHoursEnd: "08:30", morningBriefingAt: "09:00", morningBriefingEnabled: true,
    middayCheckAt: "13:30", middayCheckEnabled: true, endOfDayEnabled: false, expressions: [], preferences: {},
  },
} satisfies AgentContext;

const taxonomy: Array<{ message: string; intent: AgentIntent; tools: AgentToolName[] }> = [
  { message: "¿Qué tengo que cerrar hoy de Gavilán?", intent: "READ", tools: [] },
  { message: "Creá una tarea para revisar el copy de Gavilán", intent: "ACTION", tools: ["create_task"] },
  { message: "Anotá que falta confirmar la locación de Gavilán", intent: "CAPTURE", tools: ["create_note"] },
  { message: "A Gavilán no le gustan los videos institucionales. Acordate.", intent: "MEMORY", tools: ["save_memory"] },
  { message: "Mañana voy a terminar el guion de Gavilán", intent: "COMMITMENT", tools: ["create_commitment"] },
  { message: "Se me ocurrió una serie. Después la vemos.", intent: "OPEN_LOOP", tools: ["create_open_loop"] },
  { message: "Guardá una idea para Gavilán: entrevistar viajeros", intent: "IDEA", tools: ["create_idea"] },
  { message: "Este hook no me convence. ¿Qué pensás?", intent: "CREATIVE_CHAT", tools: [] },
  { message: "Analizá el rendimiento de Gavilán", intent: "ANALYSIS", tools: [] },
  { message: "Pasalo al viernes", intent: "AMBIGUOUS", tools: [] },
];

describe("routeAgentTurn", () => {
  it.each(taxonomy)("routes $intent before exposing its exact tools", ({ message, intent, tools }) => {
    const result = routeAgentTurn({ message, now: NOW }, context);

    expect(result.intent).toBe(intent);
    expect(result.allowedTools).toEqual(tools);
    expect(result.maxWrites).toBe(tools.length ? 1 : 0);
  });

  it("pins a contextual side effect to the exact open entity", () => {
    const contextual = {
      ...context,
      currentClient: context.clients[0],
      lastReferencedEntity: { id: "script-3", type: "script", title: "Guion 3", clientSlug: "gavilan" },
    } satisfies AgentContext;
    const result = routeAgentTurn({ message: "Pasalo al viernes", now: NOW }, contextual);

    expect(result).toMatchObject({
      intent: "ACTION",
      clientSlug: "gavilan",
      entity: { id: "script-3", type: "script" },
      directToolCall: {
        name: "change_deadline",
        arguments: { targetId: "script-3", targetType: "script", clientSlug: "gavilan" },
      },
    });
  });

  it("resolves deictic language against CURRENT_VIEW before the pinned entity", () => {
    const contextual = {
      ...context,
      currentClient: context.clients[0],
      conversationScope: "client" as const,
      conversationClient: context.clients[0],
      conversationEntity: { id: "script-3", type: "script" as const, title: "Guion 3", clientSlug: "gavilan" },
    } satisfies AgentContext;
    const result = routeAgentTurn({
      message: "Pasalo al viernes",
      now: NOW,
      clientSlug: "gavilan",
      contextEntity: contextual.conversationEntity,
      currentView: {
        pathname: "/clients/gavilan/tareas/91",
        clientSlug: "gavilan",
        clientName: "Gavilán",
        entityType: "task",
        entityId: "91",
        entityTitle: "Definir locación",
      },
    }, contextual);

    expect(result).toMatchObject({
      intent: "ACTION",
      clientSlug: "gavilan",
      entity: { id: "91", type: "task", title: "Definir locación" },
      directToolCall: {
        name: "change_deadline",
        arguments: { targetId: "91", targetType: "task", clientSlug: "gavilan" },
      },
    });
  });

  it("keeps 'cómo sigo con esto' grounded in the open idea", () => {
    const contextual = {
      ...context,
      currentClient: context.clients[0],
      conversationScope: "client" as const,
      conversationClient: context.clients[0],
    } satisfies AgentContext;
    const result = routeAgentTurn({
      message: "¿Cómo sigo con esto?",
      now: NOW,
      clientSlug: "gavilan",
      currentView: {
        pathname: "/clients/gavilan/ideas/52",
        clientSlug: "gavilan",
        clientName: "Gavilán",
        entityType: "idea",
        entityId: "52",
        entityTitle: "Serie de microhistorias behind the scenes",
      },
    }, contextual);

    expect(result).toMatchObject({
      intent: "CREATIVE_CHAT",
      operation: "creative_feedback",
      clientSlug: "gavilan",
      entity: { id: "52", type: "idea", title: "Serie de microhistorias behind the scenes" },
    });
  });

  it("does not cross a fixed client scope from navigation alone", () => {
    const pinnedIdea = { id: "52", type: "idea" as const, title: "Microhistorias", clientSlug: "gavilan" };
    const contextual = {
      ...context,
      currentClient: context.clients[0],
      conversationScope: "client" as const,
      conversationClient: context.clients[0],
      conversationEntity: pinnedIdea,
    } satisfies AgentContext;
    const result = routeAgentTurn({
      message: "¿Cómo sigo con esto?",
      now: NOW,
      clientSlug: "gavilan",
      contextEntity: pinnedIdea,
      currentView: {
        pathname: "/clients/luma-estudio/ideas/88",
        clientSlug: "luma-estudio",
        clientName: "Luma Estudio",
        entityType: "idea",
        entityId: "88",
        entityTitle: "Antes y después",
      },
    }, contextual);

    expect(result).toMatchObject({
      clientSlug: "gavilan",
      entity: pinnedIdea,
    });
  });

  it("blocks a tool call that is not in the turn whitelist", () => {
    const creative = routeAgentTurn({ message: "Este hook no me convence. ¿Qué pensás?", now: NOW }, context);

    expect(() => authorizeToolCall(creative, context, {
      callId: "unsafe",
      name: "create_task",
      arguments: { title: "No debería existir" },
    })).toThrow(/no está habilitada/i);
  });
});
