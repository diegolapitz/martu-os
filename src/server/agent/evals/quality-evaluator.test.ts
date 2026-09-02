import { describe, expect, it, vi } from "vitest";

import { AgentQualityEvaluator, QUALITY_DIMENSIONS, type AgentQualitySample } from "./quality-evaluator";

const sample: AgentQualitySample = {
  id: "creative",
  userMessage: "Este arranque no me convence. ¿Qué pensás?",
  assistantMessage: "Sí, iría más directo: arrancá por la escapada y después sumá contexto.",
  expectedIntent: "CREATIVE_CHAT",
  actualIntent: "CREATIVE_CHAT",
  expectedTools: [],
  actualTools: [],
  currentView: "Gavilán · Guion · Escapadita",
  maximumWords: 60,
};

describe("AgentQualityEvaluator", () => {
  it("uses a second model with structured output and validates its scorecard", async () => {
    const scorecard = {
      scores: Object.fromEntries(QUALITY_DIMENSIONS.map((dimension) => [dimension, 5])),
      overall: 5,
      summary: "Breve y contextual.",
      flags: [],
    };
    const create = vi.fn().mockResolvedValue({ output_text: JSON.stringify(scorecard) });
    const evaluator = new AgentQualityEvaluator({
      model: "gpt-5-mini",
      client: { responses: { create } } as never,
    });

    await expect(evaluator.evaluate(sample)).resolves.toEqual(scorecard);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      model: "gpt-5-mini",
      store: false,
      text: expect.objectContaining({ format: expect.objectContaining({ type: "json_schema", strict: true }) }),
    }));
  });

  it("rejects the same model as the agent under test", () => {
    expect(() => new AgentQualityEvaluator({
      model: "gpt-5-mini",
      primaryModel: "gpt-5-mini",
      client: { responses: { create: vi.fn() } } as never,
    })).toThrow(/distinto/i);
  });
});
