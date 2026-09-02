import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { SUPERVISOR_CAPABILITY_MATRIX, type CapabilityCase } from "../src/server/agent/evals/capability-matrix";
import { routeAgentTurn } from "../src/server/agent/intent-router";
import { OpenAIRequestPlanner } from "../src/server/agent/request-planner";
import { planRetrieval } from "../src/server/agent/retrieval-planner";
import type { AgentContext, AgentPlanningContext, RequestJob, RequestPlan } from "../src/server/agent/types";

const NOW = "2026-09-02T15:00:00.000Z";
const planningContext = {
  now: NOW,
  clients: [
    { id: "1", slug: "gavilan", name: "Gavilán", services: ["scripts", "content-creation", "metrics-reporting", "meta-ads"] },
    { id: "2", slug: "luma-estudio", name: "Luma Estudio", services: ["scripts"] },
  ],
  recentMessages: [
    { id: "m1", role: "user", content: "Probemos piezas más cortas para Gavilán.", createdAt: NOW },
    { id: "m2", role: "assistant", content: "Dale, queda como criterio de trabajo.", createdAt: NOW },
  ],
} satisfies AgentPlanningContext;

async function main() {
  const planner = new OpenAIRequestPlanner();
  const before = SUPERVISOR_CAPABILITY_MATRIX.map((sample) => evaluateLegacy(sample));
  const after = await Promise.all(SUPERVISOR_CAPABILITY_MATRIX.map(async (sample) => {
    const request = { message: sample.message, now: new Date(NOW) };
    const plan = await planner.plan({ request, context: planningContext });
    const context = contextFor(plan);
    const turn = routeAgentTurn(request, context, plan);
    const retrieval = planRetrieval(plan, turn);
    return evaluate(sample, plan, retrieval.sources);
  }));
  const report = { generatedAt: new Date().toISOString(), cases: SUPERVISOR_CAPABILITY_MATRIX.length, before: summarize(before), after: summarize(after), diagnostics: after };
  const target = resolve(".data/agent-evals/capability-matrix.json");
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(format(report));
}

function evaluateLegacy(sample: CapabilityCase) {
  const context = contextFor({ clientSlug: sample.clientSlug });
  const turn = routeAgentTurn({ message: sample.message, now: new Date(NOW) }, context);
  const job = turn.intent === "ANALYSIS" ? "analyze" : turn.intent === "ACTION" ? "modify" : turn.intent === "CAPTURE" ? "capture" : turn.intent === "READ" ? "orient" : "converse";
  return { job: sample.job, level: sample.level, pass: job === sample.job && Boolean(sample.sideEffect) === Boolean(turn.allowedTools.length) };
}

function evaluate(sample: CapabilityCase, plan: RequestPlan, sources: string[]) {
  const job = plan.job === sample.job;
  const scope = sample.scope === "unknown" ? plan.requiresClarification || plan.scope === "unknown" : plan.scope === sample.scope;
  const client = !sample.clientSlug || plan.clientSlug === sample.clientSlug;
  const needs = sample.informationNeeds.every((need) => sources.includes(need));
  const sideEffect = plan.sideEffectsExplicitlyRequested === sample.sideEffect;
  return { id: sample.id, job: sample.job, level: sample.level, split: sample.split, pass: job && scope && client && needs && sideEffect, checks: { job, scope, client, needs, sideEffect }, actual: { job: plan.job, scope: plan.scope, clientSlug: plan.clientSlug, sources, requiresClarification: plan.requiresClarification, sideEffectsExplicitlyRequested: plan.sideEffectsExplicitlyRequested } };
}

function contextFor(plan: Pick<RequestPlan, "clientSlug">): AgentContext {
  const currentClient = planningContext.clients.find((client) => client.slug === plan.clientSlug);
  return { ...planningContext, currentClient, tasks: [], scripts: [], content: [], notes: [], meetings: [], metrics: [], campaigns: [], memories: [], profile: { language: "es-AR", formality: 0, preferredLength: "medium", humor: 0, insistenceLevel: 0, quietHoursStart: "22:00", quietHoursEnd: "08:00", morningBriefingAt: "09:00", morningBriefingEnabled: false, middayCheckAt: "13:00", middayCheckEnabled: false, endOfDayEnabled: false, expressions: [], preferences: {} } };
}

function summarize(rows: Array<{ job: RequestJob; level: string; pass: boolean; checks?: Record<string, boolean> }>) {
  return Object.fromEntries([...new Set(rows.map((row) => row.job))].map((job) => {
    const group = rows.filter((row) => row.job === job);
    const score = group.reduce((sum, row) => sum + (row.checks ? Object.values(row.checks).filter(Boolean).length / Object.keys(row.checks).length : row.pass ? 1 : 0), 0) / group.length;
    return [job, { passed: group.filter((row) => row.pass).length, total: group.length, coverage: Number((score * 100).toFixed(1)) }];
  }));
}
function format(report: { cases: number; before: Record<string, { coverage: number }>; after: Record<string, { coverage: number }> }) {
  return `Capability benchmark: ${report.cases} casos\n${Object.entries(report.before).map(([job, value]) => `${job}: ${value.coverage}% → ${report.after[job]?.coverage ?? 0}%`).join("\n")}\n`;
}
void main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : "Benchmark falló."}\n`); process.exitCode = 1; });
