"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns";
import { es } from "date-fns/locale";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  Plus,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";

import { Feedback } from "@/components/ui";
import {
  clientAccent,
  humanStatus,
  ObjectTypeIcon,
  objectTypeLabel,
} from "@/components/visual-grammar";
import { entityHref } from "@/lib/entity-href";

type CalendarViewMode = "month" | "week" | "day" | "agenda";
type CalendarKindFilter = "all" | "deadline" | "meeting" | "recording" | "publication" | "delivery" | "ads" | "task" | "event";
type CalendarStatusFilter = "all" | "open" | "blocked" | "scheduled" | "completed";
type CalendarClientOption = [slug: string, name: string, accent: string | null];

type CalendarEvent = {
  id: string;
  title: string;
  description?: string | null;
  startsAt: string;
  endsAt?: string | null;
  allDay: boolean;
  kind: string;
  clientSlug?: string | null;
  clientName?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  status?: string | null;
  source?: string | null;
  targetPath?: string | null;
  clientAccent?: string | null;
};

type EventDraft = {
  id?: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  kind: string;
  clientSlug: string;
};

const VIEW_LABELS: Array<[CalendarViewMode, string]> = [
  ["month", "Mes"],
  ["week", "Semana"],
  ["day", "Día"],
  ["agenda", "Agenda"],
];

const KIND_FILTERS: Array<[CalendarKindFilter, string]> = [
  ["all", "Todos"],
  ["deadline", "Deadline"],
  ["meeting", "Reunión"],
  ["recording", "Grabación"],
  ["publication", "Publicación"],
  ["delivery", "Entrega"],
  ["ads", "Pauta"],
  ["task", "Tarea"],
  ["event", "Evento"],
];
const EVENT_KINDS = KIND_FILTERS.filter(([value]) => value !== "all").map(([, label]) => label);
const WEEK_STARTS_ON = 1 as const;

function normalizedToken(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function kindCategory(value: string): Exclude<CalendarKindFilter, "all"> {
  const token = normalizedToken(value);
  if (["task", "tarea"].includes(token)) return "task";
  if (["deadline", "vencimiento"].includes(token)) return "deadline";
  if (["meeting", "reunion"].includes(token)) return "meeting";
  if (["recording", "grabacion"].includes(token)) return "recording";
  if (["content", "publication", "publicacion"].includes(token)) return "publication";
  if (["delivery", "entrega"].includes(token)) return "delivery";
  if (["ads", "pauta", "campaign", "campana"].includes(token)) return "ads";
  return "event";
}

function statusCategory(value?: string | null): Exclude<CalendarStatusFilter, "all"> {
  const token = normalizedToken(value ?? "");
  if (/complete|completed|done|published|hecho|publicado/.test(token)) return "completed";
  if (/block|blocked|waiting|bloque|espera/.test(token)) return "blocked";
  if (/schedule|scheduled|programado/.test(token)) return "scheduled";
  return "open";
}

function normalizeClientOption(raw: unknown): CalendarClientOption | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const slug = typeof row.slug === "string" ? row.slug : typeof row.clientSlug === "string" ? row.clientSlug : null;
  if (!slug) return null;
  const name = typeof row.name === "string" ? row.name : typeof row.clientName === "string" ? row.clientName : slug;
  const accent = typeof row.accent === "string" ? row.accent : typeof row.clientAccent === "string" ? row.clientAccent : null;
  return [slug, name, accent];
}

function mergeClientOptions(...groups: CalendarClientOption[][]) {
  const options = new Map<string, string>();
  for (const group of groups) {
    for (const [slug, name, accent] of group) options.set(slug, JSON.stringify([name || slug, accent]));
  }
  return Array.from(options.entries())
    .map(([slug, serialized]) => {
      const [name, accent] = JSON.parse(serialized) as [string, string | null];
      return [slug, name, accent] as CalendarClientOption;
    })
    .sort((a, b) => a[1].localeCompare(b[1], "es"));
}

function clientOptionsFromEvents(events: CalendarEvent[]): CalendarClientOption[] {
  return events.flatMap((event) => event.clientSlug ? [[event.clientSlug, event.clientName || event.clientSlug, event.clientAccent || null] as CalendarClientOption] : []);
}

function toInputDate(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function defaultDraft(day = new Date()): EventDraft {
  const startsAt = new Date(day);
  startsAt.setHours(10, 0, 0, 0);
  const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1_000);
  return {
    title: "",
    description: "",
    startsAt: toInputDate(startsAt),
    endsAt: toInputDate(endsAt),
    allDay: false,
    kind: "Evento",
    clientSlug: "",
  };
}

function eventDate(event: CalendarEvent) {
  return new Date(event.startsAt);
}

function eventTime(event: CalendarEvent) {
  if (event.allDay) return "Todo el día";
  return format(eventDate(event), "HH:mm");
}

function normalizeEvent(raw: unknown): CalendarEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (row.id == null || typeof row.title !== "string" || typeof row.startsAt !== "string") return null;
  return {
    id: String(row.id),
    title: row.title,
    description: typeof row.description === "string" ? row.description : null,
    startsAt: row.startsAt,
    endsAt: typeof row.endsAt === "string" ? row.endsAt : null,
    allDay: Boolean(row.allDay),
    kind: typeof row.kind === "string" ? row.kind : "Evento",
    clientSlug: typeof row.clientSlug === "string" ? row.clientSlug : null,
    clientName: typeof row.clientName === "string" ? row.clientName : null,
    entityType: typeof row.entityType === "string" ? row.entityType : null,
    entityId: row.entityId != null ? String(row.entityId) : null,
    status: typeof row.status === "string" ? row.status : null,
    source: typeof row.source === "string" ? row.source : null,
    targetPath: typeof row.targetPath === "string" ? row.targetPath : null,
    clientAccent: typeof row.clientAccent === "string" ? row.clientAccent : null,
  };
}

function rangeFor(mode: CalendarViewMode, cursor: Date) {
  if (mode === "month") {
    return {
      from: startOfWeek(startOfMonth(cursor), { weekStartsOn: WEEK_STARTS_ON }),
      to: endOfWeek(endOfMonth(cursor), { weekStartsOn: WEEK_STARTS_ON }),
    };
  }
  if (mode === "week") {
    return {
      from: startOfWeek(cursor, { weekStartsOn: WEEK_STARTS_ON }),
      to: endOfWeek(cursor, { weekStartsOn: WEEK_STARTS_ON }),
    };
  }
  if (mode === "day") return { from: startOfDay(cursor), to: addDays(startOfDay(cursor), 1) };
  return { from: startOfDay(cursor), to: addDays(startOfDay(cursor), 45) };
}

function headingFor(mode: CalendarViewMode, cursor: Date) {
  if (mode === "month") return format(cursor, "MMMM yyyy", { locale: es });
  if (mode === "week") {
    const from = startOfWeek(cursor, { weekStartsOn: WEEK_STARTS_ON });
    const to = endOfWeek(cursor, { weekStartsOn: WEEK_STARTS_ON });
    return `${format(from, "d MMM", { locale: es })} al ${format(to, "d MMM yyyy", { locale: es })}`;
  }
  if (mode === "day") return format(cursor, "EEEE d 'de' MMMM", { locale: es });
  return `Desde ${format(cursor, "d 'de' MMMM", { locale: es })}`;
}

function eventHref(event: CalendarEvent) {
  return event.targetPath || entityHref({
    clientSlug: event.clientSlug,
    entityType: event.entityType || event.kind,
    entityId: event.entityId,
    fallback: "/work",
  });
}

function EventCard({ event, compact = false, onEdit }: { event: CalendarEvent; compact?: boolean; onEdit: (event: CalendarEvent) => void }) {
  const [renderedAt] = useState(() => Date.now());
  const manual = event.source === "manual" || /^\d+$/.test(event.id);
  const category = kindCategory(event.kind);
  const status = statusCategory(event.status);
  const overdue = status !== "completed" && ["task", "deadline", "delivery"].includes(category) && eventDate(event).getTime() < renderedAt;
  const accent = clientAccent(event.clientSlug, event.clientName, event.clientAccent);
  const className = `calendar-v1-event kind-${category} status-${status}${overdue ? " is-overdue" : ""}`;
  const content = (
    <>
      <span className="calendar-v1-event__meta"><ObjectTypeIcon type={event.kind} size={compact ? 10 : 13} /><span className="calendar-v1-event__time">{eventTime(event)}</span><span>{objectTypeLabel(event.kind)}</span></span>
      <strong>{event.title}</strong>
      {!compact && event.description ? <small>{event.description}</small> : null}
      {event.clientName ? <em><i style={{ backgroundColor: accent }} />{event.clientName}</em> : <em>General</em>}
      {!compact ? <span className={`calendar-v1-event__status status-${status}${overdue ? " is-overdue" : ""}`}>{overdue ? "Vencido" : humanStatus(event.status)}</span> : null}
    </>
  );
  if (manual) {
    return <button className={className} style={{ "--client-accent": accent } as CSSProperties} type="button" onClick={() => onEdit(event)}>{content}</button>;
  }
  return <Link className={className} style={{ "--client-accent": accent } as CSSProperties} href={eventHref(event)} prefetch={false}>{content}<ExternalLink size={12} /></Link>;
}

function CalendarMonth({ cursor, events, onPickDay, onEdit }: { cursor: Date; events: CalendarEvent[]; onPickDay: (day: Date) => void; onEdit: (event: CalendarEvent) => void }) {
  const range = rangeFor("month", cursor);
  const days = eachDayOfInterval({ start: range.from, end: range.to });
  return (
    <div className="calendar-month" aria-label={headingFor("month", cursor)}>
      {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((day) => <div className="calendar-month__weekday" aria-hidden="true" key={day}>{day}</div>)}
      {days.map((day) => {
        const dayEvents = events.filter((event) => isSameDay(eventDate(event), day));
        const today = isSameDay(day, new Date());
        return (
          <section className={`calendar-month__day${isSameMonth(day, cursor) ? "" : " is-outside"}${today ? " is-today" : ""}`} aria-label={format(day, "EEEE d 'de' MMMM", { locale: es })} key={day.toISOString()}>
            <button className="calendar-month__number" type="button" onClick={() => onPickDay(day)} aria-label={`Ver ${format(day, "d 'de' MMMM", { locale: es })}`}>{format(day, "d")}</button>
            <div>{dayEvents.slice(0, 3).map((event) => <EventCard event={event} compact onEdit={onEdit} key={event.id} />)}</div>
            {dayEvents.length > 3 ? <button className="calendar-month__more" type="button" onClick={() => onPickDay(day)}>+{dayEvents.length - 3} más</button> : null}
          </section>
        );
      })}
    </div>
  );
}

function CalendarColumns({ days, events, onEdit }: { days: Date[]; events: CalendarEvent[]; onEdit: (event: CalendarEvent) => void }) {
  return (
    <div className={days.length === 1 ? "calendar-columns is-day" : "calendar-columns"}>
      {days.map((day) => {
        const dayEvents = events.filter((event) => isSameDay(eventDate(event), day));
        return (
          <section key={day.toISOString()}>
            <header className={isSameDay(day, new Date()) ? "is-today" : ""}><span>{format(day, "EEE", { locale: es })}</span><strong>{format(day, "d")}</strong></header>
            <div className="calendar-columns__events">
              {!dayEvents.length ? <p>Sin eventos</p> : dayEvents.map((event) => <EventCard event={event} onEdit={onEdit} key={event.id} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function CalendarAgenda({ events, onEdit }: { events: CalendarEvent[]; onEdit: (event: CalendarEvent) => void }) {
  const days = Array.from(new Map(events.map((event) => [format(eventDate(event), "yyyy-MM-dd"), startOfDay(eventDate(event))])).values());
  return (
    <div className="calendar-agenda-v1">
      {!days.length ? <div className="calendar-v1-empty"><CalendarDays size={22} /><strong>No hay eventos en este período</strong><span>Podés crear uno manualmente desde acá.</span></div> : null}
      {days.map((day) => (
        <section key={day.toISOString()}>
          <header><strong>{format(day, "d", { locale: es })}</strong><span>{format(day, "EEEE", { locale: es })}<small>{format(day, "MMMM", { locale: es })}</small></span></header>
          <div>{events.filter((event) => isSameDay(eventDate(event), day)).map((event) => <EventCard event={event} onEdit={onEdit} key={event.id} />)}</div>
        </section>
      ))}
    </div>
  );
}

export function CalendarV1() {
  const [mode, setMode] = useState<CalendarViewMode>("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [clients, setClients] = useState<CalendarClientOption[]>([]);
  const [kind, setKind] = useState<CalendarKindFilter>("all");
  const [clientSlug, setClientSlug] = useState("all");
  const [status, setStatus] = useState<CalendarStatusFilter>("all");
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<EventDraft>(() => defaultDraft());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const calendarRequestRef = useRef(0);
  const visibleRange = useMemo(() => rangeFor(mode, cursor), [cursor, mode]);
  const rangeFrom = visibleRange.from.toISOString();
  const rangeTo = visibleRange.to.toISOString();

  useEffect(() => {
    const requestId = ++calendarRequestRef.current;
    const controller = new AbortController();
    const params = new URLSearchParams({ from: rangeFrom, to: rangeTo });
    void fetch(`/api/calendar/events?${params}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({})) as { events?: unknown[]; clients?: unknown[]; message?: string };
        if (!response.ok) throw new Error(payload.message || "No pude cargar el calendario.");
        if (requestId !== calendarRequestRef.current) return;
        const listedClients = (payload.clients ?? []).map(normalizeClientOption).filter((client): client is CalendarClientOption => Boolean(client));
        const accents = new Map(listedClients.map(([slug, , accent]) => [slug, accent]));
        const nextEvents = (payload.events ?? [])
          .map(normalizeEvent)
          .filter((event): event is CalendarEvent => Boolean(event))
          .map((event) => ({ ...event, clientAccent: event.clientAccent || (event.clientSlug ? accents.get(event.clientSlug) : null) }))
          .sort((a, b) => eventDate(a).getTime() - eventDate(b).getTime());
        setEvents(nextEvents);
        setClients((current) => mergeClientOptions(current, listedClients, clientOptionsFromEvents(nextEvents)));
        setFeedback((current) => current?.error ? null : current);
      })
      .catch((error: unknown) => {
        if (requestId === calendarRequestRef.current && (error as { name?: string }).name !== "AbortError") {
          setFeedback({ message: error instanceof Error ? error.message : "No pude cargar el calendario.", error: true });
        }
      })
      .finally(() => {
        if (requestId === calendarRequestRef.current) setLoading(false);
      });
    return () => controller.abort();
  }, [rangeFrom, rangeTo, reloadToken]);

  const filtered = events.filter((event) => {
    const matchesKind = kind === "all" || kindCategory(event.kind) === kind;
    const matchesClient = clientSlug === "all" || event.clientSlug === clientSlug;
    const matchesStatus = status === "all" || statusCategory(event.status) === status;
    return matchesKind && matchesClient && matchesStatus;
  });

  function move(direction: -1 | 1) {
    setLoading(true);
    if (mode === "month") setCursor((date) => direction > 0 ? addMonths(date, 1) : subMonths(date, 1));
    else if (mode === "week") setCursor((date) => direction > 0 ? addWeeks(date, 1) : subWeeks(date, 1));
    else setCursor((date) => addDays(date, direction * (mode === "agenda" ? 30 : 1)));
  }

  function createFor(day = cursor) {
    setDraft(defaultDraft(day));
    setDialogOpen(true);
  }

  function editEvent(event: CalendarEvent) {
    setDraft({
      id: event.id,
      title: event.title,
      description: event.description || "",
      startsAt: toInputDate(event.startsAt),
      endsAt: event.endsAt ? toInputDate(event.endsAt) : "",
      allDay: event.allDay,
      kind: event.kind || "Evento",
      clientSlug: event.clientSlug || "",
    });
    setDialogOpen(true);
  }

  async function saveEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.title.trim() || !draft.startsAt || saving) return;
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch(draft.id ? `/api/calendar/events/${encodeURIComponent(draft.id)}` : "/api/calendar/events", {
        method: draft.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title.trim(),
          description: draft.description.trim() || null,
          startsAt: new Date(draft.startsAt).toISOString(),
          endsAt: draft.endsAt ? new Date(draft.endsAt).toISOString() : null,
          allDay: draft.allDay,
          kind: draft.kind,
          clientSlug: draft.clientSlug || null,
          status: "scheduled",
        }),
      });
      const payload = await response.json().catch(() => ({})) as { event?: unknown; message?: string };
      if (!response.ok) throw new Error(payload.message || "No pude guardar el evento.");
      const saved = normalizeEvent(payload.event);
      if (saved) {
        const savedWithAccent = { ...saved, clientAccent: saved.clientAccent || clients.find(([slug]) => slug === saved.clientSlug)?.[2] || null };
        setEvents((current) => [...current.filter((item) => item.id !== saved.id), savedWithAccent].sort((a, b) => eventDate(a).getTime() - eventDate(b).getTime()));
        setClients((current) => mergeClientOptions(current, clientOptionsFromEvents([saved])));
      }
      setDialogOpen(false);
      setFeedback({ message: draft.id ? "Evento actualizado." : "Evento creado." });
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : "No pude guardar el evento.", error: true });
    } finally {
      setSaving(false);
    }
  }

  async function deleteEvent() {
    if (!draft.id || saving || !window.confirm(`¿Eliminar “${draft.title}”?`)) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/calendar/events/${encodeURIComponent(draft.id)}`, { method: "DELETE" });
      const payload = await response.json().catch(() => ({})) as { message?: string };
      if (!response.ok) throw new Error(payload.message || "No pude eliminar el evento.");
      setEvents((current) => current.filter((event) => event.id !== draft.id));
      setDialogOpen(false);
      setFeedback({ message: "Evento eliminado." });
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : "No pude eliminar el evento.", error: true });
    } finally {
      setSaving(false);
    }
  }

  const weekDays = eachDayOfInterval({
    start: startOfWeek(cursor, { weekStartsOn: WEEK_STARTS_ON }),
    end: endOfWeek(cursor, { weekStartsOn: WEEK_STARTS_ON }),
  });

  return (
    <div className="standard-page calendar-v1-page">
      <header className="standard-heading calendar-v1-heading">
        <div><p>Operación y entregas</p><h1>Calendario</h1><span>Todo lo que tiene fecha, en una sola vista.</span></div>
        <button className="button button--primary" type="button" onClick={() => createFor(new Date())}><Plus size={17} />Nuevo evento</button>
      </header>

      <div className="calendar-v1-toolbar">
        <div className="calendar-v1-nav">
          <button type="button" onClick={() => { setLoading(true); setCursor(new Date()); setReloadToken((current) => current + 1); }}>Hoy</button>
          <button className="icon-button" type="button" onClick={() => move(-1)} aria-label="Período anterior"><ChevronLeft size={18} /></button>
          <button className="icon-button" type="button" onClick={() => move(1)} aria-label="Período siguiente"><ChevronRight size={18} /></button>
          <strong>{headingFor(mode, cursor)}</strong>
        </div>
        <div className="calendar-v1-actions">
          <button className={filtersOpen || kind !== "all" || clientSlug !== "all" || status !== "all" ? "filter-button is-active" : "filter-button"} type="button" onClick={() => setFiltersOpen((value) => !value)} aria-expanded={filtersOpen} aria-controls="calendar-filters"><SlidersHorizontal size={15} />Filtros</button>
          <div className="segmented-control" role="group" aria-label="Vista del calendario">
            {VIEW_LABELS.map(([value, label]) => <button className={mode === value ? "is-active" : ""} type="button" aria-pressed={mode === value} onClick={() => { if (value !== mode) { setLoading(true); setMode(value); } }} key={value}>{label}</button>)}
          </div>
        </div>
      </div>

      {filtersOpen ? (
        <div className="calendar-v1-filters" id="calendar-filters">
          <label><span>Cliente</span><select value={clientSlug} onChange={(event) => setClientSlug(event.target.value)}><option value="all">Todos</option>{clients.map(([slug, name]) => <option value={slug} key={slug}>{name}</option>)}</select></label>
          <label><span>Tipo</span><select value={kind} onChange={(event) => setKind(event.target.value as CalendarKindFilter)}>{KIND_FILTERS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label><span>Estado</span><select value={status} onChange={(event) => setStatus(event.target.value as CalendarStatusFilter)}><option value="all">Todos</option><option value="open">Pendientes</option><option value="scheduled">Programados</option><option value="blocked">Bloqueados</option><option value="completed">Completados</option></select></label>
          <span className="calendar-v1-filter-summary">{[kind !== "all", clientSlug !== "all", status !== "all"].filter(Boolean).length} activos</span>
          <button type="button" onClick={() => { setKind("all"); setClientSlug("all"); setStatus("all"); }}>Limpiar</button>
        </div>
      ) : null}

      <div className="calendar-client-legend" aria-label="Filtrar por cliente">
        <button className={clientSlug === "all" ? "is-active" : ""} type="button" onClick={() => setClientSlug("all")} aria-pressed={clientSlug === "all"}>Todos</button>
        {clients.map(([slug, name, accent]) => (
          <button className={clientSlug === slug ? "is-active" : ""} type="button" onClick={() => setClientSlug((current) => current === slug ? "all" : slug)} aria-pressed={clientSlug === slug} key={slug}>
            <i style={{ backgroundColor: clientAccent(slug, name, accent) }} />{name}
          </button>
        ))}
      </div>

      <Feedback message={feedback?.message} tone={feedback?.error ? "error" : "success"} />
      <div className="calendar-v1-surface" aria-busy={loading}>
        {loading ? <div className="calendar-v1-loading" role="status"><p className="sr-only">Cargando calendario</p><span aria-hidden="true" /><span aria-hidden="true" /><span aria-hidden="true" /></div> : null}
        {!loading && mode === "month" ? <CalendarMonth cursor={cursor} events={filtered} onPickDay={(day) => { setLoading(true); setCursor(day); setMode("day"); }} onEdit={editEvent} /> : null}
        {!loading && mode === "week" ? <CalendarColumns days={weekDays} events={filtered} onEdit={editEvent} /> : null}
        {!loading && mode === "day" ? <CalendarColumns days={[cursor]} events={filtered} onEdit={editEvent} /> : null}
        {!loading && mode === "agenda" ? <CalendarAgenda events={filtered} onEdit={editEvent} /> : null}
      </div>

      {dialogOpen ? (
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="calendar-dialog-title">
          <button className="modal__scrim" type="button" onClick={() => setDialogOpen(false)} aria-label="Cerrar" />
          <form className="modal__body calendar-event-dialog" onSubmit={saveEvent} aria-busy={saving}>
            <header><div><p>{draft.id ? "Evento manual" : "Nuevo evento"}</p><h2 id="calendar-dialog-title">{draft.id ? "Editar evento" : "Agendar algo"}</h2></div><button className="icon-button" type="button" onClick={() => setDialogOpen(false)} aria-label="Cerrar"><X size={19} /></button></header>
            <label className="field field--wide"><span>Título</span><input autoFocus required value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} /></label>
            <div className="calendar-event-dialog__grid">
              <label className="field"><span>Empieza</span><input required type="datetime-local" value={draft.startsAt} onChange={(event) => setDraft((current) => ({ ...current, startsAt: event.target.value }))} /></label>
              <label className="field"><span>Termina</span><input type="datetime-local" value={draft.endsAt} onChange={(event) => setDraft((current) => ({ ...current, endsAt: event.target.value }))} /></label>
              <label className="field"><span>Tipo</span><select value={draft.kind} onChange={(event) => setDraft((current) => ({ ...current, kind: event.target.value }))}>{EVENT_KINDS.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label className="field"><span>Cliente</span><select value={draft.clientSlug} onChange={(event) => setDraft((current) => ({ ...current, clientSlug: event.target.value }))}><option value="">General</option>{clients.map(([slug, name]) => <option value={slug} key={slug}>{name}</option>)}</select></label>
            </div>
            <label className="field field--wide"><span>Detalle</span><textarea rows={4} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></label>
            <label className="calendar-all-day"><input type="checkbox" checked={draft.allDay} onChange={(event) => setDraft((current) => ({ ...current, allDay: event.target.checked }))} />Todo el día</label>
            <footer>
              {draft.id ? <button className="button button--danger" type="button" onClick={() => void deleteEvent()} disabled={saving}><Trash2 size={15} />Eliminar</button> : <span />}
              <div><button className="button button--secondary" type="button" onClick={() => setDialogOpen(false)}>Cancelar</button><button className="button button--primary" type="submit" disabled={saving}><Clock3 size={15} />{saving ? "Guardando" : "Guardar evento"}</button></div>
            </footer>
          </form>
        </div>
      ) : null}
    </div>
  );
}
