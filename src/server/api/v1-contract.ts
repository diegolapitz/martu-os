import { ZodError } from "zod";

import { statusLabel } from "@/server/data/serialize";

function key(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("es").replace(/[\s-]+/g, "_");
}

const statuses: Record<string, Record<string, string>> = {
  client: { activo: "active", pausado: "paused", en_pausa: "paused", archivado: "archived" },
  strategy: { vigente: "active", activa: "active", activo: "active", borrador: "draft", archivada: "archived" },
  idea: { borrador: "new", nueva: "new", en_evaluacion: "selected", seleccionada: "selected", aprobada: "developing", en_desarrollo: "developing", producida: "produced", descartada: "discarded" },
  script: { borrador: "draft", en_revision: "review", aprobado: "approved", aprobada: "approved", archivado: "archived" },
  content: { idea: "idea", guion: "script", para_grabar: "to_record", grabado: "recorded", editando: "editing", listo: "ready", en_aprobacion: "approval", aprobado: "approved", programado: "scheduled", publicado: "published", entregado: "delivered" },
  work: { pendiente: "pending", en_curso: "in_progress", bloqueada: "blocked", bloqueado: "blocked", completada: "completed", completado: "completed", cancelada: "cancelled", cancelado: "cancelled" },
};

export function normalizeV1Status(kind: keyof typeof statuses, value?: string) {
  if (value == null) return undefined;
  return statuses[kind][key(value)] ?? value.trim();
}

export function uiIdea<T extends Record<string, unknown>>(item: T) {
  return { ...item, status: statusLabel(item.status) };
}

export function uiScript<T extends Record<string, unknown>>(item: T) {
  return { ...item, status: statusLabel(item.status), deadline: item.dueAt ?? null };
}

export function uiContent<T extends Record<string, unknown>>(item: T) {
  return { ...item, status: item.workflowStateLabel ?? statusLabel(item.status), deadline: item.dueAt ?? null };
}

export function uiClient<T extends Record<string, unknown>>(item: T) {
  return { ...item, status: statusLabel(item.status), serviceSlugs: Array.isArray(item.services) ? item.services : [] };
}

export function v1Error(error: unknown, fallback = "No pude completar el cambio.") {
  if (error instanceof ZodError) {
    return Response.json({ message: error.issues[0]?.message ?? "Hay datos inválidos.", issues: error.issues }, { status: 400 });
  }
  const message = error instanceof Error ? error.message : fallback;
  const status = /no encontr[eé]|no existe/i.test(message) ? 404
    : /no contrata|pertenece a otro|no est[aá] activo/i.test(message) ? 409
      : /falta|inv[aá]lid|necesita|no hay cambios|vac[ií]o|debe/i.test(message) ? 400
        : 500;
  return Response.json({ message }, { status });
}

export function numericId(value: string, label = "objeto") {
  if (!/^\d+$/.test(value)) throw new Error(`Identificador de ${label} inválido.`);
  return value;
}
