import OpenAI from "openai";

import type { RequestPlanner, RequestPlannerInput } from "./ports";
import type {
  AgentKnowledgeSource,
  AgentPlanningContext,
  RequestJob,
  RequestPlan,
  RequestScope,
  RequestTimeHorizon,
} from "./types";

const JOBS = ["orient", "prepare_interaction", "recall", "prioritize", "create", "review", "analyze", "plan", "modify", "capture", "follow_up", "reflect", "converse"] as const;
const SCOPES = ["global", "client", "entity", "unknown"] as const;
const TIME_HORIZONS = ["now", "today", "upcoming", "past", "range", "unspecified"] as const;
const KNOWLEDGE_SOURCES = ["work", "scripts", "content", "notes", "meetings", "memories", "metrics", "campaigns", "profile", "thread"] as const;

type ResponsesClient = Pick<OpenAI, "responses">;

/**
 * Semantic planner used before retrieval. Its output is intentionally unable
 * to name a tool: write authorization remains deterministic downstream.
 */
export class OpenAIRequestPlanner implements RequestPlanner {
  private readonly client: ResponsesClient;
  private readonly model: string;

  constructor(options?: { client?: ResponsesClient; model?: string; apiKey?: string }) {
    this.client = options?.client ?? new OpenAI({ apiKey: options?.apiKey ?? process.env.OPENAI_API_KEY });
    this.model = options?.model ?? process.env.OPENAI_PLANNER_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-5-nano";
  }

  async plan(input: RequestPlannerInput): Promise<RequestPlan> {
    const response = await this.client.responses.create({
      model: this.model,
      store: false,
      max_output_tokens: 2_000,
      reasoning: this.model.startsWith("gpt-5-nano") ? { effort: "minimal" } : undefined,
      instructions: `Sos el Request Planner de la Supervisora de Martu OS.
Tu único trabajo es comprender qué trabajo humano quiere resolver Martu ANTES de recuperar datos o permitir herramientas.
Generalizá por objetivo, no por frases ni por una lista creciente de intents. Elegí un job amplio.
Usá sólo clientes, objetos y contexto presentes en la evidencia. Si un cliente u objeto no está confirmado, no lo inventes: marcá ambigüedad o elegí unknown.
Un pedido de información, preparación, análisis, redacción o consejo no tiene side effect aunque pueda mencionar acciones. sideEffectsExplicitlyRequested es true sólo si Martu pidió explícitamente cambiar, crear, guardar, enviar, completar o reprogramar algo.
No autorices herramientas, no respondas a Martu y no incluyas razonamiento.` ,
      input: JSON.stringify({
        message: input.request.message,
        now: input.context.now,
        CURRENT_VIEW: compactCurrentView(input.context),
        thread: {
          scope: input.context.conversationScope ?? "global",
          client: input.context.conversationClient ? { slug: input.context.conversationClient.slug, name: input.context.conversationClient.name } : null,
          object: input.context.conversationEntity ? compactEntity(input.context.conversationEntity) : null,
          lastReferencedObject: input.context.lastReferencedEntity ? compactEntity(input.context.lastReferencedEntity) : null,
          recentMessages: input.context.recentMessages.slice(-8).map((message) => ({ role: message.role, content: message.content })),
        },
        knownClients: input.context.clients.map((client) => ({ slug: client.slug, name: client.name, services: client.services ?? [] })),
      }),
      text: { format: { type: "json_schema", name: "martu_request_plan", strict: true, schema: requestPlanSchema } },
    }, input.signal ? { signal: input.signal } : undefined);
    if (!response.output_text.trim()) throw new Error("El Request Planner no devolvió un plan.");
    const modelPlan = normalizePlan(JSON.parse(response.output_text), input.context);
    const evidencePlan = await new DeterministicRequestPlanner().plan(input);
    return reconcileWithEvidence(modelPlan, evidencePlan);
  }
}

/** Safe, dependency-free fallback for demo mode and planner outages. */
export class DeterministicRequestPlanner implements RequestPlanner {
  async plan(input: RequestPlannerInput): Promise<RequestPlan> {
    const message = normalize(input.request.message);
    const clientSlug = findClientSlug(message, input.context);
    const sideEffectsExplicitlyRequested = /\b(?:crea|creame|agrega|anota|anotame|guarda|guardame|marca|completa|termina|pasa(?:lo|la)?|reprograma|reagenda|cambia|move|deshace)\b/.test(message);
    const job: RequestJob = /\b(?:reunion|reuno|llamada|call|hablo|hablar|verme|juntar)\b/.test(message)
      ? "prepare_interaction"
      : /\b(?:recorda|acordamos|decidimos|que habiamos)\b/.test(message)
        ? "recall"
        : /\b(?:prioriza|prioridad|primero|no llego)\b/.test(message)
          ? "prioritize"
          : /\b(?:analiza|metricas?|rendimiento|roas|ctr|campana)\b/.test(message)
            ? "analyze"
            : /\b(?:revisa|feedback|que te parece|tono|cierre|arranque)\b/.test(message)
              ? "review"
              : /\b(?:planifica|plan|proximo paso)\b/.test(message)
                ? "plan"
                : /\b(?:anota|guarda|captura)\b/.test(message)
                  ? "capture"
                  : /\b(?:crea|arma|escribi|borrador)\b/.test(message)
                    ? "create"
                    : /\b(?:seguimiento|seguí|retomar|quedo de lo que hablamos)\b/.test(message)
                      ? "follow_up"
                      : /\b(?:aprendimos|patron|me esta trabando|reflexion)\b/.test(message)
                        ? "reflect"
                      : /\b(?:que tengo|que queda|pendiente|poneme al dia|novedades)\b/.test(message)
                        ? "orient"
                        : "converse";
    const informationNeeds = sourcesForJob(job);
    return {
      job,
      scope: clientSlug ? "client" : input.context.currentViewItem ? "entity" : input.context.conversationClient ? "client" : "global",
      clientSlug,
      relevantEntities: input.context.currentViewItem ? [{ type: input.context.currentViewItem.type, id: input.context.currentViewItem.id, title: input.context.currentViewItem.title }] : [],
      timeHorizon: { kind: /\b(?:hoy|ahora|en un rato|en una hora)\b/.test(message) ? "upcoming" : "unspecified" },
      informationNeeds,
      ambiguities: [],
      requiresClarification: false,
      sideEffectsExplicitlyRequested,
      response: { type: job === "prepare_interaction" ? "briefing" : job === "analyze" ? "analysis" : "answer", depth: job === "analyze" ? "deep" : "medium" },
    };
  }
}

/** Evidence-backed fields win over model guesses; this is normalization, not a phrase intent table. */
function reconcileWithEvidence(model: RequestPlan, evidence: RequestPlan): RequestPlan {
  const job = evidence.job !== "converse" ? evidence.job : model.job;
  const clientSlug = evidence.clientSlug ?? model.clientSlug;
  const scope = clientSlug ? (evidence.scope === "entity" ? "entity" : "client") : evidence.scope === "unknown" ? model.scope : evidence.scope;
  const informationNeeds = [...new Set([...sourcesForJob(job), ...model.informationNeeds])];
  return {
    ...model,
    job,
    scope,
    clientSlug,
    informationNeeds,
    // Do not ask when the request is grounded by visible evidence. Model-only
    // ambiguity is a common source of unnecessary clarification.
    requiresClarification: evidence.requiresClarification || (model.requiresClarification && !clientSlug && scope === "unknown"),
    sideEffectsExplicitlyRequested: evidence.sideEffectsExplicitlyRequested,
    relevantEntities: evidence.relevantEntities.length ? evidence.relevantEntities : model.relevantEntities,
    timeHorizon: evidence.timeHorizon.kind !== "unspecified" ? evidence.timeHorizon : model.timeHorizon,
    response: evidence.job !== "converse" ? evidence.response : model.response,
  };
}

export function normalizePlan(raw: unknown, context: AgentPlanningContext): RequestPlan {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("El Request Planner devolvió un objeto inválido.");
  const value = raw as Record<string, unknown>;
  const job = enumValue(value.job, JOBS, "converse");
  const scope = enumValue(value.scope, SCOPES, "unknown");
  const rawClientSlug = stringValue(value.clientSlug);
  const clientSlug = resolveClient(rawClientSlug, context) ?? findClientSlug(normalize(rawClientSlug ?? ""), context);
  const informationNeeds = arrayOfEnum(value.informationNeeds, KNOWLEDGE_SOURCES);
  const time = objectValue(value.timeHorizon);
  const response = objectValue(value.response);
  return {
    job,
    scope: clientSlug && scope === "unknown" ? "client" : scope,
    clientSlug,
    relevantEntities: normalizeEntities(value.relevantEntities, context),
    timeHorizon: { kind: enumValue(time?.kind, TIME_HORIZONS, "unspecified"), detail: stringValue(time?.detail) },
    informationNeeds: informationNeeds.length ? informationNeeds : sourcesForJob(job),
    ambiguities: stringArray(value.ambiguities),
    requiresClarification: value.requiresClarification === true,
    sideEffectsExplicitlyRequested: value.sideEffectsExplicitlyRequested === true,
    response: {
      type: enumValue(response?.type, ["answer", "briefing", "decision_support", "draft", "review", "analysis", "confirmation"] as const, "answer"),
      depth: enumValue(response?.depth, ["short", "medium", "deep"] as const, "medium"),
    },
  };
}

export function sourcesForJob(job: RequestJob): AgentKnowledgeSource[] {
  switch (job) {
    case "prepare_interaction": return ["work", "scripts", "content", "notes", "meetings", "memories", "thread"];
    case "orient": return ["work", "scripts", "content", "meetings", "memories", "thread"];
    case "recall": return ["memories", "meetings", "notes", "thread"];
    case "prioritize": return ["work", "scripts", "content", "meetings"];
    case "review": return ["work", "scripts", "content", "notes", "thread"];
    case "analyze": return ["metrics", "campaigns", "content", "meetings", "memories"];
    case "plan": return ["work", "scripts", "content", "meetings", "memories"];
    case "follow_up": return ["work", "meetings", "memories", "thread"];
    case "reflect": return ["meetings", "memories", "notes", "thread"];
    default: return ["thread"];
  }
}

function compactCurrentView(context: AgentPlanningContext) {
  if (!context.currentView) return null;
  return {
    clientSlug: context.currentView.clientSlug,
    clientName: context.currentView.clientName,
    entityType: context.currentView.entityType,
    entityId: context.currentView.entityId,
    entityTitle: context.currentView.entityTitle,
    object: context.currentViewItem ? compactEntity(context.currentViewItem) : null,
  };
}

function compactEntity(entity: { id: string; type: string; title: string; clientSlug?: string | null }) {
  return { id: entity.id, type: entity.type, title: entity.title, clientSlug: entity.clientSlug ?? null };
}

function normalizeEntities(raw: unknown, context: AgentPlanningContext): RequestPlan["relevantEntities"] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const value = objectValue(item);
    const title = stringValue(value?.title);
    if (!title) return [];
    const view = context.currentViewItem;
    const id = stringValue(value?.id);
    const type = stringValue(value?.type);
    const grounded = id && view?.id === id ? view : undefined;
    return [{
      title: grounded?.title ?? title,
      id: grounded?.id,
      type: grounded?.type ?? (isEntityType(type) ? type : undefined),
    }];
  }).slice(0, 4);
}

function findClientSlug(message: string, context: AgentPlanningContext): string | undefined {
  return context.clients.find((client) => normalize(`${client.name} ${client.slug}`).split(/\s+/).some((name) => name.length >= 4 && new RegExp(`(?:^|\\b)${escapeRegExp(name)}(?:\\b|$)`).test(message)))?.slug
    ?? context.conversationClient?.slug;
}

function resolveClient(value: string | undefined, context: AgentPlanningContext): string | undefined {
  if (!value) return undefined;
  const normalized = normalize(value);
  return context.clients.find((client) => normalize(client.slug) === normalized || normalize(client.name) === normalized)?.slug;
}

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-AR").trim();
}

function enumValue<T extends readonly string[]>(value: unknown, values: T, fallback: T[number]): T[number] {
  return typeof value === "string" && (values as readonly string[]).includes(value) ? value as T[number] : fallback;
}
function stringValue(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function stringArray(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, 6) : []; }
function arrayOfEnum<T extends readonly string[]>(value: unknown, values: T): T[number][] { return Array.isArray(value) ? value.filter((item): item is T[number] => typeof item === "string" && (values as readonly string[]).includes(item)) : []; }
function objectValue(value: unknown): Record<string, unknown> | undefined { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined; }
function isEntityType(value: string | undefined): value is RequestPlan["relevantEntities"][number]["type"] { return Boolean(value && ["task", "script", "content", "commitment", "note", "idea", "open_loop", "meeting"].includes(value)); }
function escapeRegExp(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

const requestPlanSchema = {
  type: "object", additionalProperties: false,
  required: ["job", "scope", "clientSlug", "relevantEntities", "timeHorizon", "informationNeeds", "ambiguities", "requiresClarification", "sideEffectsExplicitlyRequested", "response"],
  properties: {
    job: { type: "string", enum: JOBS }, scope: { type: "string", enum: SCOPES }, clientSlug: { type: ["string", "null"] },
    relevantEntities: { type: "array", items: { type: "object", additionalProperties: false, required: ["type", "title", "id"], properties: { type: { type: ["string", "null"] }, title: { type: "string" }, id: { type: ["string", "null"] } } }, maxItems: 4 },
    timeHorizon: { type: "object", additionalProperties: false, required: ["kind", "detail"], properties: { kind: { type: "string", enum: TIME_HORIZONS }, detail: { type: ["string", "null"] } } },
    informationNeeds: { type: "array", items: { type: "string", enum: KNOWLEDGE_SOURCES }, maxItems: 10 },
    ambiguities: { type: "array", items: { type: "string" }, maxItems: 6 }, requiresClarification: { type: "boolean" }, sideEffectsExplicitlyRequested: { type: "boolean" },
    response: { type: "object", additionalProperties: false, required: ["type", "depth"], properties: { type: { type: "string", enum: ["answer", "briefing", "decision_support", "draft", "review", "analysis", "confirmation"] }, depth: { type: "string", enum: ["short", "medium", "deep"] } } },
  },
} as const;
