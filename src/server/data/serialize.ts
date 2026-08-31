import { differenceInCalendarDays, format } from "date-fns";
import { toZonedTime } from "date-fns-tz";

export const APP_TIMEZONE = "America/Argentina/Buenos_Aires";

export function id(value: unknown): string {
  if (typeof value === "bigint") return value.toString();
  return String(value ?? "");
}

export function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.valueOf()) ? String(value ?? "") : parsed.toISOString();
}

export function nullableIso(value: unknown): string | null {
  return value == null ? null : iso(value);
}

export function number(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== "string" || value === "") return [];
  if (value.startsWith("{")) {
    return value.slice(1, -1).split(",").filter(Boolean).map((entry) => entry.replace(/^"|"$/g, ""));
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function jsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch { return {}; }
  }
  return {};
}

export function jsonArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === "string") {
    try { const parsed = JSON.parse(value) as unknown; return Array.isArray(parsed) ? parsed as T[] : []; }
    catch { return []; }
  }
  return [];
}

export function statusLabel(status: unknown): string {
  const labels: Record<string, string> = {
    active: "Activo", paused: "Pausado", archived: "Archivado",
    pending: "Pendiente", in_progress: "En curso", blocked: "Bloqueada",
    completed: "Completada", cancelled: "Cancelada", draft: "Borrador",
    review: "En revisión", approved: "Aprobado", idea: "Idea", script: "Guion",
    to_record: "Para grabar", recorded: "Grabado", editing: "Editando", ready: "Listo",
    approval: "En aprobación", scheduled: "Programado", published: "Publicado", delivered: "Entregado",
    new: "Nueva", selected: "Seleccionada", developing: "En desarrollo", produced: "Producida", discarded: "Descartada",
  };
  return labels[String(status)] ?? String(status ?? "");
}

export function dueLabel(value: unknown, now = new Date()): string {
  if (value == null) return "";
  const date = new Date(iso(value));
  const zoned = toZonedTime(date, APP_TIMEZONE);
  const zonedNow = toZonedTime(now, APP_TIMEZONE);
  const time = format(zoned, "HH:mm");
  const days = differenceInCalendarDays(zoned, zonedNow);
  if (days === 0) return `Hoy ${time}`;
  if (days === 1) return `Mañana ${time}`;
  if (days === -1) return `Ayer ${time}`;
  if (date < now) return `Venció ${format(zoned, "dd/MM")}`;
  return format(zoned, "dd/MM · HH:mm");
}

export function localTime(value: unknown): string {
  return format(toZonedTime(new Date(iso(value)), APP_TIMEZONE), "HH:mm");
}

export function containsSearch(values: unknown[], search: string): boolean {
  if (!search.trim()) return true;
  const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");
  const needle = normalize(search);
  return normalize(values.filter(Boolean).join(" ")).includes(needle);
}
