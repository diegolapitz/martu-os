import OpenAI from "openai";

import type { ResponseDirector } from "./ports";
import type { ResponseDirection } from "./types";

type Client = Pick<OpenAI, "responses">;

const examples = `Ejemplos de buen criterio editorial:
- Pedido: “Tengo una reunión en una hora.” Hay una decisión, un bloqueo y un próximo entregable. Respuesta central: dejar a Martu lista para la conversación; briefing corto; tres datos que sí necesita tener frescos; ofrecer ordenar preguntas, sin ejecutar cambios.
- Pedido: “¿Qué tengo que hacer mañana?” No hay tareas ni reuniones registradas. Respuesta central: decirlo simple, sin dramatizar ni hablar de datos faltantes; sugerir un paso útil para dejar mañana ordenado; como máximo una pregunta.
- Pedido: “No llego hoy.” Hay varios pendientes. Respuesta central: elegir una prioridad clara; tono directo y cuidado; párrafo corto; ofrecer reordenar sólo como siguiente paso, sin cambiar fechas.
- Pedido: “¿Qué habíamos decidido?” Hay una memoria confirmada. Respuesta central: responder primero la decisión; un dato de apoyo; sin recapitulación ni lista.`;

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
      instructions: `Sos Response Director de una Supervisora en español rioplatense. Convertís objetivo, contexto y conversación en una especificación editorial privada para otra modelo que redactará. No respondas a Martu, no habilites herramientas y no inventes información. Priorizá una respuesta útil y humana antes que una recapitulación.
La especificación nunca debe empujar a la redactora a mostrar razonamiento, metodología o etiquetas de informe. Ante información incompleta, elegí una forma simple de decir qué hay y un próximo paso útil; una aclaración sólo corresponde si realmente impide avanzar.
Cuando el pedido busca evaluar evolución, rendimiento o estado (“cómo viene”, “cómo rindió”, “qué tal funcionó”), la respuesta central debe ser comparativa sólo si hay una referencia homogénea disponible. Priorizá 2–3 señales, no una lista de métricas. Si no hay referencia, indicá esa limitación en lenguaje simple sin calificar como bueno, razonable o malo; primero contestá lo observable y recién después sugerí algo. ${examples}`,
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
    const structure = requested === "briefing" || requested === "decision_support" ? "briefing" : "paragraph";
    return { conclusion: job === "prepare_interaction" ? "Dejar a Martu lista con lo que necesita tener fresco." : job === "prioritize" ? "Decir qué conviene hacer primero y por qué, sin cambiar nada." : "Resolver el pedido de Martu con lo disponible y un paso útil si hace falta.", depth: input.plan.requestPlan?.response.depth ?? "medium", tone: job === "reflect" ? "reflective" : "warm", maxWords: Math.min(input.plan.maxWords, structure === "briefing" ? 140 : 90), structure, evidence: items.slice(0, 4), offerNextAction: !input.plan.directToolCall && !input.plan.requiresClarification && requested === "decision_support" };
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
