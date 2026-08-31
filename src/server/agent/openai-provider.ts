import OpenAI from "openai";
import { toResponseInputItems } from "openai/lib/responses/ResponseInputItems";
import type { ResponseFunctionToolCall, ResponseInputItem } from "openai/resources/responses/responses";

import type { AgentModelInput, AgentModelProvider, AgentModelResult } from "./ports";
import { safeToolError } from "./policy";
import { buildAgentInstructions, serializeAgentContext } from "./prompt";
import { agentToolDefinitionsFor } from "./tool-definitions";
import { isAgentToolName } from "./types";

export const DEFAULT_OPENAI_MODEL = "gpt-5-nano";
export const OPENAI_MAX_OUTPUT_TOKENS = 500;

export class OpenAIResponsesProvider implements AgentModelProvider {
  readonly mode = "real" as const;
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(options?: { apiKey?: string; model?: string; client?: OpenAI }) {
    this.client = options?.client ?? new OpenAI({ apiKey: options?.apiKey ?? process.env.OPENAI_API_KEY });
    this.model = options?.model ?? process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL;
  }

  async generate(input: AgentModelInput): Promise<AgentModelResult> {
    const actions: AgentModelResult["actions"] = [];
    const instructions = buildAgentInstructions(input.context, input.plan);
    const contextualInput = `Datos disponibles para responder:\n${serializeAgentContext(input.context)}\n\nMartu dice:\n${input.request.message}`;
    const tools = agentToolDefinitionsFor(input.plan.allowedTools);
    const toolChoice = tools.length ? "auto" as const : "none" as const;

    const conversation: ResponseInputItem[] = [{ role: "user", content: contextualInput }];
    let response = await this.client.responses.create({
      model: this.model,
      instructions,
      input: conversation,
      tools,
      tool_choice: toolChoice,
      parallel_tool_calls: false,
      store: false,
      max_output_tokens: OPENAI_MAX_OUTPUT_TOKENS,
      reasoning: this.model.startsWith("gpt-5-nano") ? { effort: "minimal" } : undefined,
    }, input.signal ? { signal: input.signal } : undefined);

    for (let iteration = 0; iteration < 3; iteration += 1) {
      const calls = response.output.filter(
        (item): item is ResponseFunctionToolCall => item.type === "function_call",
      );
      if (calls.length === 0) {
        return {
          message: response.output_text.trim() || "No llegué a una respuesta útil. Probemos de nuevo.",
          capability: inferCapability(input),
          actions,
        };
      }

      const toolOutputs: ResponseInputItem[] = [];
      for (const call of calls) {
        let output: Record<string, unknown>;
        if (!isAgentToolName(call.name) || !input.plan.allowedTools.includes(call.name)) {
          output = { ok: false, error: "Esa acción no está habilitada para este pedido." };
        } else {
          try {
            const args = JSON.parse(call.arguments) as Record<string, unknown>;
            const receipt = await input.executeTool(
              { callId: call.call_id, name: call.name, arguments: args },
              input.mutationContext,
            );
            actions.push(receipt);
            output = {
              ok: true,
              summary: receipt.summary,
              canUndo: Boolean(receipt.undoToken),
              entity: receipt.entity ? { type: receipt.entity.type, title: receipt.entity.title, client: receipt.entity.clientSlug } : undefined,
            };
          } catch (error) {
            output = { ok: false, error: safeToolError(error) };
          }
        }
        toolOutputs.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(output) });
      }

      conversation.push(...toResponseInputItems(response.output), ...toolOutputs);

      response = await this.client.responses.create({
        model: this.model,
        instructions,
        input: conversation,
        tools,
        tool_choice: toolChoice,
        parallel_tool_calls: false,
        store: false,
        max_output_tokens: OPENAI_MAX_OUTPUT_TOKENS,
        reasoning: this.model.startsWith("gpt-5-nano") ? { effort: "minimal" } : undefined,
      }, input.signal ? { signal: input.signal } : undefined);
    }

    throw new Error("La Supervisora excedió el límite seguro de acciones por turno.");
  }
}

function inferCapability(input: AgentModelInput): AgentModelResult["capability"] {
  if (input.plan.intent === "ANALYSIS") return "analyst";
  if (["IDEA", "OPEN_LOOP", "CREATIVE_CHAT"].includes(input.plan.intent)) return "creative";
  const normalized = input.request.message.toLocaleLowerCase("es-AR");
  if (/estrateg|audiencia|posicionamiento|pilar/.test(normalized)) return "strategist";
  return "supervisor";
}
