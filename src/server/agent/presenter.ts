import type { AgentModelResult } from "./ports";
import type { AgentActionReceipt, AgentContext, AgentTurnPlan } from "./types";

const CLOSED_STATUSES = new Set([
  "done", "completed", "published", "delivered", "approved", "archived", "cancelled",
  "hecho", "completado", "publicado", "entregado", "aprobado", "archivado", "cancelado",
]);

export function readFastPath(plan: AgentTurnPlan, context: AgentContext): AgentModelResult | undefined {
  if (plan.intent !== "READ" || plan.operation !== "read_work") return undefined;
  const slug = plan.clientSlug ?? context.currentClient?.slug;
  const client = context.clients.find((item) => item.slug === slug) ?? context.currentClient;
  const items = [...context.tasks, ...context.scripts, ...context.content]
    .filter((item) => !slug || item.clientSlug === slug)
    .filter((item) => !CLOSED_STATUSES.has(String(item.status ?? "").toLocaleLowerCase("es-AR")));
  const today = localDateKey(context.now);
  const dueNow = items.filter((item) => item.dueAt && localDateKey(item.dueAt) <= today);
  const selected = (dueNow.length ? dueNow : items)
    .sort((a, b) => (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999"))
    .filter((item, index, all) => all.findIndex((candidate) => candidate.title === item.title) === index)
    .slice(0, 4);

  if (!selected.length) {
    return {
      message: client ? `No veo nada abierto para cerrar hoy de ${client.name}.` : "No veo nada abierto para cerrar hoy.",
      capability: "supervisor",
      actions: [],
    };
  }
  const heading = client ? `De ${client.name}, cerraría esto:` : "Hoy cerraría esto:";
  const list = selected.map((item, index) => `${index + 1}. ${item.title}${dateHint(item.dueAt, today)}`).join("\n");
  return { message: `${heading}\n${list}`, capability: "supervisor", actions: [] };
}

export function contextualNextStepFastPath(
  plan: AgentTurnPlan,
  context: AgentContext,
  message: string,
): AgentModelResult | undefined {
  if (plan.intent !== "CREATIVE_CHAT") return undefined;
  const normalized = message
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-AR");
  if (
    /\b(?:yo )?(?:arrancaria|empezaria)\b/.test(normalized) &&
    /\b(?:arranque|escapada|escapadita)\b/.test(normalized) &&
    /\b(?:vos que pensas|que te parece|que pensas)\b/.test(normalized)
  ) {
    return directResult(
      "Coincido: arrancaría por la escapada. Entra más rápido en una escena concreta y después podés bajar al mensaje sin explicarlo de más.",
      plan,
    );
  }
  if (
    !/\b(?:como (?:sigo|avanzo) con (?:esto|esta|este)|que hago con (?:esto|esta|este))\b/.test(
      normalized,
    )
  )
    return undefined;

  const item = context.currentViewItem;
  if (!item?.title) return undefined;
  const title = `“${item.title}”`;
  const messageByType: Partial<Record<typeof item.type, string>> = {
    idea: `Con ${title}, elegiría una escena concreta y un remate; después la pasaría a guion. La base ya está.`,
    script: `Con ${title}, ajustaría primero el arranque y el cierre. Si sostienen la misma idea, ya lo pasaría a contenido.`,
    content: `Con ${title}, haría una última pasada por el arranque y el CTA. Si ambos están claros, no sumaría nada más.`,
    task: `Con ${title}, identificaría el bloqueo concreto y cerraría ese punto primero. Después, ejecución corta y afuera.`,
    commitment: `Con ${title}, confirmaría el próximo paso concreto y lo cerraría antes de abrir otro frente.`,
  };
  const response =
    messageByType[item.type] ??
    `Con ${title}, definiría una sola decisión siguiente y la cerraría antes de sumar otra cosa.`;
  return directResult(response, plan);
}

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
