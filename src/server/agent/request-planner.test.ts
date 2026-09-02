import { describe, expect, it } from "vitest";

import { DeterministicRequestPlanner, normalizePlan } from "./request-planner";
import { planRetrieval } from "./retrieval-planner";
import type { AgentPlanningContext, AgentTurnPlan } from "./types";

const context = {
  now: "2026-09-02T15:00:00.000Z",
  clients: [{ id: "client-1", slug: "gavilan", name: "Gavilán", services: ["scripts", "content-creation"] }],
  recentMessages: [],
} satisfies AgentPlanningContext;

describe("Request Planner", () => {
  it("understands meeting preparation as a broad job, not a pending-work intent", async () => {
    const plan = await new DeterministicRequestPlanner().plan({
      request: { message: "¿Qué tengo que saber de Gavilán? Tengo una reunión en una hora." },
      context,
    });
    expect(plan).toMatchObject({
      job: "prepare_interaction",
      scope: "client",
      clientSlug: "gavilan",
      sideEffectsExplicitlyRequested: false,
      response: { type: "briefing" },
    });
    expect(plan.informationNeeds).toEqual(expect.arrayContaining(["meetings", "memories", "work"]));
  });

  it("rejects a planner-invented client and keeps it ambiguous", () => {
    const plan = normalizePlan({
      job: "prepare_interaction", scope: "client", clientSlug: "cliente-inventado", relevantEntities: [],
      timeHorizon: { kind: "upcoming", detail: "en una hora" }, informationNeeds: ["meetings"],
      ambiguities: ["Cliente no confirmado"], requiresClarification: true, sideEffectsExplicitlyRequested: false,
      response: { type: "briefing", depth: "medium" },
    }, context);
    expect(plan.clientSlug).toBeUndefined();
    expect(plan.requiresClarification).toBe(true);
  });

  it("turns needs into a bounded retrieval plan", () => {
    const turn = { intent: "READ", operation: "read_general", allowedTools: [], maxWrites: 0, maxWords: 120, requiresClarification: false } satisfies AgentTurnPlan;
    const retrieval = planRetrieval({
      job: "prepare_interaction", scope: "client", clientSlug: "gavilan", relevantEntities: [],
      timeHorizon: { kind: "upcoming" }, informationNeeds: ["meetings", "memories", "work"], ambiguities: [],
      requiresClarification: false, sideEffectsExplicitlyRequested: false, response: { type: "briefing", depth: "medium" },
    }, turn);
    expect(retrieval.sources).toEqual(expect.arrayContaining(["meetings", "memories", "work", "thread", "profile"]));
    expect(retrieval.sources).not.toContain("metrics");
  });
});
