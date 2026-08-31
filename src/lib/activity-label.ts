const ACTIVITY_KIND_LABELS: Record<string, string> = {
  "agent_action": "Conversación",
  "campaign.updated": "Pauta",
  "commitment.created": "Compromiso",
  "content.created": "Contenido",
  "content.published": "Contenido",
  "content.reordered": "Contenido",
  "content.scheduled": "Contenido",
  "content.status_changed": "Contenido",
  "file.created": "Archivo",
  "idea.created": "Idea",
  "idea_created": "Idea",
  "meeting.completed": "Reunión",
  "metric.reviewed": "Métrica",
  "note.created": "Nota",
  "note_created": "Nota",
  "open_loop_created": "Hilo abierto",
  "script.created": "Guion",
  "script.updated": "Guion",
  "task.created": "Tarea",
  "work.created": "Trabajo",
};

const ACTIVITY_SUBJECT_LABELS: Record<string, string> = {
  activity: "Actividad",
  agent: "Conversación",
  campaign: "Pauta",
  commitment: "Compromiso",
  content: "Contenido",
  content_item: "Contenido",
  conversation: "Conversación",
  creative: "Creativo",
  file: "Archivo",
  idea: "Idea",
  meeting: "Reunión",
  metric: "Métrica",
  note: "Nota",
  open_loop: "Hilo abierto",
  script: "Guion",
  task: "Tarea",
  work: "Trabajo",
};

function normalize(value?: string | null) {
  return (value ?? "").trim().toLocaleLowerCase("es");
}

/**
 * Turns internal activity identifiers into short labels intended for people.
 * Unknown identifiers deliberately fall back to a neutral label instead of
 * leaking dotted or snake-case implementation details into the interface.
 */
export function activityLabel(
  kind?: string | null,
  entityType?: string | null,
) {
  const normalizedKind = normalize(kind);
  const exactLabel = ACTIVITY_KIND_LABELS[normalizedKind];
  if (exactLabel) return exactLabel;

  const kindSubject = normalizedKind.split(/[._-]/, 1)[0];
  const inferredLabel = ACTIVITY_SUBJECT_LABELS[kindSubject];
  if (inferredLabel) return inferredLabel;

  const normalizedEntityType = normalize(entityType);
  return ACTIVITY_SUBJECT_LABELS[normalizedEntityType] ?? "Actividad";
}
