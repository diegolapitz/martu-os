import type { RequestJob } from "../types";

export interface ConversationalQualityScenario {
  id: string;
  message: string;
  job: RequestJob;
  sideEffect: boolean;
  shouldClarify: boolean;
  expectedBehavior: string;
}

/**
 * Human-facing regression set. These are behavior contracts, not examples for
 * prompts: they cover ordinary work requests that must generalize beyond a
 * literal phrase.
 */
export const CONVERSATIONAL_QUALITY_SCENARIOS: ConversationalQualityScenario[] = [
  q("tomorrow-empty", "¿Qué tengo mañana?", "orient", false, false, "Decir simple que no hay agenda cargada y proponer ordenar el día."),
  q("tomorrow-real", "¿Qué tengo mañana y por dónde arranco?", "orient", false, false, "Priorizar lo disponible, no pedir qué quiere cambiar."),
  q("today-overview", "¿Qué me queda hoy?", "orient", false, false, "Responder con los pendientes relevantes y una primera acción."),
  q("returning-to-work", "Volví, poneme al día.", "orient", false, false, "Sintetizar cambios y lo que no puede quedar colgado."),
  q("meeting-prep", "Tengo una reunión con Gavilán en una hora, ¿qué tengo que saber?", "prepare_interaction", false, false, "Dar un brief corto con decisión, bloqueo y siguiente tema."),
  q("call-prep", "En un rato hablo con Luma: ¿qué llevo fresco?", "prepare_interaction", false, false, "Preparar la conversación con el contexto disponible."),
  q("recall-decision", "¿Qué habíamos decidido sobre los institucionales?", "recall", false, false, "Recordar la decisión confirmada sin inventar detalles."),
  q("recall-thread", "¿Por qué íbamos por piezas cortas?", "recall", false, false, "Usar el hilo o memoria si existe; si no, decirlo simple."),
  q("priority-with-context", "No llego a todo, ¿qué priorizo?", "prioritize", false, false, "Tomar postura con lo abierto y explicar el primer foco."),
  q("priority-ambiguous", "¿Qué conviene priorizar?", "prioritize", false, false, "Usar contexto disponible antes de pedir una precisión."),
  q("weekly-plan", "Planifiquemos la semana con lo que ya está abierto.", "plan", false, false, "Ordenar una secuencia sin cambiar fechas."),
  q("tomorrow-plan", "Ayudame a planificar mañana.", "plan", false, false, "Proponer un plan breve desde las tareas existentes."),
  q("review-script", "Revisá este guion: ¿qué le falta para entrar rápido?", "review", false, false, "Dar feedback concreto sobre el objeto visible."),
  q("review-tone", "¿Te parece que este tono encaja con Gavilán?", "review", false, false, "Opinar desde preferencias conocidas, sin reescribir de más."),
  q("performance", "¿Cómo viene el último reel?", "analyze", false, false, "Dar juicio relativo sólo si hay comparación; si no, describir lo observable."),
  q("creative-feedback", "Dame feedback honesto sobre este cierre.", "review", false, false, "Responder con una mejora concreta, no un marco metodológico."),
  q("follow-up", "¿Qué quedó de lo que hablamos ayer?", "follow_up", false, false, "Recuperar compromisos o aclarar que no hay registro."),
  q("reflection", "¿Qué aprendimos este mes con Gavilán?", "reflect", false, false, "Extraer un patrón sólo a partir de hechos registrados."),
  q("capture-note", "Anotá: probar un hook con una valija abierta.", "capture", true, false, "Reconocer la escritura pedida y confirmar sólo después de ejecutarla."),
  q("create-draft", "Armame un borrador de guion para Gavilán.", "create", false, false, "Puede redactar una propuesta sin asumir que debe guardarla."),
  q("reschedule-targeted", "Pasá el tercer guion al viernes.", "modify", true, false, "Ejecutar sólo si el objeto queda resuelto por el contexto y las reglas."),
  q("reschedule-ambiguous", "Pasalo al viernes.", "modify", true, true, "Preguntar qué objeto modificar antes de tocar datos."),
  q("write-vs-read", "¿Qué conviene mover para llegar a todo?", "prioritize", false, false, "Recomendar una alternativa sin interpretar que debe moverla."),
  q("missing-data", "¿Qué reuniones tengo mañana?", "orient", false, false, "Decir si no hay reuniones cargadas y sugerir un paso útil sin burocracia."),
];

function q(id: string, message: string, job: RequestJob, sideEffect: boolean, shouldClarify: boolean, expectedBehavior: string): ConversationalQualityScenario {
  return { id, message, job, sideEffect, shouldClarify, expectedBehavior };
}
