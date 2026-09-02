import type { AgentKnowledgeSource, RequestJob, RequestScope } from "../types";

export type CapabilitySplit = "calibration" | "holdout";
export type CapabilityLevel = "run" | "trace" | "thread";

export interface CapabilityCase {
  id: string;
  job: RequestJob;
  split: CapabilitySplit;
  level: CapabilityLevel;
  message: string;
  scope: RequestScope;
  clientSlug?: string;
  informationNeeds: AgentKnowledgeSource[];
  sideEffect: boolean;
  attributes: {
    ambiguity: "none" | "resolvable" | "needs_clarification";
    context: "none" | "current_view" | "thread";
    services: "available" | "unavailable" | "not_applicable";
    history: "none" | "memory" | "recent_turn";
  };
}

/**
 * Capability-oriented dataset. Calibration cases describe coverage; holdout
 * variants are never used as examples in planner prompts or implementation.
 */
export const SUPERVISOR_CAPABILITY_MATRIX: CapabilityCase[] = [
  c("orient", "orient", "calibration", "run", "Poneme al día con Gavilán antes de arrancar.", "client", "gavilan", ["work", "meetings", "memories"], false),
  c("orient-global", "orient", "calibration", "trace", "¿Con qué conviene arrancar hoy entre todos los clientes?", "global", undefined, ["work"], false, { context: "thread" }),
  c("orient-holdout", "orient", "holdout", "run", "Recién vuelvo: ¿qué cambió en Gavilán y qué no puedo dejar colgado?", "client", "gavilan", ["work", "meetings", "memories"], false, { history: "recent_turn" }),

  c("prep-meeting", "prepare_interaction", "calibration", "trace", "¿Qué tengo que saber de Gavilán? Tengo una reunión en una hora.", "client", "gavilan", ["meetings", "memories", "work", "scripts", "content"], false, { history: "memory" }),
  c("prep-call", "prepare_interaction", "calibration", "run", "En 60 minutos hablo con Gavilán: armame un brief de lo importante.", "client", "gavilan", ["meetings", "memories", "work"], false),
  c("prep-holdout", "prepare_interaction", "holdout", "run", "En un rato me junto con Gavilán; ¿qué no se me puede escapar?", "client", "gavilan", ["meetings", "memories", "work", "content"], false),

  c("recall", "recall", "calibration", "trace", "¿Qué habíamos decidido sobre los videos institucionales de Gavilán?", "client", "gavilan", ["memories", "meetings", "thread"], false, { history: "memory" }),
  c("recall-thread", "recall", "calibration", "thread", "Volvamos a la decisión de antes: ¿por qué íbamos por piezas cortas?", "client", "gavilan", ["thread", "memories"], false, { context: "thread", history: "recent_turn" }),
  c("recall-holdout", "recall", "holdout", "run", "Refrescame el criterio que habíamos acordado para Gavilán.", "client", "gavilan", ["memories", "meetings"], false),

  c("prioritize", "prioritize", "calibration", "trace", "No llego a todo hoy: ¿qué priorizo de Gavilán?", "client", "gavilan", ["work", "scripts", "content"], false),
  c("prioritize-global", "prioritize", "calibration", "run", "Tengo dos horas, elegí qué mueve más la aguja entre mis clientes.", "global", undefined, ["work"], false),
  c("prioritize-holdout", "prioritize", "holdout", "run", "Ordename el frente de Gavilán sin tocar fechas.", "client", "gavilan", ["work", "meetings"], false),

  c("create", "create", "calibration", "trace", "Armame tres ángulos para un reel de Gavilán sobre escapadas cortas.", "client", "gavilan", ["memories", "content", "scripts"], false),
  c("create-view", "create", "calibration", "run", "Con esta idea, escribime un arranque más fuerte.", "entity", "gavilan", ["content", "scripts", "thread"], false, { context: "current_view" }),
  c("create-holdout", "create", "holdout", "run", "Necesito una versión más directa de este concepto para Gavilán.", "client", "gavilan", ["memories", "content"], false),

  c("review", "review", "calibration", "trace", "Revisá este guion de Gavilán: ¿qué le falta para entrar rápido?", "entity", "gavilan", ["scripts", "memories"], false, { context: "current_view" }),
  c("review-client", "review", "calibration", "run", "¿Te parece que este tono encaja con Gavilán?", "client", "gavilan", ["memories", "thread"], false),
  c("review-holdout", "review", "holdout", "run", "Dame feedback honesto sobre este cierre, sin reescribirlo todavía.", "entity", "gavilan", ["scripts", "thread"], false, { context: "current_view" }),

  c("analyze", "analyze", "calibration", "trace", "Analizá qué funcionó en las últimas piezas de Gavilán.", "client", "gavilan", ["metrics", "content"], false, { services: "available" }),
  c("analyze-unavailable", "analyze", "calibration", "run", "¿Cómo viene el ROAS de Luma?", "client", "luma-estudio", ["campaigns"], false, { services: "unavailable" }),
  c("analyze-holdout", "analyze", "holdout", "run", "¿Qué patrón ves entre retención y los hooks de Gavilán?", "client", "gavilan", ["metrics", "content"], false),

  c("plan", "plan", "calibration", "trace", "Planifiquemos la semana de Gavilán con lo que ya está abierto.", "client", "gavilan", ["work", "meetings", "content"], false),
  c("plan-ambiguous", "plan", "calibration", "run", "Armame un plan para el lanzamiento.", "unknown", undefined, ["work", "meetings"], false, { ambiguity: "needs_clarification" }),
  c("plan-holdout", "plan", "holdout", "run", "¿Cómo ordenarías los próximos cinco días de Gavilán?", "client", "gavilan", ["work", "content", "meetings"], false),

  c("modify", "modify", "calibration", "trace", "Pasá el guion de Gavilán al viernes.", "client", "gavilan", ["work", "scripts"], true),
  c("modify-ambiguous", "modify", "calibration", "run", "Pasalo al viernes.", "unknown", undefined, ["thread"], true, { ambiguity: "needs_clarification", context: "thread" }),
  c("modify-holdout", "modify", "holdout", "run", "Marcá como terminado el tercer guion de Gavilán.", "client", "gavilan", ["scripts", "work"], true),

  c("capture", "capture", "calibration", "trace", "Anotá para Gavilán: probar un hook con una valija abierta.", "client", "gavilan", ["thread"], true),
  c("capture-memory", "capture", "calibration", "run", "Acordate que a Gavilán no le sirven los institucionales largos.", "client", "gavilan", ["memories"], true, { history: "memory" }),
  c("capture-holdout", "capture", "holdout", "run", "Guardá esta idea para retomar cuando planifiquemos: serie detrás de escena.", "client", "gavilan", ["thread"], true),

  c("follow-up", "follow_up", "calibration", "thread", "¿Qué quedó de lo que hablamos ayer con Gavilán?", "client", "gavilan", ["thread", "work", "meetings"], false, { context: "thread", history: "recent_turn" }),
  c("follow-up-client", "follow_up", "calibration", "run", "Haceme seguimiento de los compromisos abiertos de Gavilán.", "client", "gavilan", ["work", "meetings"], false),
  c("follow-up-holdout", "follow_up", "holdout", "run", "¿Qué tengo que retomar de Gavilán esta semana?", "client", "gavilan", ["work", "thread"], false),

  c("reflect", "reflect", "calibration", "trace", "¿Qué aprendimos este mes trabajando con Gavilán?", "client", "gavilan", ["meetings", "memories", "notes"], false, { history: "memory" }),
  c("reflect-global", "reflect", "calibration", "run", "Ayudame a mirar qué me está trabando como freelance.", "global", undefined, ["thread", "profile"], false),
  c("reflect-holdout", "reflect", "holdout", "run", "¿Qué patrón me conviene conservar de lo que salió bien con Gavilán?", "client", "gavilan", ["memories", "meetings"], false),
];

function c(
  id: string, job: RequestJob, split: CapabilitySplit, level: CapabilityLevel, message: string,
  scope: RequestScope, clientSlug: string | undefined, informationNeeds: AgentKnowledgeSource[], sideEffect: boolean,
  attributes: Partial<CapabilityCase["attributes"]> = {},
): CapabilityCase {
  return { id, job, split, level, message, scope, clientSlug, informationNeeds, sideEffect, attributes: { ambiguity: "none", context: "none", services: "not_applicable", history: "none", ...attributes } };
}
