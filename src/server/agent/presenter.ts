import type { AgentModelResult } from "./ports";
import type { AgentActionReceipt, AgentTurnPlan } from "./types";

// The presenter is intentionally limited to receipts, sanitization and bounded
// output. It must not interpret broad user language or replace model composition.

export function presentAgentResult(plan: AgentTurnPlan, result: AgentModelResult): AgentModelResult {
  if (result.actions.length) {
    return {
      ...result,
      message: actionMessage(plan, result.actions),
    };
  }
  return {
    ...result,
    message: truncateWords(sanitizeAssistantMessage(result.message), plan.maxWords),
  };
}

export function directResult(message: string, plan: AgentTurnPlan, actions: AgentActionReceipt[] = []): AgentModelResult {
  const capability: AgentModelResult["capability"] = plan.intent === "ANALYSIS"
    ? "analyst"
    : ["IDEA", "OPEN_LOOP", "CREATIVE_CHAT"].includes(plan.intent)
      ? "creative"
      : "supervisor";
  return presentAgentResult(plan, { message, capability, actions });
}

export function timeoutResult(plan: AgentTurnPlan): AgentModelResult {
  return directResult("Me demoré más de lo razonable. Probá de nuevo en un toque; no cambié nada.", plan);
}

export function sanitizeAssistantMessage(value: string): string {
  return humanizeRawDates(value)
    .replace(/CONTEXTO RECUPERADO/gi, "")
    .replace(/\b(?:client_slug|clientSlug|client_id|dueAt|updatedAt|seed_key|tool_name|tool)\b\s*[:=]?\s*[^,;\n]*/gi, "")
    .replace(/\b(?:create_task|complete_task|change_deadline|create_note|create_idea|create_open_loop|create_script_draft|update_content_status|create_commitment|save_memory|update_communication_profile)\b/gi, "la acción")
    .replace(/\b(?:pending|new|open)\b/gi, "pendiente")
    .replace(/\b(?:in_progress|editing)\b/gi, "en curso")
    .replace(/\bto_record\b/gi, "para grabar")
    .replace(/\b(?:review|approval)\b/gi, "en revisión")
    .replace(/\bscheduled\b/gi, "programado")
    .replace(/\bdraft\b/gi, "borrador")
    .replace(/\bpublished\b/gi, "publicado")
    .replace(/\bdelivered\b/gi, "entregado")
    .replace(/\bready\b/gi, "listo")
    .replace(/\b(?:done|completed)\b/gi, "resuelto")
    .replace(/\b(?:id)\s*[:=#]\s*[a-z0-9-]+/gi, "")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim() || "No llegué a una respuesta útil. Probemos de nuevo.";
}

function humanizeRawDates(value: string): string {
  return value.replace(
    /\b(20\d{2})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::\d{2})?\s*(?:Z|UTC)\b/g,
    (_match, year: string, month: string, day: string, hour: string, minute: string) => {
      const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:00.000Z`);
      if (Number.isNaN(date.getTime())) return _match;
      return new Intl.DateTimeFormat("es-AR", {
        timeZone: "America/Argentina/Buenos_Aires",
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
        .format(date)
        .replace(/\./g, "");
    },
  );
}

function actionMessage(plan: AgentTurnPlan, actions: AgentActionReceipt[]): string {
  if (plan.operation === "update_communication_profile") return "Dale, bajo la insistencia. Lo importante lo sigo cuidando.";
  if (plan.intent === "MEMORY") return "Anotado. Lo voy a tener presente para este cliente.";
  if (plan.intent === "OPEN_LOOP") return "Quedó guardado como hilo abierto, sin inventarle una fecha.";
  const summaries = actions.map((action) => sanitizeAssistantMessage(action.summary)).join(" ");
  const canUndo = actions.some((action) => Boolean(action.undoToken));
  return truncateWords(`${summaries}${canUndo ? " Si te arrepentís, lo podés deshacer." : ""}`, plan.maxWords);
}

function truncateWords(value: string, maximum: number): string {
  const words = value.trim().split(/\s+/);
  if (words.length <= maximum) return value.trim();
  return `${words.slice(0, maximum).join(" ").replace(/[,:;.!?]+$/, "")}…`;
}

function localDateKey(value: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function dateHint(value: string | null | undefined, today: string): string {
  if (!value) return "";
  const key = localDateKey(value);
  if (key <= today) return "";
  const label = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    weekday: "short",
    day: "numeric",
  }).format(new Date(value)).replace(/\.$/, "");
  return ` · ${label}`;
}
