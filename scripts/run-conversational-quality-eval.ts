import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { AgentOrchestrator } from "../src/server/agent/orchestrator";
import { AgentQualityEvaluator, type AgentQualitySample } from "../src/server/agent/evals/quality-evaluator";
import { OpenAIResponsesProvider } from "../src/server/agent/openai-provider";
import type { AgentConversationStore, AgentToolExecutor } from "../src/server/agent/ports";
import { OpenAIRequestPlanner } from "../src/server/agent/request-planner";
import { OpenAIResponseDirector } from "../src/server/agent/response-director";
import type { AgentContext, AgentContextItem, AgentRequest, ToolCall } from "../src/server/agent/types";

const now = new Date("2026-09-04T14:00:00.000Z");
const tomorrow = "2026-09-05T15:00:00.000Z";

type Scenario = {
  id: string;
  message: string;
  tasks: Array<Pick<AgentContextItem, "title" | "status" | "dueAt" | "body">>;
  evidence: string[];
};

const scenarios: Scenario[] = [
  {
    id: "tomorrow_empty_agenda",
    message: "¿Qué tengo que hacer mañana?",
    tasks: [],
    evidence: ["No hay tareas ni reuniones cargadas para el 5 de septiembre."],
  },
  {
    id: "tomorrow_real_agenda",
    message: "¿Qué tengo que hacer mañana?",
    tasks: [
      { title: "Casa Norte · Cerrar brief comercial", status: "pending", dueAt: tomorrow, body: "Está vencido; desbloquea el inicio del trabajo." },
      { title: "Nido · Pedir avance del bloque B", status: "pending", dueAt: tomorrow, body: "Frena el siguiente paso." },
      { title: "Luma · Terminar tercer reel", status: "in_progress", dueAt: tomorrow, body: "Sigue en curso." },
    ],
    evidence: ["Casa Norte: brief comercial vencido.", "Nido: avance del bloque B pendiente.", "Luma: reel 3 en curso."],
  },
  {
    id: "ambiguous_priority",
    message: "¿Qué conviene priorizar?",
    tasks: [
      { title: "Casa Norte · Cerrar brief comercial", status: "pending", dueAt: tomorrow, body: "Está vencido y habilita el arranque." },
      { title: "Nido · Pedir avance del bloque B", status: "pending", dueAt: tomorrow, body: "Frena el próximo paso." },
      { title: "Luma · Terminar tercer reel", status: "in_progress", dueAt: tomorrow, body: "No tiene fecha límite confirmada." },
    ],
    evidence: ["Casa Norte está vencido y destraba trabajo.", "Nido bloquea próximos pasos.", "No hay fechas límite confirmadas para Luma."],
  },
  {
    id: "tomorrow_planning",
    message: "Ayudame a planificar mañana.",
    tasks: [
      { title: "Casa Norte · Cerrar brief comercial", status: "pending", dueAt: tomorrow, body: "Está vencido y habilita el arranque." },
      { title: "Nido · Pedir avance del bloque B", status: "pending", dueAt: tomorrow, body: "Frena el próximo paso." },
      { title: "Luma · Terminar tercer reel", status: "in_progress", dueAt: tomorrow, body: "Sigue en curso." },
    ],
    evidence: ["Casa Norte está vencido y destraba trabajo.", "Nido bloquea próximos pasos.", "Luma está en curso."],
  },
];

async function main() {
  const label = process.argv[2] ?? "current";
  const evaluator = new AgentQualityEvaluator();
  const results: Array<{ id: string; response: string; score: Awaited<ReturnType<AgentQualityEvaluator["evaluate"]>> }> = [];

  for (const scenario of scenarios) {
    const harness = createHarness(scenario.tasks);
    const reply = await harness.agent.run({ message: scenario.message, now, createNewThread: true });
    const sample: AgentQualitySample = {
      id: scenario.id,
      userMessage: scenario.message,
      assistantMessage: reply.message,
      expectedIntent: "READ",
      actualIntent: reply.intent ?? "unknown",
      expectedTools: [],
      actualTools: harness.toolNames,
      availableEvidence: scenario.evidence,
      maximumWords: 100,
    };
    results.push({ id: scenario.id, response: reply.message, score: await evaluator.evaluate(sample) });
  }

  const overall = results.reduce((sum, result) => sum + result.score.overall, 0) / results.length;
  const target = resolve(`.data/agent-evals/conversational-quality-${label}.json`);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify({ label, generatedAt: new Date().toISOString(), overall, results }, null, 2)}\n`, "utf8");
  process.stdout.write(`Conversational quality (${label}): ${results.length} escenarios · ${overall.toFixed(2)}/5\n`);
  for (const result of results) process.stdout.write(`\n[${result.id}] ${result.response}\n${result.score.overall}/5 — ${result.score.summary}\n`);
}

function createHarness(tasks: Scenario["tasks"]) {
  const toolNames: string[] = [];
  const conversations: AgentConversationStore = {
    getOrCreateThread: async () => "conversational-quality",
    appendMessage: async () => undefined,
    buildContext: async (input) => ({
      now: input.now.toISOString(),
      clients: [],
      tasks: tasks.map((task, index) => ({ id: `task-${index}`, type: "task", clientSlug: "", clientId: null, ...task })),
      scripts: [], content: [], notes: [], meetings: [], metrics: [], campaigns: [], memories: [], recentMessages: [],
      profile: { language: "es-AR", formality: 2, preferredLength: "short", humor: 2, insistenceLevel: 2, quietHoursStart: "22:30", quietHoursEnd: "08:30", morningBriefingAt: "09:00", morningBriefingEnabled: true, middayCheckAt: "13:30", middayCheckEnabled: false, endOfDayEnabled: false, expressions: [], preferences: {} },
    } satisfies AgentContext),
  };
  const tools: AgentToolExecutor = {
    execute: async (call: ToolCall) => { toolNames.push(call.name); throw new Error("No expected write tools in conversational eval."); },
    undo: async () => undefined,
  };
  return {
    agent: new AgentOrchestrator(conversations, tools, new OpenAIResponsesProvider(), undefined, new OpenAIRequestPlanner(), new OpenAIResponseDirector()),
    toolNames,
  };
}

void main();
