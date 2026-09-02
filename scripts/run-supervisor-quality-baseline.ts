import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { AgentOrchestrator } from "../src/server/agent/orchestrator";
import { OpenAIResponsesProvider } from "../src/server/agent/openai-provider";
import { AgentQualityEvaluator, type AgentQualitySample } from "../src/server/agent/evals/quality-evaluator";
import { AGENT_GOLDEN_SCENARIOS } from "../src/server/agent/evals/golden-scenarios";
import type { AgentConversationStore, AgentToolExecutor } from "../src/server/agent/ports";
import type { AgentActionReceipt, AgentContext, AgentContextItem, AgentMemory, AgentRequest, ToolCall } from "../src/server/agent/types";

const NOW = new Date("2026-08-29T15:00:00.000Z");
const clients = [
  { id: "1", slug: "gavilan", name: "Gavilán", services: ["strategy", "ideas-planning", "scripts", "content-creation", "publishing", "metrics-reporting", "meta-ads"] },
  { id: "2", slug: "luma-estudio", name: "Luma Estudio", services: ["ideas-planning", "scripts", "recording", "editing"] },
];
const availableEvidence = [
  "Gavilán tiene abierta la tarea: Cerrar tercer guion de Gavilán.",
  "Gavilán tiene abierta la tarea: Revisar copy de Gavilán.",
  "La primera tarea representa al Guion 3 · Escapadita; no deben contarse como dos pendientes.",
];

async function main() {
  const harness = createIsolatedHarness();
  const samples: AgentQualitySample[] = [];

  for (const scenario of AGENT_GOLDEN_SCENARIOS.filter((scenario) => scenario.id !== "undo")) {
    const reply = await harness.agent.run({ ...scenario.request, now: NOW, createNewThread: true });
    samples.push({
      id: scenario.id,
      userMessage: scenario.request.message,
      assistantMessage: reply.message,
      expectedIntent: scenario.expectedIntent,
      actualIntent: reply.intent ?? "unknown",
      expectedTools: scenario.expectedTool ? [scenario.expectedTool] : [],
      actualTools: harness.drainToolNames(),
      currentView: describeCurrentView(scenario.request),
      availableEvidence,
      maximumWords: scenario.maximumWords,
    });
  }

  await harness.agent.run({
    message: "A Gavilán no le gustan los videos institucionales. Acordate.",
    clientSlug: "gavilan",
    now: NOW,
    createNewThread: true,
  });
  harness.drainToolNames();
  const memoryReply = await harness.agent.run({
    message: "Dame una idea para Gavilán.",
    clientSlug: "gavilan",
    now: NOW,
  });
  samples.push({
    id: "memory_continuity",
    userMessage: "Dame una idea para Gavilán.",
    assistantMessage: memoryReply.message,
    expectedIntent: "CREATIVE_CHAT",
    actualIntent: memoryReply.intent ?? "unknown",
    expectedTools: [],
    actualTools: harness.drainToolNames(),
    knownMemories: ["A Gavilán no le gustan los videos institucionales."],
    availableEvidence,
    maximumWords: 60,
  });

  const evaluator = new AgentQualityEvaluator();
  const results = [];
  for (const sample of samples) results.push({ id: sample.id, ...(await evaluator.evaluate(sample)) });
  const overall = results.reduce((total, result) => total + result.overall, 0) / results.length;
  const target = resolve(".data/agent-evals/quality-baseline.json");
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    mode: "isolated-in-memory",
    primaryModel: process.env.OPENAI_MODEL ?? "gpt-5-nano",
    evaluatorModel: process.env.OPENAI_EVAL_MODEL ?? "gpt-5-mini",
    overall,
    results,
  }, null, 2)}\n`, "utf8");
  process.stdout.write(`Quality baseline: ${results.length} casos · ${overall.toFixed(2)}/5\n`);
}

function createIsolatedHarness() {
  const memories: AgentMemory[] = [];
  const toolCalls: ToolCall[] = [];
  const conversations: AgentConversationStore = {
    getOrCreateThread: async () => "quality-baseline",
    appendMessage: async () => undefined,
    buildContext: async (input) => {
      const client = clients.find((candidate) => candidate.slug === input.clientSlug || candidate.slug === input.currentView?.clientSlug);
      const currentViewItem = currentViewItemFrom(input);
      return {
        now: input.now.toISOString(), clients, currentClient: client,
        currentView: input.currentView,
        currentViewItem,
        tasks: [
          item("task-1", "task", "Cerrar tercer guion de Gavilán", "gavilan", "pending", { entity_id: "script-3" }),
          item("task-2", "task", "Revisar copy de Gavilán", "gavilan", "in_progress"),
        ],
        scripts: [item("script-3", "script", "Guion 3 · Escapadita", "gavilan", "review")],
        content: [], notes: [], meetings: [], metrics: [], campaigns: [],
        memories: memories.filter((memory) => memory.scope === "global" || memory.clientId === client?.id),
        profile: {
          language: "es-AR", formality: 2, preferredLength: "short", humor: 3, insistenceLevel: 3,
          quietHoursStart: "22:30", quietHoursEnd: "08:30", morningBriefingAt: "09:00", morningBriefingEnabled: true,
          middayCheckAt: "13:30", middayCheckEnabled: true, endOfDayEnabled: false, expressions: ["che"], preferences: {},
        },
        recentMessages: [],
        lastReferencedEntity: input.contextEntity,
        summary: client?.name ?? "Vista global",
      } satisfies AgentContext;
    },
  };
  const tools: AgentToolExecutor = {
    execute: async (call) => {
      toolCalls.push(call);
      if (call.name === "save_memory") {
        memories.push({
          id: `memory-${memories.length + 1}`,
          scope: call.arguments.scope === "client" ? "client" : "global",
          category: String(call.arguments.category), content: String(call.arguments.content), importance: Number(call.arguments.importance ?? 0.8),
          clientId: call.arguments.clientSlug === "gavilan" ? "1" : null,
        });
      }
      return receiptFor(call);
    },
    undo: async () => ({ type: "undo", summary: "Deshice el último cambio." }),
  };
  return {
    agent: new AgentOrchestrator(conversations, tools, new OpenAIResponsesProvider()),
    drainToolNames: () => toolCalls.splice(0).map((call) => call.name),
  };
}

function item(id: string, type: AgentContextItem["type"], title: string, clientSlug: string, status: string, metadata?: Record<string, unknown>): AgentContextItem {
  return { id, type, title, clientSlug, clientId: "1", status, dueAt: "2026-08-29T20:00:00.000Z", metadata };
}

function currentViewItemFrom(request: AgentRequest): AgentContextItem | undefined {
  const view = request.currentView;
  if (!view?.entityId || !view.entityType || !view.entityTitle) return undefined;
  return { id: view.entityId, type: view.entityType, title: view.entityTitle, clientId: view.clientId, clientSlug: view.clientSlug, status: "open" };
}

function receiptFor(call: ToolCall): AgentActionReceipt {
  if (call.name === "change_deadline") {
    return {
      type: call.name,
      summary: "Pasé “Guion 3 · Escapadita” al viernes.",
      entity: { id: "script-3", type: "script", title: "Guion 3 · Escapadita", clientSlug: "gavilan" },
      undoToken: "activity:reschedule-script-3",
    };
  }
  const entity = call.arguments.targetId
    ? { id: String(call.arguments.targetId), type: String(call.arguments.targetType ?? "task") as AgentContextItem["type"], title: "Elemento de evaluación", clientSlug: String(call.arguments.clientSlug ?? "gavilan") }
    : undefined;
  return { type: call.name, summary: "Cambio aplicado.", entity };
}

function describeCurrentView(request: AgentRequest) {
  const view = request.currentView;
  return view?.entityTitle ? `${view.clientName ?? view.clientSlug ?? ""} · ${view.entityType ?? ""} · ${view.entityTitle}` : undefined;
}

void main().catch(async (error) => {
  const message = error instanceof Error ? error.message : "No se pudo correr el baseline cualitativo.";
  const target = resolve(".data/agent-evals/quality-baseline.error.txt");
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${message}\n`, "utf8");
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
