import { describe, expect, it, vi } from "vitest";

import type { AgentConversationStore, AgentModelInput, AgentModelResult, AgentToolExecutor } from "./ports";
import { AgentOrchestrator } from "./orchestrator";
import type { AgentActionReceipt, AgentContext, AgentMemory, ToolCall } from "./types";
import { AGENT_GOLDEN_SCENARIOS, FORBIDDEN_AGENT_OUTPUT } from "./evals/golden-scenarios";

const NOW = new Date("2026-08-29T15:00:00.000Z");
const clients = [
  {
    id: "1",
    slug: "gavilan",
    name: "Gavilán",
    services: ["strategy", "ideas-planning", "scripts", "content-creation", "publishing", "metrics-reporting", "meta-ads"],
  },
  {
    id: "2",
    slug: "luma-estudio",
    name: "Luma Estudio",
    services: ["ideas-planning", "scripts", "recording", "editing"],
  },
];

describe("Agent V1 mandatory golden evals", () => {
  for (const scenario of AGENT_GOLDEN_SCENARIOS.filter((item) => item.id !== "undo")) {
    it(`${scenario.id}: routes safely, stays concise and never exposes internals`, async () => {
      const harness = createHarness();
      const reply = await harness.agent.run({ ...scenario.request, now: NOW });
      const writes = harness.toolCalls.length + harness.undoCalls.length;

      expect(reply.intent).toBe(scenario.expectedIntent);
      expect(writes).toBeLessThanOrEqual(scenario.maximumWrites);
      expect(wordCount(reply.message)).toBeLessThanOrEqual(scenario.maximumWords);
      expect(reply.message).not.toMatch(FORBIDDEN_AGENT_OUTPUT);
      expect(reply.timings).toEqual(expect.objectContaining({
        totalMs: expect.any(Number),
        routingMs: expect.any(Number),
        contextMs: expect.any(Number),
        toolMs: expect.any(Number),
      }));
      if (scenario.expectedTool) expect(harness.toolCalls.map((call) => call.name)).toEqual([scenario.expectedTool]);
      else expect(harness.toolCalls).toHaveLength(0);
      if (scenario.expectedTool || scenario.expectedIntent === "AMBIGUOUS" || scenario.id === "scope") {
        expect(harness.provider.generate).not.toHaveBeenCalled();
        expect(reply.timings?.fastPath).toBe(true);
      } else {
        expect(harness.provider.generate).toHaveBeenCalledOnce();
        expect(reply.timings?.fastPath).toBe(false);
      }
    });
  }

  it("READ returns one to four useful items with zero writes", async () => {
    const harness = createHarness();
    const reply = await harness.agent.run({ message: "¿Qué tengo que cerrar hoy de Gavilán?", now: NOW });
    const numberedItems = reply.message.split("\n").filter((line) => /^\d+\./.test(line));

    expect(reply.intent).toBe("READ");
    expect(numberedItems.length).toBeGreaterThanOrEqual(1);
    expect(numberedItems.length).toBeLessThanOrEqual(4);
    expect(harness.toolCalls).toHaveLength(0);
    expect(harness.provider.generate).toHaveBeenCalledOnce();
  });

  it("READ does not repeat an entity when a linked task already represents it", async () => {
    const harness = createHarness();
    const reply = await harness.agent.run({ message: "¿Qué tengo que cerrar hoy de Gavilán?", now: NOW });

    expect(reply.message).toContain("Cerrar tercer guion de Gavilán");
    expect(reply.message).not.toContain("Guion 3 · Escapadita");
  });

  it("AMBIGUOUS and ambiguous HUMAN turns ask instead of writing", async () => {
    const harness = createHarness();
    const reschedule = await harness.agent.run({ message: "Pasalo al viernes.", now: NOW });
    const human = await harness.agent.run({ message: "Ya está, lo terminé.", now: NOW });

    expect(reschedule.intent).toBe("AMBIGUOUS");
    expect(human.intent).toBe("AMBIGUOUS");
    expect(`${reschedule.message} ${human.message}`).toMatch(/\?|qu[eé]/i);
    expect(harness.toolCalls).toHaveLength(0);
  });

  it("MEMORY is durable across a new creative turn without enabling tools", async () => {
    const harness = createHarness();
    const remembered = await harness.agent.run({ message: "A Gavilán no le gustan los videos institucionales. Acordate.", now: NOW });
    const writesAfterMemory = harness.toolCalls.length;
    const idea = await harness.agent.run({ message: "Dame una idea para Gavilán.", now: NOW });

    expect(remembered.intent).toBe("MEMORY");
    expect(harness.memories.some((memory) => /no le gustan los videos institucionales/i.test(memory.content))).toBe(true);
    expect(idea.intent).toBe("CREATIVE_CHAT");
    expect(idea.message).toMatch(/evitar[ií]a lo institucional/i);
    expect(harness.toolCalls).toHaveLength(writesAfterMemory);
    expect(harness.exposedTools.at(-1)).toEqual([]);
  });

  it("MEMORY can explicitly override page context and stay global", async () => {
    const harness = createHarness();
    await harness.agent.run({
      message: "En general prefiero respuestas cortas. Acordate.",
      clientSlug: "gavilan",
      now: NOW,
    });

    expect(harness.toolCalls).toEqual([
      expect.objectContaining({
        name: "save_memory",
        arguments: expect.objectContaining({ scope: "global", clientSlug: null, category: "preference" }),
      }),
    ]);
  });

  it("SCOPE refuses ROAS when the client has no paid-media service", async () => {
    const harness = createHarness();
    const reply = await harness.agent.run({ message: "¿Cómo viene el ROAS de Luma?", now: NOW });

    expect(reply.intent).toBe("ANALYSIS");
    expect(reply.message).toBe("A Luma Estudio no le manejás pauta, así que no tengo ROAS para ese cliente.");
    expect(harness.toolCalls).toHaveLength(0);
    expect(harness.provider.generate).not.toHaveBeenCalled();
  });

  it("CREATIVE_CHAT exposes zero tools and gives short human feedback", async () => {
    const harness = createHarness();
    const reply = await harness.agent.run({
      message: "Este arranque no me convence. Yo empezaría directo con la escapadita. ¿Vos qué pensás?",
      clientSlug: "gavilan",
      now: NOW,
    });

    expect(reply.intent).toBe("CREATIVE_CHAT");
    expect(harness.exposedTools.at(-1)).toEqual([]);
    expect(harness.toolCalls).toHaveLength(0);
    expect(reply.message).toMatch(/escapad/i);
    expect(reply.timings?.fastPath).toBe(false);
    expect(wordCount(reply.message)).toBeLessThanOrEqual(100);
  });

  it("CURRENT_VIEW keeps an open idea grounded during model composition", async () => {
    const harness = createHarness();
    const reply = await harness.agent.run({
      message: "No sé cómo seguir con esto.",
      clientSlug: "gavilan",
      currentView: {
        pathname: "/clients/gavilan/ideas/idea-7",
        section: "ideas",
        clientSlug: "gavilan",
        clientName: "Gavilán",
        entityType: "idea",
        entityId: "idea-7",
        entityTitle: "Serie de microhistorias behind the scenes",
      },
      now: NOW,
    });

    expect(reply.message).toContain("Serie de microhistorias behind the scenes");
    expect(harness.toolCalls).toHaveLength(0);
    expect(harness.provider.generate).toHaveBeenCalledOnce();
    expect(reply.timings?.fastPath).toBe(false);
  });

  it("HUMAN pressure asks Martu to prioritize without coaching or mutations", async () => {
    const harness = createHarness();
    const reply = await harness.agent.run({ message: "No llego ni en pedo hoy.", clientSlug: "gavilan", now: NOW });

    expect(reply.intent).toBe("CREATIVE_CHAT");
    expect(reply.message).toMatch(/priori|mover/i);
    expect(harness.toolCalls).toHaveLength(0);
    expect(harness.provider.generate).toHaveBeenCalledOnce();
    expect(reply.timings?.fastPath).toBe(false);
  });

  it("PREFERENCE lowers insistence explicitly instead of treating it as small talk", async () => {
    const harness = createHarness();
    const reply = await harness.agent.run({ message: "No me jodas más con esto.", now: NOW });

    expect(reply.intent).toBe("MEMORY");
    expect(harness.toolCalls).toEqual([
      expect.objectContaining({
        name: "update_communication_profile",
        arguments: expect.objectContaining({ insistenceLevel: 0.2, preferenceKey: "reduced_from_chat" }),
      }),
    ]);
    expect(reply.message).not.toMatch(/cancel|olvid/i);
    expect(harness.provider.generate).not.toHaveBeenCalled();
  });

  it("MULTITURN preserves memory, prioritizes the visible object, and undoes only the last action", async () => {
    const harness = createHarness();
    const view = {
      pathname: "/clients/gavilan/scripts/script-3",
      section: "scripts",
      clientSlug: "gavilan",
      clientName: "Gavilán",
      entityType: "script" as const,
      entityId: "script-3",
      entityTitle: "Guion 3 · Escapadita",
    };

    await harness.agent.run({ message: "A Gavilán no le gustan los videos institucionales. Acordate.", now: NOW });
    const idea = await harness.agent.run({ message: "Dame una idea para Gavilán.", createNewThread: true, now: NOW });
    const action = await harness.agent.run({ message: "Pasalo al viernes.", clientSlug: "gavilan", currentView: view, now: NOW });
    const undo = await harness.agent.run({ message: "No, deshacelo.", clientSlug: "gavilan", now: NOW });
    const pressure = await harness.agent.run({ message: "No llego ni en pedo hoy.", clientSlug: "gavilan", now: NOW });

    expect(idea.message).toMatch(/evitar[ií]a lo institucional/i);
    expect(action.action).toMatchObject({ type: "change_deadline", entity: { id: "script-3" } });
    expect(undo.message).toMatch(/deshice/i);
    expect(pressure.message).toMatch(/priori|mover/i);
    expect(harness.toolCalls.map((call) => call.name)).toEqual(["save_memory", "change_deadline"]);
    expect(harness.undoCalls).toEqual(["activity:reschedule-script-3"]);
  });

  it("OPEN_LOOP persists an idea without inventing a deadline", async () => {
    const harness = createHarness();
    const reply = await harness.agent.run({
      message: "Se me ocurrió una serie documental del detrás de escena. Después la vemos.",
      now: NOW,
    });
    const call = harness.toolCalls[0];

    expect(reply.intent).toBe("OPEN_LOOP");
    expect(call?.name).toBe("create_open_loop");
    expect(call?.arguments).not.toHaveProperty("dueAt");
    expect(call?.arguments).toMatchObject({ clientSlug: null, kind: "idea", salience: 3 });
    expect(reply.message).toContain("sin inventarle una fecha");
  });

  it("UNDO reverses exactly the last contextual action", async () => {
    const harness = createHarness();
    const completed = await harness.agent.run({
      message: "Ya está, lo terminé.",
      clientSlug: "gavilan",
      contextEntity: { id: "script-3", type: "script", title: "Guion 3 · Escapadita", clientSlug: "gavilan" },
      now: NOW,
    });
    const undone = await harness.agent.run({ message: "No, deshacelo.", clientSlug: "gavilan", now: NOW });

    expect(completed.action?.type).toBe("complete_task");
    expect(undone.intent).toBe("ACTION");
    expect(harness.undoCalls).toEqual(["activity:complete-script-3"]);
    expect(undone.message).toContain("Deshice");
    expect(undone.message).not.toMatch(FORBIDDEN_AGENT_OUTPUT);
  });
});

function createHarness() {
  const memories: AgentMemory[] = [];
  const toolCalls: ToolCall[] = [];
  const undoCalls: string[] = [];
  const exposedTools: string[][] = [];
  let lastReferencedEntity: AgentContext["lastReferencedEntity"];
  let lastUndoToken: string | undefined;

  const conversations: AgentConversationStore = {
    getOrCreateThread: vi.fn().mockResolvedValue("thread-golden"),
    appendMessage: vi.fn(async (input) => {
      if (input.role !== "assistant" || !Array.isArray(input.metadata?.actions)) return;
      const action = input.metadata.actions[0] as AgentActionReceipt | undefined;
      if (action?.entity) lastReferencedEntity = action.entity;
      if (action?.undoToken) lastUndoToken = action.undoToken;
    }),
    buildContext: vi.fn(async (input) => {
      const client = clients.find((item) => item.slug === input.clientSlug || item.slug === input.contextEntity?.clientSlug);
      return {
        now: input.now.toISOString(),
        clients,
        currentClient: client,
        tasks: [
          { id: "task-1", type: "task", title: "Cerrar tercer guion de Gavilán", clientId: "1", clientSlug: "gavilan", status: "pending", dueAt: "2026-08-29T20:00:00.000Z", metadata: { entity_id: "script-3" } },
          { id: "task-2", type: "task", title: "Revisar copy de Gavilán", clientId: "1", clientSlug: "gavilan", status: "in_progress", dueAt: "2026-08-30T15:00:00.000Z" },
          { id: "task-3", type: "task", title: "Editar reel de Luma", clientId: "2", clientSlug: "luma-estudio", status: "pending", dueAt: "2026-08-29T21:00:00.000Z" },
        ],
        scripts: [
          { id: "script-3", type: "script", title: "Guion 3 · Escapadita", clientId: "1", clientSlug: "gavilan", status: "review", dueAt: "2026-08-29T20:00:00.000Z" },
        ],
        content: [], notes: [], meetings: [], metrics: [], campaigns: [],
        memories: memories.filter((memory) => memory.scope === "global" || memory.clientId === client?.id),
        profile: {
          language: "es-AR", formality: 2, preferredLength: "short", humor: 3, insistenceLevel: 3,
          quietHoursStart: "22:30", quietHoursEnd: "08:30", morningBriefingAt: "09:00", morningBriefingEnabled: true,
          middayCheckAt: "13:30", middayCheckEnabled: true, endOfDayEnabled: false, expressions: ["che"], preferences: {},
        },
        recentMessages: [],
        currentView: input.currentView,
        currentViewItem: input.currentView?.entityId && input.currentView.entityType && input.currentView.entityTitle
          ? {
            id: input.currentView.entityId,
            type: input.currentView.entityType,
            title: input.currentView.entityTitle,
            clientId: input.currentView.clientId ?? undefined,
            clientSlug: input.currentView.clientSlug ?? undefined,
            status: "open",
          }
          : undefined,
        lastReferencedEntity: input.contextEntity ?? lastReferencedEntity,
        lastUndoToken,
        summary: client ? client.name : "Vista global",
      } satisfies AgentContext;
    }),
  };

  const tools: AgentToolExecutor = {
    execute: vi.fn(async (call) => {
      toolCalls.push(call);
      const targetId = String(call.arguments.targetId ?? `${call.name}-${toolCalls.length}`);
      const targetType = String(call.arguments.targetType ?? (call.name === "create_idea" ? "idea" : call.name === "create_open_loop" ? "open_loop" : "task")) as "task" | "script" | "content" | "commitment" | "idea" | "open_loop";
      if (call.name === "save_memory") {
        memories.push({
          id: `memory-${memories.length + 1}`,
          scope: call.arguments.scope === "client" ? "client" : "global",
          category: String(call.arguments.category),
          content: String(call.arguments.content),
          importance: Number(call.arguments.importance ?? 0.8),
          clientId: call.arguments.clientSlug === "gavilan" ? "1" : call.arguments.clientSlug === "luma-estudio" ? "2" : null,
        });
        return { type: "save_memory", summary: "Guardé esa decisión para tenerla presente." };
      }
      const title = ["create_idea", "create_open_loop"].includes(call.name) ? String(call.arguments.title) : targetId === "script-3" ? "Guion 3 · Escapadita" : "Elemento de prueba";
      const type = call.name === "complete_task" ? "complete_task" : call.name;
      return {
        type,
        summary: call.name === "change_deadline" ? `Pasé “${title}” al viernes.`
          : call.name === "complete_task" ? `Marqué “${title}” como resuelto.`
            : call.name === "create_idea" ? `Guardé la idea “${title}”.`
              : call.name === "create_open_loop" ? `Guardé el hilo abierto “${title}”.`
              : `Guardé “${title}”.`,
        entity: { id: targetId, type: targetType, title, clientSlug: String(call.arguments.clientSlug ?? "gavilan") },
        undoToken: ["change_deadline", "complete_task"].includes(call.name) ? `activity:${call.name === "complete_task" ? "complete" : "reschedule"}-${targetId}` : undefined,
      } satisfies AgentActionReceipt;
    }),
    undo: vi.fn(async (token) => {
      undoCalls.push(token);
      return { type: "undo", summary: "Deshice el cambio sobre “Guion 3 · Escapadita”." };
    }),
  };

  const generate = vi.fn(async (input: AgentModelInput): Promise<AgentModelResult> => {
      exposedTools.push([...input.plan.allowedTools]);
      const avoidsInstitutional = input.context.memories.some((memory) => /no le gustan los videos institucionales/i.test(memory.content));
      const currentItem = input.context.currentViewItem;
      if (/reuni[oó]n|en una hora/i.test(input.request.message)) return {
        message: "Para la reunión con Gavilán, llevaría frescas las decisiones recientes, el guion abierto y cualquier bloqueo. No veo nada que requiera un cambio ahora.",
        capability: "supervisor", actions: [],
      };
      if (currentItem) return {
        message: `Con “${currentItem.title}”, elegiría una escena concreta y un cierre antes de abrir otro frente.`,
        capability: "creative", actions: [],
      };
      if (input.plan.intent === "READ") return {
        message: "Hoy cerraría esto:\n1. Cerrar tercer guion de Gavilán\n2. Revisar copy de Gavilán",
        capability: "supervisor", actions: [],
      };
      if (input.request.message.toLocaleLowerCase("es-AR").includes("no llego")) return {
        message: "Priorizaría cerrar el tercer guion y movería lo demás después, sin tocar nada todavía.",
        capability: "supervisor", actions: [],
      };
      return {
        message: avoidsInstitutional
          ? "Sí. Evitaría lo institucional: iría directo a una escena concreta del detrás de escena."
          : "Sí, iría directo con la escapadita y después sumaría el contexto. El hook queda más claro.",
        capability: "creative",
        actions: [],
      };
    });
  const provider = {
    mode: "real" as const,
    generate,
  };

  return {
    agent: new AgentOrchestrator(conversations, tools, provider),
    provider,
    memories,
    toolCalls,
    undoCalls,
    exposedTools,
  };
}

function wordCount(value: string): number {
  return value.trim() ? value.trim().split(/\s+/).length : 0;
}
