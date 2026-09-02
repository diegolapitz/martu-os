"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CalendarClock,
  CalendarDays,
  Check,
  ChevronRight,
  Circle,
  ListTodo,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { ClientIdentity, ClientMark } from "@/components/brand";
import type { DayData, DayPriority } from "@/components/types";
import { announceFeedback, Feedback } from "@/components/ui";
import {
  clientAccent,
  humanStatus,
  ObjectTypeIcon,
  objectTypeLabel,
} from "@/components/visual-grammar";
import { entityHref } from "@/lib/entity-href";

type WorkStatus = "pending" | "in_progress" | "blocked" | "completed";
type WorkBucket = "inbox" | "today" | "next" | "waiting" | "someday";
type WorkPriority = "low" | "medium" | "high" | "urgent";
type WorkFilter = "all" | "today" | "overdue" | "next" | "waiting" | "someday" | "completed";

type WorkRecord = DayPriority & {
  description?: string;
  status: WorkStatus;
  priority: WorkPriority;
  dueAt?: string | null;
  bucket: WorkBucket;
  kind: string;
  clientAccent?: string | null;
  sortOrder?: number;
};

type WorkDraft = {
  title: string;
  description: string;
  clientSlug: string;
  status: WorkStatus;
  priority: WorkPriority;
  dueAt: string;
  bucket: WorkBucket;
  kind: string;
};

type WorkEditor =
  | { mode: "create"; draft: WorkDraft }
  | { mode: "edit"; itemId: string; draft: WorkDraft };

type ClientChoice = { slug: string; name: string; accent: string | null };

const filters: Array<{ id: WorkFilter; label: string }> = [
  { id: "all", label: "Todo" },
  { id: "today", label: "Hoy" },
  { id: "overdue", label: "Vencido" },
  { id: "next", label: "Próximo" },
  { id: "waiting", label: "En espera" },
  { id: "someday", label: "Algún día" },
  { id: "completed", label: "Hecho" },
];

const statusOptions: Array<{ value: WorkStatus; label: string }> = [
  { value: "pending", label: "Pendiente" },
  { value: "in_progress", label: "En curso" },
  { value: "blocked", label: "Bloqueado" },
  { value: "completed", label: "Completado" },
];

const priorityOptions: Array<{ value: WorkPriority; label: string }> = [
  { value: "urgent", label: "Urgente" },
  { value: "high", label: "Alta" },
  { value: "medium", label: "Media" },
  { value: "low", label: "Baja" },
];

const bucketOptions: Array<{ value: WorkBucket; label: string }> = [
  { value: "inbox", label: "Inbox" },
  { value: "today", label: "Hoy" },
  { value: "next", label: "Próximo" },
  { value: "waiting", label: "En espera" },
  { value: "someday", label: "Algún día" },
];

const emptyDraft: WorkDraft = {
  title: "",
  description: "",
  clientSlug: "",
  status: "pending",
  priority: "medium",
  dueAt: "",
  bucket: "inbox",
  kind: "task",
};

function normalizeText(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("es");
}

function isWorkStatus(value: unknown): value is WorkStatus {
  return ["pending", "in_progress", "blocked", "completed"].includes(String(value));
}

function isWorkPriority(value: unknown): value is WorkPriority {
  return ["low", "medium", "high", "urgent"].includes(String(value));
}

function isWorkBucket(value: unknown): value is WorkBucket {
  return ["inbox", "today", "next", "waiting", "someday"].includes(String(value));
}

function fallbackBucket(item: Pick<DayPriority, "status" | "dueLabel">): WorkBucket {
  const hint = normalizeText((item.status ?? "") + " " + (item.dueLabel ?? ""));
  if (/bloque|traba|espera/.test(hint)) return "waiting";
  if (/hoy|venc|atras/.test(hint)) return "today";
  return "next";
}

function fromDayPriority(item: DayPriority): WorkRecord {
  const normalizedStatus = normalizeText(item.status);
  return {
    ...item,
    status: /complet|done|hecho/.test(normalizedStatus) ? "completed" : /bloque/.test(normalizedStatus) ? "blocked" : "pending",
    priority: "medium",
    dueAt: null,
    bucket: fallbackBucket(item),
    kind: "task",
    clientAccent: null,
  };
}

function normalizeWorkRecord(value: unknown): WorkRecord | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (!row.id || !row.title) return null;
  const client = row.client && typeof row.client === "object" ? row.client as Record<string, unknown> : null;
  const status = isWorkStatus(row.status) ? row.status : "pending";
  const priority = isWorkPriority(row.priority) ? row.priority : "medium";
  const dueAt = typeof row.dueAt === "string" ? row.dueAt : null;
  const bucket = isWorkBucket(row.bucket)
    ? row.bucket
    : dueAt
      ? "next"
      : "inbox";

  return {
    id: String(row.id),
    title: String(row.title),
    description: typeof row.description === "string" ? row.description : "",
    clientName: typeof row.clientName === "string" ? row.clientName : typeof client?.name === "string" ? client.name : undefined,
    clientSlug: typeof row.clientSlug === "string" ? row.clientSlug : typeof client?.slug === "string" ? client.slug : undefined,
    clientAccent: typeof row.clientAccent === "string" ? row.clientAccent : typeof client?.accent === "string" ? client.accent : null,
    status,
    priority,
    dueAt,
    dueLabel: typeof row.dueLabel === "string" ? row.dueLabel : undefined,
    bucket,
    kind: typeof row.kind === "string" ? row.kind : typeof row.workKind === "string" ? row.workKind : "task",
    sortOrder: typeof row.sortOrder === "number" ? row.sortOrder : undefined,
    entityType: typeof row.entityType === "string" ? row.entityType : undefined,
    entityId: typeof row.entityId === "string" || typeof row.entityId === "number" ? String(row.entityId) : undefined,
  };
}

function recordsFromPayload(payload: unknown) {
  if (Array.isArray(payload)) return payload.map(normalizeWorkRecord).filter((item): item is WorkRecord => Boolean(item));
  if (!payload || typeof payload !== "object") return [];
  const value = payload as Record<string, unknown>;
  for (const key of ["items", "work", "workItems", "tasks"]) {
    if (Array.isArray(value[key])) {
      return (value[key] as unknown[]).map(normalizeWorkRecord).filter((item): item is WorkRecord => Boolean(item));
    }
  }
  return [];
}

function clientsFromPayload(payload: unknown): ClientChoice[] {
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { clients?: unknown }).clients)) return [];
  return ((payload as { clients: unknown[] }).clients)
    .map((value) => {
      if (!value || typeof value !== "object") return null;
      const row = value as Record<string, unknown>;
      if (typeof row.slug !== "string" || typeof row.name !== "string") return null;
      return {
        slug: row.slug,
        name: row.name,
        accent: typeof row.accent === "string" ? row.accent : null,
      };
    })
    .filter((item): item is ClientChoice => Boolean(item));
}

function recordFromPayload(payload: unknown) {
  const direct = normalizeWorkRecord(payload);
  if (direct) return direct;
  if (!payload || typeof payload !== "object") return null;
  const value = payload as Record<string, unknown>;
  for (const key of ["item", "work", "workItem", "task"]) {
    const item = normalizeWorkRecord(value[key]);
    if (item) return item;
  }
  return null;
}

function mergeWorkRecord(previous: WorkRecord, saved: WorkRecord): WorkRecord {
  return {
    ...previous,
    ...saved,
    clientName: saved.clientName ?? previous.clientName,
    clientSlug: saved.clientSlug ?? previous.clientSlug,
    entityType: saved.entityType ?? previous.entityType,
    entityId: saved.entityId ?? previous.entityId,
  };
}

async function apiJson(url: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set("Content-Type", "application/json");
  const response = await fetch(url, { ...init, headers });
  const payload = await response.json().catch(() => null) as unknown;
  if (!response.ok) {
    const detail = payload && typeof payload === "object" && "message" in payload
      ? String((payload as { message?: unknown }).message ?? "")
      : "";
    throw new Error(detail || "No pude guardar ese trabajo.");
  }
  return payload;
}

function toLocalDateTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function workDraft(item: WorkRecord): WorkDraft {
  return {
    title: item.title,
    description: item.description ?? "",
    clientSlug: item.clientSlug ?? "",
    status: item.status,
    priority: item.priority,
    dueAt: toLocalDateTime(item.dueAt),
    bucket: item.bucket,
    kind: item.kind,
  };
}

function isSameLocalDay(value: string, target: Date) {
  const date = new Date(value);
  return !Number.isNaN(date.getTime())
    && date.getFullYear() === target.getFullYear()
    && date.getMonth() === target.getMonth()
    && date.getDate() === target.getDate();
}

function itemFilter(item: WorkRecord): Exclude<WorkFilter, "all"> {
  if (item.status === "completed") return "completed";
  if (item.bucket === "waiting" || item.status === "blocked") return "waiting";
  if (item.bucket === "someday") return "someday";
  if (item.dueAt) {
    const due = new Date(item.dueAt);
    const now = new Date();
    if (!Number.isNaN(due.getTime()) && due.getTime() < now.getTime() && !isSameLocalDay(item.dueAt, now)) return "overdue";
    if (isSameLocalDay(item.dueAt, now)) return "today";
  }
  if (item.bucket === "today" || fallbackBucket(item) === "today") return "today";
  return "next";
}

function workHref(item: WorkRecord) {
  const type = normalizeText(item.entityType).replace(/\s+/g, "_");
  if (type && type !== "task" && (item.clientSlug || item.entityId)) {
    return entityHref({
      clientSlug: item.clientSlug,
      entityType: item.entityType,
      entityId: item.entityId,
      fallback: "/work?item=" + encodeURIComponent(item.id),
    });
  }
  return "/work?item=" + encodeURIComponent(item.id);
}

function displayDue(item: WorkRecord) {
  if (!item.dueAt) return item.dueLabel || (item.bucket === "someday" ? "Algún día" : "Sin fecha");
  const due = new Date(item.dueAt);
  if (Number.isNaN(due.getTime())) return item.dueLabel || "Sin fecha";
  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(due);
}

function friendlyClient(item: WorkRecord) {
  if (item.clientName) return item.clientName;
  if (!item.clientSlug) return "Trabajo interno";
  return clientNameFromSlug(item.clientSlug);
}

function clientNameFromSlug(slug: string) {
  return slug.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function WorkView({ data }: { data: DayData }) {
  const [items, setItems] = useState<WorkRecord[]>(() => data.priorities.map(fromDayPriority));
  const [clientChoices, setClientChoices] = useState<ClientChoice[]>(() => {
    const unique = new Map<string, ClientChoice>();
    for (const item of data.priorities) {
      if (item.clientSlug) unique.set(item.clientSlug, { slug: item.clientSlug, name: item.clientName || item.clientSlug, accent: null });
    }
    return [...unique.values()];
  });
  const [filter, setFilter] = useState<WorkFilter>("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<WorkStatus | "all">("all");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [editor, setEditor] = useState<WorkEditor | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(() => new Set());
  const [saving, setSaving] = useState(false);
  const [prioritizing, setPrioritizing] = useState(false);
  const [proposalOpen, setProposalOpen] = useState(false);
  const [loadingRemote, setLoadingRemote] = useState(true);
  const [priorityClock] = useState(() => Date.now());
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; tone: "success" | "error" } | null>(null);

  useEffect(() => {
    let ignore = false;
    void apiJson("/api/work")
      .then((payload) => {
        if (ignore) return;
        const rows = recordsFromPayload(payload);
        setItems(rows);
        const clients = clientsFromPayload(payload);
        if (clients.length) setClientChoices(clients);
      })
      .catch(() => {
        if (!ignore) {
          setFeedback({ message: "Estoy mostrando el trabajo del día. No pude cargar todavía la lista completa.", tone: "error" });
        }
      })
      .finally(() => {
        if (!ignore) setLoadingRemote(false);
      });
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    function openFromLocation() {
      const itemId = new URLSearchParams(window.location.search).get("item");
      if (!itemId) return;
      const item = items.find((candidate) => candidate.id === itemId);
      if (item) setEditor({ mode: "edit", itemId: item.id, draft: workDraft(item) });
    }
    openFromLocation();
    window.addEventListener("popstate", openFromLocation);
    return () => window.removeEventListener("popstate", openFromLocation);
  }, [items]);

  const counts = useMemo(() => {
    const next: Record<WorkFilter, number> = { all: items.length, today: 0, overdue: 0, next: 0, waiting: 0, someday: 0, completed: 0 };
    for (const item of items) next[itemFilter(item)] += 1;
    return next;
  }, [items]);

  const visibleItems = useMemo(() => {
    const normalized = normalizeText(deferredQuery);
    return items.filter((item) => {
      if (filter !== "all" && itemFilter(item) !== filter) return false;
      if (clientFilter !== "all" && item.clientSlug !== clientFilter) return false;
      if (kindFilter !== "all" && normalizeText(item.kind) !== kindFilter) return false;
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (!normalized) return true;
      return normalizeText(item.title + " " + friendlyClient(item) + " " + item.description + " " + item.status).includes(normalized);
    });
  }, [clientFilter, deferredQuery, filter, items, kindFilter, statusFilter]);

  const kindChoices = useMemo(
    () => Array.from(new Map(items.map((item) => [normalizeText(item.kind), objectTypeLabel(item.kind)])).entries())
      .filter(([value]) => Boolean(value))
      .sort((a, b) => a[1].localeCompare(b[1], "es")),
    [items],
  );

  const priorityProposal = useMemo(() => {
    const score = (item: WorkRecord) => {
      const period = itemFilter(item);
      const periodScore = period === "overdue" ? 900 : period === "today" ? 700 : period === "next" ? 350 : period === "waiting" ? 120 : 50;
      const priorityScore = item.priority === "urgent" ? 240 : item.priority === "high" ? 160 : item.priority === "medium" ? 80 : 20;
      const due = item.dueAt ? new Date(item.dueAt).getTime() : Number.POSITIVE_INFINITY;
      const proximity = Number.isFinite(due) ? Math.max(0, 100 - Math.floor(Math.max(0, due - priorityClock) / 86_400_000)) : 0;
      return periodScore + priorityScore + proximity;
    };
    return visibleItems
      .filter((item) => item.status !== "completed")
      .sort((a, b) => score(b) - score(a))
      .slice(0, 3);
  }, [priorityClock, visibleItems]);

  function proposalReason(item: WorkRecord) {
    const period = itemFilter(item);
    if (period === "overdue") return "Está vencido y sigue abierto";
    if (period === "today") return "Tiene fecha para hoy";
    if (item.priority === "urgent") return "Está marcado como urgente";
    if (item.priority === "high") return "Tiene prioridad alta";
    if (period === "waiting") return "Necesita destrabarse";
    return item.dueAt ? "Es de lo más próximo" : "Conviene sacarlo del inbox";
  }

  function updateDraft(patch: Partial<WorkDraft>) {
    setEditor((current) => current ? { ...current, draft: { ...current.draft, ...patch } } : current);
  }

  function setItemInUrl(itemId: string | null) {
    const url = new URL(window.location.href);
    if (itemId) url.searchParams.set("item", itemId);
    else url.searchParams.delete("item");
    window.history.pushState(null, "", url.pathname + url.search + url.hash);
  }

  function openCreate() {
    setItemInUrl(null);
    setConfirmingDelete(false);
    setEditor({ mode: "create", draft: { ...emptyDraft } });
  }

  function openEdit(item: WorkRecord) {
    setItemInUrl(item.id);
    setConfirmingDelete(false);
    setEditor({ mode: "edit", itemId: item.id, draft: workDraft(item) });
  }

  function closeEditor() {
    setItemInUrl(null);
    setConfirmingDelete(false);
    setEditor(null);
  }

  async function setStatus(item: WorkRecord, status: WorkStatus) {
    if (busyIds.has(item.id)) return;
    const previous = item;
    const optimistic = { ...item, status };
    setItems((current) => current.map((candidate) => candidate.id === item.id ? optimistic : candidate));
    setBusyIds((current) => new Set(current).add(item.id));
    setFeedback(null);
    try {
      const payload = await apiJson("/api/work/" + encodeURIComponent(item.id), {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      const saved = recordFromPayload(payload);
      if (saved) setItems((current) => current.map((candidate) => candidate.id === item.id ? mergeWorkRecord(candidate, saved) : candidate));
      const message = status === "completed" ? "Trabajo completado." : "Trabajo reabierto.";
      setFeedback({ message, tone: "success" });
      announceFeedback(message);
    } catch (error) {
      setItems((current) => current.map((candidate) => candidate.id === item.id ? previous : candidate));
      const message = error instanceof Error ? error.message : "No pude actualizar ese trabajo.";
      setFeedback({ message, tone: "error" });
      announceFeedback(message, "error");
    } finally {
      setBusyIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  }

  async function saveEditor() {
    if (!editor || saving) return;
    const title = editor.draft.title.trim();
    if (!title) {
      const message = "Poné un título para guardar el trabajo.";
      setFeedback({ message, tone: "error" });
      announceFeedback(message, "error");
      return;
    }

    const dueAt = editor.draft.dueAt ? new Date(editor.draft.dueAt).toISOString() : null;
    const body = {
      title,
      description: editor.draft.description.trim(),
      status: editor.draft.status,
      priority: editor.draft.priority,
      dueAt,
      bucket: editor.draft.bucket,
      kind: editor.draft.kind.trim() || "task",
      ...(editor.mode === "create" && editor.draft.clientSlug.trim() ? { clientSlug: editor.draft.clientSlug.trim() } : {}),
    };

    setSaving(true);
    setFeedback(null);
    try {
      const isCreate = editor.mode === "create";
      const payload = await apiJson(isCreate ? "/api/work" : "/api/work/" + encodeURIComponent(editor.itemId), {
        method: isCreate ? "POST" : "PATCH",
        body: JSON.stringify(body),
      });
      const rawSaved = recordFromPayload(payload);
      if (!rawSaved) throw new Error("El trabajo se guardó, pero no pude leer la respuesta.");
      const previous = editor.mode === "edit" ? items.find((item) => item.id === editor.itemId) : null;
      const saved = previous ? mergeWorkRecord(previous, rawSaved) : rawSaved;
      setItems((current) => isCreate
        ? [saved, ...current]
        : current.map((item) => item.id === saved.id ? saved : item));
      setEditor({ mode: "edit", itemId: saved.id, draft: workDraft(saved) });
      setItemInUrl(saved.id);
      const message = isCreate ? "Trabajo creado." : "Cambios guardados.";
      setFeedback({ message, tone: "success" });
      announceFeedback(message);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No pude guardar ese trabajo.";
      setFeedback({ message, tone: "error" });
      announceFeedback(message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem() {
    if (!editor || editor.mode !== "edit" || saving) return;
    const itemId = editor.itemId;
    const previous = items;
    setItems((current) => current.filter((item) => item.id !== itemId));
    setSaving(true);
    setFeedback(null);
    try {
      await apiJson("/api/work/" + encodeURIComponent(itemId), { method: "DELETE" });
      closeEditor();
      setFeedback({ message: "Trabajo eliminado.", tone: "success" });
      announceFeedback("Trabajo eliminado.");
    } catch (error) {
      setItems(previous);
      const message = error instanceof Error ? error.message : "No pude eliminar ese trabajo.";
      setFeedback({ message, tone: "error" });
      announceFeedback(message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function applyPriorityProposal() {
    if (prioritizing || priorityProposal.length === 0) return;
    const previous = items;
    const proposedIds = new Set(priorityProposal.map((item) => item.id));
    setPrioritizing(true);
    setFeedback(null);
    setItems([
      ...priorityProposal.map((item, index) => ({ ...item, sortOrder: index })),
      ...items.filter((item) => !proposedIds.has(item.id)),
    ]);
    try {
      await Promise.all(
        priorityProposal.map((item, index) =>
          apiJson("/api/work/" + encodeURIComponent(item.id), {
            method: "PATCH",
            body: JSON.stringify({ sortOrder: index }),
          }),
        ),
      );
      const message = "Orden aplicado. Tus tres primeros frentes ya quedaron arriba.";
      setFeedback({ message, tone: "success" });
      announceFeedback(message);
    } catch (error) {
      setItems(previous);
      const message = error instanceof Error ? error.message : "No pude aplicar ese orden.";
      setFeedback({ message, tone: "error" });
      announceFeedback(message, "error");
    } finally {
      setPrioritizing(false);
    }
  }

  function discussPriorityProposal() {
    window.localStorage.removeItem("martu-supervisor-thread");
    window.sessionStorage.setItem("martu-supervisor-new", "true");
    window.sessionStorage.setItem(
      "martu-supervisor-prefill",
      "Quiero revisar esta propuesta de prioridades de Trabajo.",
    );
    window.dispatchEvent(new Event("martu:open-ai"));
    window.setTimeout(() => {
      window.dispatchEvent(new Event("martu:supervisor-new"));
      window.dispatchEvent(
        new CustomEvent("martu:supervisor-prefill", {
          detail: { message: "Quiero revisar esta propuesta de prioridades de Trabajo." },
        }),
      );
    }, 80);
  }

  return (
    <div className="standard-page work-page">
      <header className="standard-heading work-heading">
        <div>
          <p>Vista operativa</p>
          <h1>Trabajo</h1>
          <span>Una sola lista para crear, ordenar y cerrar lo que está en movimiento.</span>
        </div>
        <div className="work-heading__actions">
          <button className="button" type="button" onClick={() => setProposalOpen(true)}>
            <Sparkles size={17} /> Priorizar
          </button>
          <button className="button button--primary" type="button" onClick={openCreate}>
            <Plus size={17} /> Nuevo trabajo
          </button>
        </div>
      </header>

      <div className="work-layout">
        <section className="work-list-panel" aria-labelledby="work-list-title" aria-busy={loadingRemote}>
          <div className="collection-toolbar work-toolbar">
            <div className="segmented-control work-filters" aria-label="Filtrar trabajo por período">
              {filters.map((item) => (
                <button className={filter === item.id ? "is-current" : ""} type="button" key={item.id} onClick={() => setFilter(item.id)} aria-pressed={filter === item.id}>
                  {item.label}<span>{counts[item.id]}</span>
                </button>
              ))}
            </div>
            <label className="search-field work-search">
              <Search size={17} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar trabajo o cliente" aria-label="Buscar trabajo o cliente" />
            </label>
          </div>

          <div className="work-facet-bar" aria-label="Filtros de trabajo">
            <label>
              <span>Cliente</span>
              <select value={clientFilter} onChange={(event) => setClientFilter(event.target.value)}>
                <option value="all">Todos</option>
                {clientChoices.map((client) => <option value={client.slug} key={client.slug}>{client.name}</option>)}
              </select>
            </label>
            <label>
              <span>Tipo</span>
              <select value={kindFilter} onChange={(event) => setKindFilter(event.target.value)}>
                <option value="all">Todos</option>
                {kindChoices.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
            </label>
            <label>
              <span>Estado</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as WorkStatus | "all")}>
                <option value="all">Todos</option>
                {statusOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
              </select>
            </label>
            <button type="button" onClick={() => { setClientFilter("all"); setKindFilter("all"); setStatusFilter("all"); setFilter("all"); setQuery(""); }}>Limpiar</button>
          </div>

          <div className="work-list-heading" id="work-list-title">
            <span>Trabajo · {visibleItems.length}</span>
            <span>Cliente</span>
            <span>Estado</span>
            <span>Vence</span>
          </div>

          <div className="work-list">
            {visibleItems.map((item) => {
              const complete = item.status === "completed";
              const bucket = itemFilter(item);
              const busy = busyIds.has(item.id);
              const href = workHref(item);
              const accent = clientAccent(
                item.clientSlug,
                item.clientName,
                item.clientAccent || clientChoices.find((client) => client.slug === item.clientSlug)?.accent,
              );
              return (
                <article className={"work-row" + (complete ? " is-complete" : "") + (editor?.mode === "edit" && editor.itemId === item.id ? " is-selected" : "")} style={{ "--client-accent": accent } as CSSProperties} key={item.id}>
                  <button className={"check-button" + (complete ? " is-checked" : "")} type="button" onClick={() => void setStatus(item, complete ? "pending" : "completed")} disabled={busy} aria-label={complete ? "Reabrir " + item.title : "Completar " + item.title}>
                    {busy ? <LoaderCircle className="spin" size={17} /> : complete ? <Check size={17} /> : <Circle size={23} strokeWidth={1.45} />}
                  </button>
                  <button
                    className="work-row__identity"
                    type="button"
                    onClick={() => openEdit(item)}
                    aria-label={`Editar ${item.title}. ${friendlyClient(item)}. ${humanStatus(item.status)}. ${objectTypeLabel(item.kind || item.entityType)}.`}
                  >
                    <span className="work-row__task">
                      <strong><ObjectTypeIcon type={item.kind || item.entityType} size={16} />{item.title}</strong>
                      <small>{objectTypeLabel(item.kind || item.entityType)}</small>
                    </span>
                    <ClientIdentity
                      className="work-row__client"
                      name={friendlyClient(item)}
                      accent={accent}
                      meta={item.clientSlug ? "Cliente" : "Interno"}
                      compact
                    />
                    <span className="work-row__meta"><small>{humanStatus(item.status)}</small></span>
                  </button>
                  <span className={"work-due work-due--" + bucket}><CalendarDays size={14} />{displayDue(item)}</span>
                  <Link href={href} prefetch={false} onClick={(event) => {
                    if (href.startsWith("/work?") && !event.ctrlKey && !event.metaKey && !event.shiftKey && event.button === 0) {
                      event.preventDefault();
                      openEdit(item);
                    }
                  }} aria-label={"Abrir " + item.title}><ChevronRight size={19} /></Link>
                </article>
              );
            })}
            {visibleItems.length === 0 ? (
              <div className="work-empty"><ListTodo size={24} /><strong>No hay trabajo en esta vista</strong><p>Probá otro filtro o creá un trabajo nuevo.</p><button className="button" type="button" onClick={openCreate}><Plus size={15} /> Crear trabajo</button></div>
            ) : null}
          </div>
          <Feedback message={feedback?.message} tone={feedback?.tone} />
        </section>

        {editor ? (
          <aside className="work-editor" aria-labelledby="work-editor-title" aria-busy={saving}>
            <header className="work-editor__heading">
              <div><Pencil size={18} /><div><strong id="work-editor-title">{editor.mode === "create" ? "Nuevo trabajo" : "Editar trabajo"}</strong><span>{editor.mode === "create" ? "Sumalo a la lista operativa" : "Actualizá contexto, fecha y estado"}</span></div></div>
              <button className="icon-button" type="button" onClick={closeEditor} aria-label="Cerrar editor"><X size={18} /></button>
            </header>
            <div className="work-editor__form">
              <label className="field"><span>Título</span><input autoFocus value={editor.draft.title} onChange={(event) => updateDraft({ title: event.target.value })} placeholder="Qué hay que hacer" /></label>
              <label className="field"><span>Descripción</span><textarea rows={4} value={editor.draft.description} onChange={(event) => updateDraft({ description: event.target.value })} placeholder="Contexto útil para retomarlo" /></label>
              <label className="field"><span>Cliente {editor.mode === "edit" ? <small>Se define al crear</small> : null}</span><select value={editor.draft.clientSlug} onChange={(event) => updateDraft({ clientSlug: event.target.value })} disabled={editor.mode === "edit"}><option value="">Trabajo interno</option>{editor.draft.clientSlug && !clientChoices.some((client) => client.slug === editor.draft.clientSlug) ? <option value={editor.draft.clientSlug}>{clientNameFromSlug(editor.draft.clientSlug)}</option> : null}{clientChoices.map((client) => <option key={client.slug} value={client.slug}>{client.name}</option>)}</select></label>
              <div className="work-editor__grid">
                <label className="field"><span>Estado</span><select value={editor.draft.status} onChange={(event) => updateDraft({ status: event.target.value as WorkStatus })}>{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                <label className="field"><span>Prioridad</span><select value={editor.draft.priority} onChange={(event) => updateDraft({ priority: event.target.value as WorkPriority })}>{priorityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              </div>
              <div className="work-editor__grid">
                <label className="field"><span>Lista</span><select value={editor.draft.bucket} onChange={(event) => updateDraft({ bucket: event.target.value as WorkBucket })}>{bucketOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                <label className="field"><span>Tipo</span><input value={editor.draft.kind} onChange={(event) => updateDraft({ kind: event.target.value })} /></label>
              </div>
              <label className="field"><span>Fecha y hora</span><span className="work-editor__date"><CalendarClock size={16} /><input type="datetime-local" value={editor.draft.dueAt} onInput={(event) => updateDraft({ dueAt: event.currentTarget.value })} /></span></label>
              {editor.mode === "edit" && items.find((item) => item.id === editor.itemId && workHref(item) !== "/work?item=" + encodeURIComponent(item.id)) ? (
                <Link className="work-editor__origin" href={workHref(items.find((item) => item.id === editor.itemId)!)} prefetch={false}>Abrir elemento relacionado <ChevronRight size={16} /></Link>
              ) : null}
            </div>
            <footer className="work-editor__footer">
              {editor.mode === "edit" ? (
                confirmingDelete ? (
                  <div className="work-editor__confirm">
                    <span>¿Eliminarlo de verdad?</span>
                    <button className="button button--danger" type="button" onClick={() => void deleteItem()} disabled={saving}>Sí, eliminar</button>
                    <button className="button" type="button" onClick={() => setConfirmingDelete(false)} disabled={saving}>Cancelar</button>
                  </div>
                ) : (
                  <button className="button button--ghost-danger" type="button" onClick={() => setConfirmingDelete(true)} disabled={saving}><Trash2 size={15} /> Eliminar</button>
                )
              ) : <span />}
              {!confirmingDelete ? <button className="button button--primary" type="button" onClick={() => void saveEditor()} disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}{editor.mode === "create" ? "Crear trabajo" : "Guardar cambios"}</button> : null}
            </footer>
          </aside>
        ) : (
          <aside className="work-context" aria-labelledby="attention-title">
            {proposalOpen ? (
              <section className="work-priority-proposal" aria-labelledby="priority-proposal-title">
                <header>
                  <div><Sparkles size={17} /><span><strong id="priority-proposal-title">Yo hoy haría esto</strong><small>Según fecha, urgencia y estado visibles</small></span></div>
                  <button className="icon-button" type="button" onClick={() => setProposalOpen(false)} aria-label="Cerrar propuesta"><X size={17} /></button>
                </header>
                <ol>
                  {priorityProposal.map((item, index) => (
                    <li key={item.id}>
                      <span className="work-priority-number">{index + 1}</span>
                      <ClientMark name={friendlyClient(item)} accent={clientAccent(item.clientSlug, item.clientName, item.clientAccent)} />
                      <span className="work-priority-proposal__copy"><strong>{friendlyClient(item)} · {item.title}</strong><small>{proposalReason(item)}</small></span>
                    </li>
                  ))}
                </ol>
                {priorityProposal.length ? (
                  <footer>
                    <button className="button button--primary button--small" type="button" onClick={() => void applyPriorityProposal()} disabled={prioritizing}>{prioritizing ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}Aplicar orden</button>
                    <button className="button button--secondary button--small" type="button" onClick={discussPriorityProposal}>Hablar sobre esto</button>
                  </footer>
                ) : <p>No hay trabajo abierto en esta vista para priorizar.</p>}
              </section>
            ) : null}
            <div className="work-context__heading"><AlertCircle size={18} /><div><strong id="attention-title">Necesitan atención</strong><span>{data.clientsNeedingAttention.length} clientes</span></div></div>
            <div className="work-attention-list">
              {data.clientsNeedingAttention.map((client) => (
                <Link href={"/clients/" + client.slug} prefetch={false} key={client.id}>
                  <ClientMark name={client.name} accent={clientAccent(client.slug, client.name)} />
                  <span><strong>{client.name}</strong><small>{client.reason}</small></span>
                  <ChevronRight size={17} />
                </Link>
              ))}
            </div>
            <button className="work-supervisor-action" type="button" onClick={() => window.dispatchEvent(new Event("martu:open-ai"))}>
              <Sparkles size={17} /><span><strong>Conversar con la Supervisora</strong><small>Contexto: Trabajo</small></span><ChevronRight size={17} />
            </button>
          </aside>
        )}
      </div>
    </div>
  );
}
