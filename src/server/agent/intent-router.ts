import { normalizeSpanish, resolveRelativeDate } from "./date-language";
import { parseDemoIntent } from "./intents";
import type {
  AgentContext,
  AgentEntityRef,
  AgentRequest,
  AgentTurnPlan,
  ClientRef,
  PlannedToolCall,
  RequestPlan,
} from "./types";

const ORDINAL_PATTERN = /\b(?:primer|primero|segundo|tercer|tercero|cuarto|quinto|1(?:er|ro)?|2(?:do)?|3(?:er|ro)?|4(?:to)?|5(?:to)?|#?[1-9])\b/;
const TARGET_NOUN_PATTERN = /\b(?:tarea|guion|reel|video|contenido|pieza|compromiso|promesa)\b/;
const MUTATION_LANGUAGE = /\b(?:pasa(?:lo|la)?|move|mover|cambia(?:lo|la)?|reprograma|reagenda|marca|completa|termina|borra|elimina|archiva|crea|agrega|guarda)\b/;

const TARGET_STOPWORDS = new Set([
  "pasa", "pasalo", "pasala", "move", "mover", "cambia", "cambialo", "cambiala", "reprograma", "reagenda",
  "marca", "completa", "termina", "terminado", "terminada", "listo", "lista", "hoy", "manana", "lunes", "martes",
  "miercoles", "jueves", "viernes", "sabado", "domingo", "tarea", "guion", "reel", "video", "contenido", "pieza",
  "compromiso", "promesa", "para", "por", "con", "del", "una", "uno", "este", "esta", "eso", "ese", "esa",
]);

/**
 * Converts semantic understanding into broad execution/safety categories.
 * The legacy parser remains only as a conservative verifier for explicit
 * writes and undo; it is not allowed to collapse read language into a
 * presenter-specific answer.
 */
export function routeAgentTurn(request: AgentRequest, context: AgentContext, requestPlan?: RequestPlan): AgentTurnPlan {
  const legacy = routeLegacyTurn(request, context);
  if (!requestPlan) return legacy;

  // Writes and undo still require deterministic parsing, entity resolution and
  // policy gating. A model-produced plan can never activate a mutating tool.
  // A conservative legacy parser may see a relative date or an omitted object
  // and ask about a write that Martu never requested. Once the semantic plan
  // has established this is an answerable, read-only turn, it must be allowed
  // to reach retrieval and composition before asking anything back.
  const semanticReadOnly = !requestPlan.requiresClarification
    && !requestPlan.sideEffectsExplicitlyRequested
    && !mayRequestMutation(request.message);
  if (legacy.allowedTools.length || legacy.operation === "undo" || (legacy.requiresClarification && !semanticReadOnly)) {
    return { ...legacy, requestPlan };
  }
  if (requestPlan.requiresClarification) {
    return plan({
      intent: "AMBIGUOUS",
      operation: "clarify",
      clientSlug: requestPlan.clientSlug ?? legacy.clientSlug,
      maxWords: 35,
      requiresClarification: true,
      clarification: requestPlan.ambiguities[0] ?? "¿Me aclarás a qué te referís?",
      requestPlan,
    });
  }
  const analysis = requestPlan.job === "analyze";
  const creative = ["create", "review", "reflect", "converse", "prioritize"].includes(requestPlan.job);
  return plan({
    intent: analysis ? "ANALYSIS" : creative ? "CREATIVE_CHAT" : "READ",
    operation: analysis ? "analysis" : creative ? "creative_feedback" : "read_general",
    clientSlug: requestPlan.clientSlug ?? legacy.clientSlug,
    entity: semanticEntity(requestPlan, context) ?? legacy.entity,
    requiredServices: legacy.requiredServices,
    serviceLabel: legacy.serviceLabel,
    maxWords: responseWordLimit(requestPlan),
    requestPlan,
  });
}

function routeLegacyTurn(request: AgentRequest, context: AgentContext): AgentTurnPlan {
  const message = request.message.trim();
  const normalized = normalizeSpanish(message).replace(/^[¿¡!?.,;:\s]+/, "");
  const currentView = context.currentView ?? request.currentView;
  const currentViewEntity = entityFromCurrentView(currentView);
  const viewCanGroundTurn = currentViewWithinConversationScope(currentView, request, context);
  const useCurrentView = isDeicticReference(normalized) && viewCanGroundTurn;
  const fallbackClientSlug = useCurrentView
    ? currentViewEntity?.clientSlug ?? currentView?.clientSlug ?? context.currentClient?.slug ?? request.clientSlug
    : context.currentClient?.slug ?? request.clientSlug;
  const clientSlug = inferClientSlug(normalized, context.clients, fallbackClientSlug);
  const explicitEntity = (useCurrentView ? currentViewEntity : undefined)
    ?? request.contextEntity
    ?? entityFromMetadata(request.metadata);
  const referencedEntity = explicitEntity ?? context.lastReferencedEntity;
  const parsingContext = {
    clients: context.clients,
    currentClientSlug: clientSlug,
    lastReferencedEntity: referencedEntity,
    now: request.now,
  };

  if (/\b(?:deshace|deshacelo|deshacela|reverti|revertir|volve atras|volver atras)\b/.test(normalized)) {
    if (!context.lastUndoToken) return ambiguousPlan("¿Qué cambio querés deshacer?", clientSlug);
    return plan({
      intent: "ACTION",
      operation: "undo",
      clientSlug,
      entity: referencedEntity,
      maxWords: 35,
    });
  }

  if (/\b(?:acordate|recorda|guardalo como decision|guardala como decision)\b/.test(normalized)) {
    const content = cleanMemoryContent(message);
    if (!content) return ambiguousPlan("¿Qué querés que recuerde?", clientSlug);
    const explicitlyGlobal = /\b(?:en general|siempre|para todos|con todos los clientes)\b/.test(normalized);
    const scope = clientSlug && !explicitlyGlobal ? "client" : "global";
    return plan({
      intent: "MEMORY",
      operation: "save_memory",
      clientSlug: scope === "client" ? clientSlug : undefined,
      allowedTools: ["save_memory"],
      maxWords: 30,
      directToolCall: {
        name: "save_memory",
        arguments: {
          clientSlug: scope === "client" ? clientSlug ?? null : null,
          scope,
          category: /\b(?:no le gusta|no quiere|no quiero|prefiero|prefiere|preferimos|me gusta|tono|estilo|gusta)\b/.test(normalized) ? "preference" : "decision",
          content,
          importance: 0.8,
        },
      },
    });
  }

  if (isOverwhelmedToday(normalized)) {
    return plan({
      intent: "CREATIVE_CHAT",
      operation: "conversation",
      clientSlug,
      maxWords: 60,
    });
  }

  if (isOpenLoop(normalized)) {
    const title = cleanIdeaTitle(message, true);
    return plan({
      intent: "OPEN_LOOP",
      operation: "create_open_loop",
      clientSlug,
      allowedTools: ["create_open_loop"],
      requiredServices: clientSlug ? ["ideas-planning", "content-creation", "community-management"] : undefined,
      serviceLabel: clientSlug ? "ideas o contenido" : undefined,
      maxWords: 40,
      directToolCall: {
        name: "create_open_loop",
        arguments: {
          clientSlug: clientSlug ?? null,
          title,
          body: "Volver a mirarlo cuando encaje con la planificación.",
          kind: "idea",
          salience: 3,
        },
      },
    });
  }

  if (/^(?:anota|anotame|toma nota|guarda una nota|guardame una nota)\b/.test(normalized)) {
    if (!clientSlug) return ambiguousPlan("¿Para qué cliente guardo la nota?", clientSlug);
    const parsed = parseDemoIntent(message, parsingContext);
    const body = parsed.type === "create_note" ? parsed.body : cleanCaptureText(message);
    return plan({
      intent: "CAPTURE",
      operation: "capture_note",
      clientSlug,
      allowedTools: ["create_note"],
      maxWords: 35,
      directToolCall: { name: "create_note", arguments: { clientSlug, body, tags: null } },
    });
  }

  const parsedIntent = parseDemoIntent(message, parsingContext);
  if (parsedIntent.type === "reduce_insistence") {
    return plan({
      intent: "MEMORY",
      operation: "update_communication_profile",
      allowedTools: ["update_communication_profile"],
      maxWords: 30,
      directToolCall: {
        name: "update_communication_profile",
        arguments: {
          insistenceLevel: 0.2,
          preferenceKey: "reduced_from_chat",
          preferenceValue: true,
        },
      },
    });
  }

  if (parsedIntent.type === "commitment") {
    return plan({
      intent: "COMMITMENT",
      operation: "create_commitment",
      clientSlug: parsedIntent.clientSlug ?? clientSlug,
      entity: referencedEntity,
      allowedTools: ["create_commitment"],
      maxWords: 45,
      directToolCall: {
        name: "create_commitment",
        arguments: {
          clientSlug: parsedIntent.clientSlug ?? clientSlug ?? null,
          intent: parsedIntent.intent,
          targetType: referencedEntity?.type && ["task", "script", "content"].includes(referencedEntity.type)
            ? referencedEntity.type
            : parsedIntent.entityType,
          targetId: referencedEntity?.id ?? null,
          ordinal: parsedIntent.ordinal ?? null,
          query: parsedIntent.intent,
          dueAt: parsedIntent.dueAt,
          remindAt: parsedIntent.remindAt ?? null,
        },
      },
    });
  }

  if (parsedIntent.type === "reschedule") {
    const hasTarget = Boolean(referencedEntity) || hasExplicitTarget(normalized, context.clients);
    if (!hasTarget) return ambiguousPlan("¿Qué querés pasar a esa fecha?", clientSlug);
    const entityType = mutationEntityType(referencedEntity) ?? parsedIntent.entityType;
    return plan({
      intent: "ACTION",
      operation: "reschedule",
      clientSlug: parsedIntent.clientSlug ?? clientSlug,
      entity: referencedEntity,
      allowedTools: ["change_deadline"],
      requiredServices: servicesForEntity(entityType),
      maxWords: 45,
      directToolCall: {
        name: "change_deadline",
        arguments: {
          targetType: entityType,
          targetId: referencedEntity?.id ?? null,
          clientSlug: parsedIntent.clientSlug ?? clientSlug ?? null,
          ordinal: parsedIntent.ordinal ?? null,
          query: referencedEntity?.title ?? parsedIntent.query ?? message,
          dueAt: parsedIntent.dueAt,
        },
      },
    });
  }

  if (parsedIntent.type === "complete") {
    const humanPronoun = /\b(?:ya esta|lo termine|la termine|listo|termine)\b/.test(normalized);
    const hasTarget = Boolean(referencedEntity) || (!humanPronoun && hasExplicitTarget(normalized, context.clients));
    if (!hasTarget) return ambiguousPlan("¿Qué terminaste?", clientSlug);
    const entityType = mutationEntityType(referencedEntity) ?? parsedIntent.entityType;
    return plan({
      intent: "ACTION",
      operation: "complete",
      clientSlug: parsedIntent.clientSlug ?? clientSlug,
      entity: referencedEntity,
      allowedTools: ["complete_task"],
      requiredServices: servicesForEntity(entityType),
      maxWords: 35,
      directToolCall: {
        name: "complete_task",
        arguments: {
          targetType: entityType,
          targetId: referencedEntity?.id ?? null,
          clientSlug: parsedIntent.clientSlug ?? clientSlug ?? null,
          ordinal: parsedIntent.ordinal ?? null,
          query: referencedEntity?.title ?? parsedIntent.query ?? message,
        },
      },
    });
  }

  if (parsedIntent.type === "create_task") {
    return plan({
      intent: "ACTION",
      operation: "create_task",
      clientSlug: parsedIntent.clientSlug ?? clientSlug,
      allowedTools: ["create_task"],
      maxWords: 40,
      directToolCall: {
        name: "create_task",
        arguments: {
          clientSlug: parsedIntent.clientSlug ?? clientSlug ?? null,
          title: parsedIntent.title,
          description: null,
          dueAt: parsedIntent.dueAt ?? null,
          priority: "medium",
        },
      },
    });
  }

  if (isExplicitIdeaCapture(normalized)) {
    if (!clientSlug) return ambiguousPlan("¿Para qué cliente guardo la idea?", clientSlug);
    const title = cleanIdeaTitle(message, false);
    return plan({
      intent: "IDEA",
      operation: "create_idea",
      clientSlug,
      allowedTools: ["create_idea"],
      requiredServices: ["ideas-planning", "content-creation", "community-management"],
      serviceLabel: "ideas o contenido",
      maxWords: 40,
      directToolCall: { name: "create_idea", arguments: { clientSlug, title, description: null, tags: null } },
    });
  }

  if (/\b(?:crea|arma|guarda)\b.*\b(?:borrador de )?guion\b/.test(normalized)) {
    if (!clientSlug) return ambiguousPlan("¿Para qué cliente preparo el guion?", clientSlug);
    return plan({
      intent: "ACTION",
      operation: "create_script",
      clientSlug,
      allowedTools: ["create_script_draft"],
      requiredServices: ["scripts"],
      serviceLabel: "guiones",
      maxWords: 80,
    });
  }

  if (isCreativeChat(normalized)) {
    return plan({
      intent: "CREATIVE_CHAT",
      operation: "creative_feedback",
      clientSlug,
      entity: referencedEntity,
      maxWords: 60,
    });
  }

  if (isAnalysis(normalized)) {
    const scope = analysisScope(normalized);
    return plan({
      intent: "ANALYSIS",
      operation: "analysis",
      clientSlug,
      entity: referencedEntity,
      requiredServices: scope?.services,
      serviceLabel: scope?.label,
      maxWords: 180,
    });
  }

  if (isRead(normalized)) {
    return plan({
      intent: "READ",
      operation: /\b(?:tengo|queda|falta|cerrar|pendiente|hoy)\b/.test(normalized) ? "read_work" : "read_general",
      clientSlug,
      entity: referencedEntity,
      maxWords: 80,
    });
  }

  if (MUTATION_LANGUAGE.test(normalized) || resolveRelativeDate(normalized, request.now)) {
    return ambiguousPlan("No quiero adivinar y tocar algo equivocado. ¿Qué querés cambiar?", clientSlug);
  }

  return plan({
    intent: "CREATIVE_CHAT",
    operation: "conversation",
    clientSlug,
    entity: referencedEntity,
    maxWords: 60,
  });
}

type PlanInput = Partial<AgentTurnPlan> & Pick<AgentTurnPlan, "intent" | "operation">;

function plan(input: PlanInput): AgentTurnPlan {
  return {
    intent: input.intent,
    operation: input.operation,
    clientSlug: input.clientSlug,
    entity: input.entity,
    allowedTools: input.allowedTools ?? [],
    maxWrites: input.maxWrites ?? (input.allowedTools?.length ? 1 : 0),
    maxWords: input.maxWords ?? 80,
    requiresClarification: input.requiresClarification ?? false,
    clarification: input.clarification,
    directToolCall: input.directToolCall,
    requiredServices: input.requiredServices,
    serviceLabel: input.serviceLabel,
    requestPlan: input.requestPlan,
    retrievalPlan: input.retrievalPlan,
  };
}

function semanticEntity(requestPlan: RequestPlan, context: AgentContext): AgentEntityRef | undefined {
  const requested = requestPlan.relevantEntities[0];
  if (!requested) return undefined;
  if (requested.id && context.currentViewItem?.id === requested.id) return context.currentViewItem;
  if (requested.id && context.lastReferencedEntity?.id === requested.id) return context.lastReferencedEntity;
  return undefined;
}

function responseWordLimit(requestPlan: RequestPlan): number {
  if (requestPlan.response.depth === "short") return 70;
  if (requestPlan.response.depth === "deep") return 220;
  return requestPlan.response.type === "briefing" ? 160 : 120;
}

function ambiguousPlan(clarification: string, clientSlug?: string): AgentTurnPlan {
  return plan({ intent: "AMBIGUOUS", operation: "clarify", clientSlug, maxWords: 30, requiresClarification: true, clarification });
}

function inferClientSlug(normalized: string, clients: ClientRef[], fallback?: string): string | undefined {
  const explicit = clients.find((client) => {
    const aliases = [client.name, client.slug]
      .flatMap((value) => [normalizeSpanish(value), ...normalizeSpanish(value).split(/[\s-]+/).filter((token) => token.length >= 4)]);
    return aliases.some((alias) => new RegExp(`(?:^|\\b)${escapeRegExp(alias)}(?:\\b|$)`).test(normalized));
  });
  return explicit?.slug ?? fallback;
}

function entityFromMetadata(metadata?: Record<string, unknown>): AgentEntityRef | undefined {
  const raw = metadata?.currentEntity;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const value = raw as Record<string, unknown>;
  const type = String(value.type ?? "");
  if (!value.id || !value.title || !["task", "script", "content", "commitment", "note", "idea", "open_loop", "meeting"].includes(type)) return undefined;
  return {
    id: String(value.id),
    type: type as AgentEntityRef["type"],
    title: String(value.title),
    clientSlug: value.clientSlug ? String(value.clientSlug) : undefined,
  };
}

function entityFromCurrentView(view: AgentRequest["currentView"]): AgentEntityRef | undefined {
  if (!view?.entityId || !view.entityType || !view.entityTitle) return undefined;
  return {
    id: view.entityId,
    type: view.entityType,
    title: view.entityTitle,
    clientId: view.clientId ?? undefined,
    clientSlug: view.clientSlug ?? undefined,
  };
}

function currentViewWithinConversationScope(
  view: AgentRequest["currentView"],
  request: AgentRequest,
  context: AgentContext,
): boolean {
  const viewSlug = view?.clientSlug;
  if (!viewSlug || context.conversationScope === "global") return true;
  const fixedSlug = context.conversationClient?.slug ?? context.currentClient?.slug ?? request.clientSlug;
  return !fixedSlug || fixedSlug === viewSlug;
}

function isDeicticReference(normalized: string): boolean {
  return /\b(?:esto|eso|aca|aqui|lo que (?:estoy|tengo) (?:viendo|abierto)|(?:esta|esa) (?:idea|tarea|pieza|nota|reunion)|(?:este|ese) (?:guion|contenido|compromiso|hilo|reel|video|hook)|pasalo|pasala|cambialo|cambiala|marcalo|marcala|completalo|completala)\b/.test(normalized);
}

/** Safety boundary, deliberately broader than any one product job. */
function mayRequestMutation(message: string): boolean {
  const normalized = normalizeSpanish(message);
  return /\b(?:pasalo|pasala|cambialo|cambiala|moverlo|moverla|reprogramalo|reprogramala|completalo|completala|marcalo|marcala|deshacelo|deshacela|lo termine|la termine|termine(?:lo|la)?|anota|guarda|crea)\b/.test(normalized)
    || /\bya esta\b(?!\s+abierto)/.test(normalized);
}

function hasExplicitTarget(normalized: string, clients: ClientRef[]): boolean {
  if (ORDINAL_PATTERN.test(normalized)) return true;
  if (!TARGET_NOUN_PATTERN.test(normalized)) return false;
  const clientTokens = new Set(clients.flatMap((client) => normalizeSpanish(`${client.name} ${client.slug}`).split(/[\s-]+/)));
  const meaningful = normalized
    .replace(/[^a-z0-9áéíóúñü]+/gi, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !TARGET_STOPWORDS.has(token) && !clientTokens.has(token));
  return meaningful.length > 0;
}

function mutationEntityType(entity?: AgentEntityRef): "task" | "script" | "content" | "commitment" | undefined {
  return entity && ["task", "script", "content", "commitment"].includes(entity.type)
    ? entity.type as "task" | "script" | "content" | "commitment"
    : undefined;
}

function servicesForEntity(type: "task" | "script" | "content" | "commitment"): string[] | undefined {
  if (type === "script") return ["scripts"];
  if (type === "content") return ["content-creation", "community-management", "recording", "editing", "publishing"];
  return undefined;
}

function isOpenLoop(normalized: string): boolean {
  return /\b(?:despues (?:la|lo) vemos|mas adelante|queda flotando|dejalo flotando|algun dia|sin fecha)\b/.test(normalized)
    || (/\bse me ocurrio\b/.test(normalized) && /\b(?:despues|mas adelante|vemos)\b/.test(normalized));
}

function isExplicitIdeaCapture(normalized: string): boolean {
  return /^(?:crea|guarda|anota) (?:una )?idea\b/.test(normalized)
    || /\bguard(?:a|alo|ala) como idea\b/.test(normalized);
}

function isCreativeChat(normalized: string): boolean {
  return /\b(?:no me convence|que pensas|que te parece|como sigo|como seguir|por donde sigo|que hago con esto|yo empezaria|arranque|hook|feedback|dame una idea|ayudame a pensar|creativo)\b/.test(normalized);
}

function isOverwhelmedToday(normalized: string): boolean {
  return /\b(?:no llego|no llegamos|no doy mas|no da)\b.*\b(?:hoy|ahora)\b/.test(normalized);
}

function isAnalysis(normalized: string): boolean {
  return /\b(?:analiza|analisis|metricas?|retencion|alcance|views|guardados?|rendimiento|performance|roas|ctr|cpc|cpa|pauta|campanas?|anuncios?|estrategia|audiencia|posicionamiento)\b/.test(normalized);
}

function analysisScope(normalized: string): { services: string[]; label: string } | undefined {
  if (/\b(?:roas|ctr|cpc|cpa|pauta|campanas?|anuncios?|presupuesto)\b/.test(normalized)) return { services: ["meta-ads"], label: "pauta" };
  if (/\b(?:metricas?|retencion|alcance|views|guardados?|rendimiento|performance)\b/.test(normalized)) return { services: ["metrics-reporting"], label: "métricas" };
  if (/\b(?:estrategia|audiencia|posicionamiento)\b/.test(normalized)) return { services: ["strategy"], label: "estrategia" };
  return undefined;
}

function isRead(normalized: string): boolean {
  return /^(?:que|cual|cuando|como|donde|por que|recordas|acordamos)\b/.test(normalized)
    || /\b(?:que tengo|que queda|que falta|tengo que cerrar|pendientes?|para hoy|esta semana)\b/.test(normalized);
}

function cleanMemoryContent(message: string): string {
  return message
    .replace(/^(?:recordá|recorda|acordáte|acordate)\s+(?:que\s+)?/i, "")
    .replace(/[,.!;:]?\s*(?:recordá|recorda|acordáte|acordate)(?:\s+de\s+eso)?[.!]?$/i, "")
    .trim();
}

function cleanCaptureText(message: string): string {
  return message.replace(/^(?:anotá|anota|anotame|anotáme|tomá nota|toma nota|guardá una nota|guarda una nota|guardame una nota)\s*(?:que\s+)?/i, "").trim();
}

function cleanIdeaTitle(message: string, openLoop: boolean): string {
  let value = message
    .replace(/^(?:se me ocurrió|se me ocurrio|creá|crea|guardá|guarda|anotá|anota)\s*(?:una\s+)?(?:idea\s+)?(?:de\s+)?/i, "")
    .replace(/\bguard(?:á|a)(?:lo|la)?\s+como\s+idea\b/i, "")
    .trim();
  if (openLoop) value = value.replace(/[,.!;:]?\s*(?:después|despues|más adelante|mas adelante).*$/i, "").trim();
  return value.replace(/[.!]+$/, "").trim() || "Idea para retomar";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function plannedToolCall(planValue: AgentTurnPlan): PlannedToolCall | undefined {
  return planValue.directToolCall;
}
