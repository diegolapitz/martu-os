import type OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";

import type { AgentContext } from "./types";
import { routeAgentTurn } from "./intent-router";
import { OpenAIResponsesProvider, OPENAI_MAX_OUTPUT_TOKENS } from "./openai-provider";

const context = {
  now: "2026-08-30T17:30:00.000Z",
  clients: [], tasks: [], scripts: [], content: [], notes: [], meetings: [], metrics: [], campaigns: [], memories: [], recentMessages: [],
  profile: {
    language: "es-AR", formality: 2, preferredLength: "short", humor: 3, insistenceLevel: 3,
    quietHoursStart: "22:30", quietHoursEnd: "08:30", morningBriefingAt: "09:00", morningBriefingEnabled: true,
    middayCheckAt: "13:30", middayCheckEnabled: true, endOfDayEnabled: false, expressions: [], preferences: {},
  },
} satisfies AgentContext;

describe("OpenAIResponsesProvider cost controls", () => {
  it("uses the cheapest GPT-5 model with minimal reasoning and a short output cap", async () => {
    const create = vi.fn().mockResolvedValue({ output: [], output_text: "Hola, Martu." });
    const client = { responses: { create } } as unknown as OpenAI;
    const provider = new OpenAIResponsesProvider({ client, model: "gpt-5-nano" });

    const request = { message: "Hola" };
    await provider.generate({
      request,
      context,
      plan: routeAgentTurn(request, context),
      mutationContext: { threadId: "thread-1", source: "web", now: new Date(context.now) },
      executeTool: vi.fn(),
    });

    expect(create.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      model: "gpt-5-nano",
      reasoning: { effort: "minimal" },
      max_output_tokens: OPENAI_MAX_OUTPUT_TOKENS,
      parallel_tool_calls: false,
      store: false,
      tools: [],
      tool_choice: "none",
    }));
  });

  it("exposes only the whitelist selected by the control plane", async () => {
    const create = vi.fn().mockResolvedValue({ output: [], output_text: "Dale." });
    const client = { responses: { create } } as unknown as OpenAI;
    const provider = new OpenAIResponsesProvider({ client, model: "gpt-5-nano" });
    const request = { message: "Creá una tarea: revisar el guion" };
    const plan = routeAgentTurn(request, context);

    await provider.generate({
      request,
      context,
      plan,
      mutationContext: { threadId: "thread-1", source: "web", now: new Date(context.now) },
      executeTool: vi.fn(),
    });

    const params = create.mock.calls[0]?.[0] as { tools?: Array<{ name: string }>; tool_choice?: string };
    expect(plan.allowedTools).toEqual(["create_task"]);
    expect(params.tools?.map((tool) => tool.name)).toEqual(["create_task"]);
    expect(params.tool_choice).toBe("auto");
  });
});
