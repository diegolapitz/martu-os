import { describe, expect, it, vi } from "vitest";

import type { AgentConversationStore, AgentModelProvider, AgentToolExecutor } from "./ports";
import type { AgentContext } from "./types";
import { AgentOrchestrator } from "./orchestrator";

const context = {
  now: "2026-08-29T15:00:00.000Z",
  clients: [{ id: "1", slug: "gavilan", name: "Gavilán", services: ["scripts"] }],
  currentClient: { id: "1", slug: "gavilan", name: "Gavilán", services: ["scripts"] },
  tasks: [], scripts: [], content: [], notes: [], meetings: [], metrics: [], campaigns: [], memories: [], recentMessages: [],
  profile: {
    language: "es-AR", formality: 2, preferredLength: "short", humor: 3, insistenceLevel: 3,
    quietHoursStart: "22:30", quietHoursEnd: "08:30", morningBriefingAt: "09:00", morningBriefingEnabled: true,
    middayCheckAt: "13:30", middayCheckEnabled: true,
    endOfDayEnabled: false, expressions: [], preferences: {},
  },
} satisfies AgentContext;

function conversationStore() {
  return {
    getOrCreateThread: vi.fn().mockResolvedValue("thread-1"),
    appendMessage: vi.fn().mockResolvedValue(undefined),
    buildContext: vi.fn().mockResolvedValue(context),
  } satisfies AgentConversationStore;
}

function toolExecutor() {
  return {
    execute: vi.fn().mockResolvedValue({ type: "change_deadline", summary: "Pasé el guion al viernes.", undoToken: "activity:1" }),
    undo: vi.fn(),
  } satisfies AgentToolExecutor;
}

describe("AgentOrchestrator", () => {
  it("never replays a turn through fallback after a tool already committed", async () => {
    const conversations = conversationStore();
    const tools = toolExecutor();
    const primary: AgentModelProvider = {
      mode: "real",
      async generate(input) {
        await input.executeTool({ callId: "1", name: "create_script_draft", arguments: { clientSlug: "gavilan", title: "Borrador" } }, input.mutationContext);
        throw new Error("Model connection closed after tool output");
      },
    };
    const fallback = { mode: "demo" as const, generate: vi.fn() } satisfies AgentModelProvider;

    const reply = await new AgentOrchestrator(conversations, tools, primary, fallback).run({ message: "Creá un borrador de guion para Gavilán", clientSlug: "gavilan" });

    expect(tools.execute).toHaveBeenCalledOnce();
    expect(fallback.generate).not.toHaveBeenCalled();
    expect(reply).toMatchObject({ mode: "real", undoToken: "activity:1", action: { type: "change_deadline" } });
    expect(reply.message).toContain("Pasé el guion al viernes");
  });

  it("does use DemoAgent when the real provider fails before any mutation", async () => {
    const fallback = {
      mode: "demo" as const,
      generate: vi.fn().mockResolvedValue({ message: "Respuesta demo", capability: "supervisor", actions: [] }),
    } satisfies AgentModelProvider;
    const primary: AgentModelProvider = { mode: "real", generate: vi.fn().mockRejectedValue(new Error("network")) };

    const reply = await new AgentOrchestrator(conversationStore(), toolExecutor(), primary, fallback).run({ message: "Ayudame a pensar una alternativa creativa para Gavilán.", clientSlug: "gavilan" });

    expect(fallback.generate).toHaveBeenCalledOnce();
    expect(reply).toMatchObject({ mode: "demo", message: "Respuesta demo" });
  });

  it("never trusts an action receipt fabricated by a model", async () => {
    const tools = toolExecutor();
    const provider: AgentModelProvider = {
      mode: "real",
      generate: vi.fn().mockResolvedValue({
        message: "Yo iría directo con la escapadita.",
        capability: "creative",
        actions: [{ type: "complete_task", summary: "Marqué algo como resuelto.", undoToken: "activity:fake" }],
      }),
    };

    const reply = await new AgentOrchestrator(conversationStore(), tools, provider).run({
      message: "Dame feedback corto sobre este texto.",
      clientSlug: "gavilan",
    });

    expect(tools.execute).not.toHaveBeenCalled();
    expect(reply.action).toBeUndefined();
    expect(reply.actions).toEqual([]);
    expect(reply.undoToken).toBeUndefined();
  });

  it("answers a simple contextual next step without paying for a model call", async () => {
    const contextual = {
      ...context,
      currentView: {
        pathname: "/clients/gavilan/contenido/143",
        clientSlug: "gavilan",
        clientName: "Gavilán",
        entityType: "content" as const,
        entityId: "143",
        entityTitle: "Reel · Tres señales de que necesitás cortar",
      },
      currentViewItem: {
        id: "143",
        type: "content" as const,
        title: "Reel · Tres señales de que necesitás cortar",
        clientId: "1",
        clientSlug: "gavilan",
        status: "scheduled",
        body: "Una pieza corta con tres señales y un cierre conversable.",
      },
    } satisfies AgentContext;
    const conversations = conversationStore();
    conversations.buildContext.mockResolvedValue(contextual);
    const provider = {
      mode: "real" as const,
      generate: vi.fn(),
    } satisfies AgentModelProvider;

    const reply = await new AgentOrchestrator(
      conversations,
      toolExecutor(),
      provider,
    ).run({
      message: "¿Cómo sigo con esto?",
      clientSlug: "gavilan",
      currentView: contextual.currentView,
    });

    expect(provider.generate).not.toHaveBeenCalled();
    expect(reply.message).toContain("Reel · Tres señales de que necesitás cortar");
    expect(reply.message).toMatch(/arranque|CTA/);
    expect(reply.message).not.toMatch(/scheduled|UTC|dueAt/);
    expect(reply.timings).toMatchObject({ fastPath: true });
  });

  it("returns a no-write timeout response when context retrieval stalls", async () => {
    vi.useFakeTimers();
    try {
      const conversations = conversationStore();
      conversations.buildContext.mockImplementation(() => new Promise<never>(() => undefined));
      const tools = toolExecutor();
      const provider = {
        mode: "real" as const,
        generate: vi.fn(),
      } satisfies AgentModelProvider;

      const result = new AgentOrchestrator(conversations, tools, provider).run({
        message: "¿Qué tengo que cerrar hoy?",
      });
      await vi.advanceTimersByTimeAsync(6_001);
      const reply = await result;

      expect(reply.timings).toMatchObject({ timedOut: true });
      expect(reply.message).toContain("no cambié nada");
      expect(provider.generate).not.toHaveBeenCalled();
      expect(tools.execute).not.toHaveBeenCalled();
      expect(conversations.appendMessage).toHaveBeenCalledTimes(2);
      expect(conversations.appendMessage.mock.calls[1]?.[0]).toMatchObject({
        role: "assistant",
        metadata: { timedOut: true },
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
