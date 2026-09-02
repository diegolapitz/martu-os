import OpenAI from "openai";

export const QUALITY_DIMENSIONS = [
  "naturalness",
  "brevity",
  "grounding",
  "intentCorrectness",
  "memory",
  "continuity",
  "currentView",
  "tone",
  "noHallucination",
  "noInternals",
  "insistence",
  "toolUse",
] as const;

export type QualityDimension = (typeof QUALITY_DIMENSIONS)[number];

export interface AgentQualitySample {
  id: string;
  userMessage: string;
  assistantMessage: string;
  expectedIntent: string;
  actualIntent: string;
  expectedTools: string[];
  actualTools: string[];
  currentView?: string;
  knownMemories?: string[];
  availableEvidence?: string[];
  maximumWords: number;
}

export interface AgentQualityScorecard {
  scores: Record<QualityDimension, number>;
  overall: number;
  summary: string;
  flags: string[];
}

type ResponsesClient = Pick<OpenAI, "responses">;

export class AgentQualityEvaluator {
  private readonly client: ResponsesClient;
  private readonly model: string;

  constructor(options?: { client?: ResponsesClient; model?: string; primaryModel?: string }) {
    this.client = options?.client ?? new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.model = options?.model ?? process.env.OPENAI_EVAL_MODEL ?? "gpt-5-mini";
    const primaryModel = options?.primaryModel ?? process.env.OPENAI_MODEL ?? "gpt-5-nano";
    if (this.model === primaryModel) throw new Error("El evaluator debe usar un modelo distinto al agente principal.");
  }

  async evaluate(sample: AgentQualitySample): Promise<AgentQualityScorecard> {
    const response = await this.client.responses.create({
      model: this.model,
      store: false,
      instructions: `Evaluás de forma independiente respuestas de la Supervisora de Martu OS.
Puntuá evidencia, no intenciones. Una respuesta es mejor si es natural en español rioplatense, breve, contextual y segura.
Penalizá inventar datos, revelar internals, ejecutar o afirmar acciones no pedidas y un tono de coach, corporativo o paternalista.
La puntuación 1 es inaceptable y 5 es excelente. Señalá sólo problemas accionables en flags.`,
      input: JSON.stringify(sample),
      max_output_tokens: 4_000,
      text: {
        format: {
          type: "json_schema",
          name: "supervisor_quality_scorecard",
          strict: true,
          schema: qualityScorecardSchema,
        },
      },
    });

    if (!response.output_text.trim()) {
      const reason = response.incomplete_details?.reason;
      throw new Error(`El evaluador no devolvió texto (${response.status}${reason ? `: ${reason}` : ""}).`);
    }
    return parseScorecard(response.output_text);
  }
}

const qualityScorecardSchema = {
  type: "object",
  additionalProperties: false,
  required: ["scores", "overall", "summary", "flags"],
  properties: {
    scores: {
      type: "object",
      additionalProperties: false,
      required: [...QUALITY_DIMENSIONS],
      properties: Object.fromEntries(QUALITY_DIMENSIONS.map((dimension) => [dimension, {
        type: "integer",
        minimum: 1,
        maximum: 5,
      }])),
    },
    overall: { type: "number", minimum: 1, maximum: 5 },
    summary: { type: "string" },
    flags: { type: "array", items: { type: "string" } },
  },
} as const;

function parseScorecard(raw: string): AgentQualityScorecard {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("El evaluador no devolvió un scorecard JSON válido.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("El evaluador no devolvió un scorecard válido.");
  }
  const record = value as Record<string, unknown>;
  const scores = record.scores;
  if (!scores || typeof scores !== "object" || Array.isArray(scores)) {
    throw new Error("El evaluador no devolvió puntuaciones válidas.");
  }
  const scoreRecord = scores as Record<string, unknown>;
  const normalizedScores = {} as Record<QualityDimension, number>;
  for (const dimension of QUALITY_DIMENSIONS) {
    const score = scoreRecord[dimension];
    if (!Number.isInteger(score) || Number(score) < 1 || Number(score) > 5) {
      throw new Error(`El evaluador devolvió una puntuación inválida para ${dimension}.`);
    }
    normalizedScores[dimension] = Number(score);
  }
  if (typeof record.overall !== "number" || record.overall < 1 || record.overall > 5) {
    throw new Error("El evaluador devolvió una puntuación general inválida.");
  }
  if (typeof record.summary !== "string" || !Array.isArray(record.flags) || !record.flags.every((flag) => typeof flag === "string")) {
    throw new Error("El evaluador devolvió un resumen inválido.");
  }
  return { scores: normalizedScores, overall: record.overall, summary: record.summary, flags: record.flags };
}
