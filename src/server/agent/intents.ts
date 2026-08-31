import { normalizeSpanish, resolveRelativeDate } from "./date-language";
import type { AgentEntityRef, ClientRef } from "./types";

export type DemoIntent =
  | { type: "reschedule"; clientSlug?: string; entityType: "task" | "script" | "content" | "commitment"; ordinal?: number; query?: string; dueAt: string }
  | { type: "commitment"; clientSlug?: string; entityType: "task" | "script" | "content"; ordinal?: number; intent: string; dueAt: string; remindAt?: string }
  | { type: "complete"; clientSlug?: string; entityType: "task" | "script" | "content" | "commitment"; ordinal?: number; query?: string }
  | { type: "pending"; clientSlug?: string }
  | { type: "memory_question"; clientSlug?: string; topic: string }
  | { type: "metrics_question"; clientSlug?: string; topic: string }
  | { type: "ads_question"; clientSlug?: string; topic: string }
  | { type: "create_note"; clientSlug?: string; body: string }
  | { type: "create_idea"; clientSlug?: string; title: string; description?: string }
  | { type: "create_task"; clientSlug?: string; title: string; dueAt?: string }
  | { type: "save_memory"; clientSlug?: string; scope: "global" | "client"; category: string; content: string }
  | { type: "reduce_insistence" }
  | { type: "smalltalk" };

export interface IntentParsingContext {
  clients: ClientRef[];
  currentClientSlug?: string;
  now?: Date;
  lastReferencedEntity?: AgentEntityRef;
}

const ORDINALS: Array<[RegExp, number]> = [
  [/\b(?:primer|primero|1(?:er|ro)?|#?1)\b/, 1],
  [/\b(?:segundo|2(?:do)?|#?2)\b/, 2],
  [/\b(?:tercer|tercero|3(?:er|ro)?|#?3)\b/, 3],
  [/\b(?:cuarto|4(?:to)?|#?4)\b/, 4],
  [/\b(?:quinto|5(?:to)?|#?5)\b/, 5],
];

function inferOrdinal(normalized: string): number | undefined {
  return ORDINALS.find(([pattern]) => pattern.test(normalized))?.[1];
}

function inferClientSlug(normalized: string, context: IntentParsingContext): string | undefined {
  const explicit = context.clients.find((client) => {
    const canonical = [client.name, client.slug].map(normalizeSpanish);
    const aliases = [
      ...canonical,
      ...canonical.flatMap((value) => value.split(/[\s-]+/).filter((token) => token.length >= 4)),
    ];
    return aliases.some((alias) => normalized.includes(alias));
  });
  return explicit?.slug ?? context.currentClientSlug ?? context.lastReferencedEntity?.clientSlug ?? undefined;
}

function inferEntityType(normalized: string): "task" | "script" | "content" | "commitment" {
  if (/\bguion(?:es)?\b/.test(normalized)) return "script";
  if (/\b(?:reel|video|contenido|pieza)\b/.test(normalized)) return "content";
  if (/\b(?:promesa|compromiso)\b/.test(normalized)) return "commitment";
  return "task";
}

function stripCommandLead(value: string, patterns: RegExp[]): string {
  let result = value.trim();
  for (const pattern of patterns) result = result.replace(pattern, "").trim();
  return result.replace(/^[,:;\-\s]+/, "").trim();
}

export function parseDemoIntent(message: string, context: IntentParsingContext): DemoIntent {
  const normalized = normalizeSpanish(message);
  const now = context.now ?? new Date();
  const clientSlug = inferClientSlug(normalized, context);
  const ordinal = inferOrdinal(normalized);
  const inferredType = inferEntityType(normalized);
  const relativeDate = resolveRelativeDate(normalized, now);

  if (
    relativeDate &&
    /\b(?:pasa|pasalo|pasala|pasame|move|mover|cambia|cambiale|reprograma|reagenda|corre|correlo)\b/.test(normalized)
  ) {
    const fallbackType = context.lastReferencedEntity?.type;
    const entityType = inferredType === "task" && fallbackType && ["task", "script", "content", "commitment"].includes(fallbackType)
      ? (fallbackType as "task" | "script" | "content" | "commitment")
      : inferredType === "content"
        ? "content"
        : inferredType;
    return {
      type: "reschedule",
      clientSlug,
      entityType,
      ordinal,
      query: normalized,
      dueAt: relativeDate.toISOString(),
    };
  }

  if (
    relativeDate &&
    /\b(?:termino|cierro|completo|edito|hago|dejo listo|voy a terminar|voy a cerrar|me comprometo)\b/.test(normalized)
  ) {
    let remindAt: string | undefined;
    if (/\brecorda(?:me|melo|mela)?\b/.test(normalized) || /\bavisame\b/.test(normalized)) {
      // resolveRelativeDate already applies a spoken hour in Martu's timezone.
      remindAt = relativeDate.toISOString();
    }
    return {
      type: "commitment",
      clientSlug,
      entityType: inferredType === "commitment" ? "task" : inferredType,
      ordinal,
      intent: message.trim(),
      dueAt: relativeDate.toISOString(),
      remindAt,
    };
  }

  if (/\b(?:ya esta|listo|termine|complete|marca.*(?:hech|list))\b/.test(normalized)) {
    return { type: "complete", clientSlug, entityType: inferredType, ordinal, query: normalized };
  }

  if (/\b(?:que|qué)\s+(?:tengo|queda|falta|hay).*\b(?:pendiente|hacer|esta semana)\b/.test(normalized) || /\bpendientes?\b/.test(normalized)) {
    return { type: "pending", clientSlug };
  }

  if (/\b(?:por que|decidimos|habíamos decidido|habiamos decidido|recordas|acordamos)\b/.test(normalized)) {
    return { type: "memory_question", clientSlug, topic: message.trim() };
  }

  if (/\b(?:metricas?|retencion|alcance|views|guardados?|organico|hipotesis|rendimiento|performance)\b/.test(normalized)) {
    return { type: "metrics_question", clientSlug, topic: message.trim() };
  }

  if (/\b(?:pauta|campanas?|anuncios?|roas|ctr|cpc|cpa|presupuesto)\b/.test(normalized)) {
    return { type: "ads_question", clientSlug, topic: message.trim() };
  }

  if (/^(?:anota|anotame|guarda|guardame|nota)\b/.test(normalized)) {
    const body = stripCommandLead(message, [/^(?:anotá|anota|anotame|anotáme|guardá|guarda|guardame|guardáme|nota)\b/i]);
    return { type: "create_note", clientSlug, body: body || message.trim() };
  }

  if (/^(?:idea|se me ocurrio|se me ocurrió|crea una idea)\b/.test(normalized)) {
    const title = stripCommandLead(message, [/^(?:idea|se me ocurrió|se me ocurrio|creá una idea|crea una idea)\b/i]);
    return { type: "create_idea", clientSlug, title: title || "Idea capturada desde el chat" };
  }

  if (/^(?:crea|creá|agrega|agregá|sumame|sumáme)\s+(?:una\s+)?tarea\b/.test(normalized)) {
    const title = stripCommandLead(message, [/^(?:creá|crea|agregá|agrega|sumáme|sumame)\s+(?:una\s+)?tarea\b/i]);
    return { type: "create_task", clientSlug, title: title || "Tarea creada desde el chat", dueAt: relativeDate?.toISOString() };
  }

  if (/\b(?:no me jodas con esto|avisame menos|avísame menos|baja la insistencia|bajá la insistencia)\b/.test(normalized)) {
    return { type: "reduce_insistence" };
  }

  if (/^(?:recorda|recordá|acordate|acordáte|guarda como decision|guardá como decisión)\s+(?:que\s+)?/.test(normalized)) {
    const content = stripCommandLead(message, [/^(?:recordá|recorda|acordáte|acordate|guardá como decisión|guarda como decision)\s+(?:que\s+)?/i]);
    const scope = clientSlug && !/\b(?:en general|siempre|para todos)\b/.test(normalized) ? "client" as const : "global" as const;
    const category = /\b(?:prefiero|me gusta|no quiero|tono|avis)/.test(normalized) ? "preference" : "decision";
    return { type: "save_memory", clientSlug: scope === "client" ? clientSlug : undefined, scope, category, content: content || message.trim() };
  }

  return { type: "smalltalk" };
}
