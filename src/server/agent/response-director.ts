import OpenAI from "openai";

import type { ResponseDirector } from "./ports";
import type { ResponseDirection } from "./types";

type Client = Pick<OpenAI, "responses">;

const examples = `Ejemplos de buen criterio:
- Pedido: “Tengo una reunión en una hora.” Evidencia: una decisión, un bloqueo y un próximo entregable. Dirección: conclusión que prepara la conversación; briefing corto; tres evidencias; ofrecer ayudar a ordenar preguntas, no ejecutar cambios.
- Pedido: “No llego hoy.” Evidencia: varios pendientes. Dirección: una prioridad clara; tono directo y cuidado; párrafo corto; ofrecer reordenar sólo como siguiente paso, sin cambiar fechas.
- Pedido: “¿Qué habíamos decidido?” Evidencia: una memoria confirmada. Dirección: responder primero la decisión; una evidencia; no recapitulación ni lista.`;

export class OpenAIResponseDirector implements ResponseDirector {
  private readonly client: Client;
  private readonly model: string;
  constructor(options?: { client?: Client; model?: string }) {
    this.client = options?.client ?? new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.model = options?.model ?? process.env.OPENAI_DIRECTOR_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-5-nano";
  }
  async direct(input: Parameters<ResponseDirector["direct"]>[0]): Promise<ResponseDirection> {
    const response = await this.client.responses.create({
      model: this.model, store: false, max_output_tokens: 900,
      reasoning: this.model.startsWith("gpt-5-nano") ? { effort: "minimal" } : undefined,
      instructions: `Sos Response Director de una Supervisora en español rioplatense. Convertís objetivo, evidencia y conversación en una especificación para otra modelo que redactará. No respondas a Martu, no habilites herramientas y no inventes evidencia. Priorizá una conclusión útil sobre recapitular.
Cuando el pedido busca evaluar evolución, rendimiento o estado (“cómo viene”, “cómo rindió”, “qué tal funcionó”), la conclusión debe ser comparativa sólo si hay baseline homogénea en la evidencia. Priorizá 2–3 señales, no una lista de métricas. Si no hay baseline, indicá esa limitación sin calificar como bueno, razonable o malo; respondé las señales observables primero y cualquier recomendación después. ${examples}`,
      input: JSON.stringify({ message: input.request.message, job: input.plan.requestPlan?.job, responseNeed: input.plan.requestPlan?.response, evidence: evidence(input), metrics: input.context.metrics.slice(0, 8), recent: input.context.recentMessages.slice(-4).map((m) => ({ role: m.role, content: m.content })) }),
      text: { format: { type: "json_schema", name: "response_direction", strict: true, schema } },
    }, input.signal ? { signal: input.signal } : undefined);
    return normalize(JSON.parse(response.output_text));
  }
}

export class DeterministicResponseDirector implements ResponseDirector {
  async direct(input: Parameters<ResponseDirector["direct"]>[0]): Promise<ResponseDirection> {
    const job = input.plan.requestPlan?.job;
    const items = evidence(input);
    const requested = input.plan.requestPlan?.response.type;
    const structure = requested === "briefing" || requested === "decision_support" || items.length >= 3 ? "briefing" : "paragraph";
    return { conclusion: job === "prepare_interaction" ? "Preparar a Martu con lo que necesita tener fresco." : job === "prioritize" ? "Tomar una postura sobre qué hacer primero, sin modificar nada." : "Dar una respuesta operativa con la evidencia más relevante.", depth: input.plan.requestPlan?.response.depth ?? "medium", tone: job === "reflect" ? "reflective" : "direct", maxWords: Math.min(input.plan.maxWords, structure === "briefing" ? 140 : 90), structure, evidence: items.slice(0, 4), offerNextAction: !input.plan.directToolCall && !input.plan.requiresClarification && requested === "decision_support" };
  }
}

function evidence(input: Parameters<ResponseDirector["direct"]>[0]): string[] {
  return [...input.context.meetings, ...input.context.memories.map((m) => ({ title: m.content })), ...input.context.tasks, ...input.context.scripts, ...input.context.content].map((item) => item.title).filter(Boolean).slice(0, 8);
}
function normalize(raw: unknown): ResponseDirection {
  const v = raw as Record<string, unknown>;
  const pick = <T extends string>(x: unknown, ok: readonly T[], fallback: T) => typeof x === "string" && ok.includes(x as T) ? x as T : fallback;
  return { conclusion: typeof v.conclusion === "string" ? v.conclusion : "Responder con evidencia disponible.", depth: pick(v.depth, ["short", "medium", "deep"], "medium"), tone: pick(v.tone, ["direct", "warm", "focused", "reflective"], "direct"), maxWords: typeof v.maxWords === "number" ? Math.max(30, Math.min(220, v.maxWords)) : 100, structure: pick(v.structure, ["paragraph", "briefing", "bullets", "question"], "paragraph"), evidence: Array.isArray(v.evidence) ? v.evidence.filter((x): x is string => typeof x === "string").slice(0, 5) : [], offerNextAction: v.offerNextAction === true };
}
const schema = { type: "object", additionalProperties: false, required: ["conclusion", "depth", "tone", "maxWords", "structure", "evidence", "offerNextAction"], properties: { conclusion: { type: "string" }, depth: { type: "string", enum: ["short", "medium", "deep"] }, tone: { type: "string", enum: ["direct", "warm", "focused", "reflective"] }, maxWords: { type: "integer", minimum: 30, maximum: 220 }, structure: { type: "string", enum: ["paragraph", "briefing", "bullets", "question"] }, evidence: { type: "array", items: { type: "string" }, maxItems: 5 }, offerNextAction: { type: "boolean" } } } as const;
