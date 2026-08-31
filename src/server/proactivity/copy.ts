const WORKFLOW_PHRASES: Record<string, string> = {
  idea: "en idea",
  script: "en guion",
  to_record: "para grabar",
  ready_to_record: "para grabar",
  para_grabar: "para grabar",
  recorded: "grabado",
  editing: "en edición",
  ready: "listo",
  approval: "esperando aprobación",
  in_approval: "esperando aprobación",
  en_aprobacion: "esperando aprobación",
  approved: "aprobado",
  scheduled: "programado",
  published: "publicado",
  delivered: "entregado",
  draft: "en borrador",
  review: "en revisión",
  pending: "pendiente",
  in_progress: "en curso",
  blocked: "bloqueado",
  completed: "terminado",
  cancelled: "cancelado",
  canceled: "cancelado",
  open: "abierto",
  snoozed: "pospuesto",
  active: "activo",
  paused: "en pausa",
  archived: "archivado",
  new: "nuevo",
  selected: "seleccionado",
  developing: "en desarrollo",
  produced: "producido",
  discarded: "descartado",
};

const NUDGE_KIND_LABELS: Record<string, string> = {
  task_overdue: "tarea vencida",
  task_due_soon: "tarea próxima a vencer",
  commitment_due: "compromiso para hoy",
  commitment_overdue: "compromiso vencido",
  reminder_due: "recordatorio pendiente",
  task_stale: "tarea sin movimiento",
  content_stalled: "contenido frenado",
  meeting_action_open: "pendiente de reunión",
  missing_brief: "brief incompleto",
  missing_strategy: "estrategia incompleta",
  metric_opportunity: "oportunidad en métricas",
  open_loop_resurface: "tema abierto",
  morning_briefing: "resumen de la mañana",
  midday_check: "chequeo del mediodía",
  end_of_day: "cierre del día",
};

const WORKFLOW_TOKEN_PATTERN = tokenPattern(Object.keys(WORKFLOW_PHRASES));
const NUDGE_KIND_TOKEN_PATTERN = tokenPattern(Object.keys(NUDGE_KIND_LABELS));
const FUTURE_SNAKE_TOKEN = String.raw`[a-z][a-z0-9]*(?:_[a-z0-9]+)+`;

/**
 * Describes a workflow state as part of the sentence "quedó …".
 * Unknown states deliberately stay generic instead of leaking storage jargon.
 */
export function humanizeWorkflowStatus(value: unknown): string {
  const status = String(value ?? "")
    .trim()
    .toLocaleLowerCase("es-AR");
  return WORKFLOW_PHRASES[status] ?? "en una etapa pendiente";
}

/**
 * Last-mile guard for both newly composed and already persisted notifications.
 * Replacements are deliberately limited to controlled status/kind positions;
 * titles, client names and other user-authored copy must remain untouched.
 */
export function humanizeNotificationCopy(value: string): string {
  let copy = value;

  copy = copy.replace(
    new RegExp(
      `\\b(qued[oó]\\s+(?:clavad[oa]\\s+)?)(?:en\\s+)?(${WORKFLOW_TOKEN_PATTERN}|${FUTURE_SNAKE_TOKEN})\\b`,
      "gi",
    ),
    (_match, lead: string, status: string) =>
      `${lead}${humanizeWorkflowStatus(status)}`,
  );

  copy = copy.replace(
    new RegExp(
      `\\bstatus\\s*[:=]\\s*(${WORKFLOW_TOKEN_PATTERN}|${FUTURE_SNAKE_TOKEN})\\b`,
      "gi",
    ),
    (_match, status: string) => `estado: ${humanizeWorkflowStatus(status)}`,
  );

  return copy.replace(
    new RegExp(
      `\\bkind\\s*[:=]\\s*(${NUDGE_KIND_TOKEN_PATTERN}|${FUTURE_SNAKE_TOKEN})\\b`,
      "gi",
    ),
    (_match, kind: string) =>
      `tipo: ${NUDGE_KIND_LABELS[kind.toLocaleLowerCase("es-AR")] ?? "aviso"}`,
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tokenPattern(values: string[]): string {
  return values
    .sort((left, right) => right.length - left.length)
    .map(escapeRegExp)
    .join("|");
}
