"use client";

import {
  FormEvent,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  Copy,
  FileText,
  Lightbulb,
  ListFilter,
  Plus,
  Save,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { announceFeedback, EmptyState, Feedback } from "@/components/ui";
import type {
  ClientIdea,
  ClientScript,
  ClientWorkspaceData,
  ContentItem,
  StrategyData,
} from "@/components/types";
import { clientSectionHref } from "@/lib/entity-href";

type ApiError = { message?: string };

async function apiJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const payload = (await response.json().catch(() => ({}))) as T & ApiError;
  if (!response.ok)
    throw new Error(payload.message || "No pude completar el cambio.");
  return payload;
}

function lines(value?: string[]) {
  return (value ?? []).join("\n");
}

function toLines(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isoForInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function isoFromInput(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

type EntityWorkspaceSection = "ideas" | "guiones" | "contenido";
type EntityWorkspaceType = "idea" | "script" | "content";
const CURRENT_CONTEXT_KEY = "martu-current-context";

function publishEntityContext({
  clientSlug,
  clientName,
  section,
  entityType,
  entityId,
  entityTitle,
}: {
  clientSlug: string;
  clientName: string;
  section: EntityWorkspaceSection;
  entityType: EntityWorkspaceType;
  entityId?: string | null;
  entityTitle?: string | null;
}) {
  const detail = {
    clientSlug,
    clientName,
    section,
    entityType,
    entityId: entityId || null,
    entityTitle: entityTitle || null,
  };
  try {
    window.sessionStorage.setItem(CURRENT_CONTEXT_KEY, JSON.stringify(detail));
  } catch {
    // The event remains the source of truth when browser storage is unavailable.
  }
  window.dispatchEvent(
    new CustomEvent("martu:context", {
      detail,
    }),
  );
}

function syncEntityRoute({
  clientSlug,
  clientName,
  section,
  entityType,
  entityId,
  entityTitle,
  mode = "push",
}: {
  clientSlug: string;
  clientName: string;
  section: EntityWorkspaceSection;
  entityType: EntityWorkspaceType;
  entityId?: string | null;
  entityTitle?: string | null;
  mode?: "push" | "replace";
}) {
  const href = clientSectionHref(clientSlug, section, entityId);
  if (window.location.pathname !== href) {
    window.history[mode === "replace" ? "replaceState" : "pushState"](
      null,
      "",
      href,
    );
  }
  publishEntityContext({
    clientSlug,
    clientName,
    section,
    entityType,
    entityId,
    entityTitle,
  });
}

function useSelectedEntityContext({
  clientSlug,
  clientName,
  section,
  entityType,
  entityId,
  entityTitle,
}: {
  clientSlug: string;
  clientName: string;
  section: EntityWorkspaceSection;
  entityType: EntityWorkspaceType;
  entityId?: string | null;
  entityTitle?: string | null;
}) {
  const initialPublishRef = useRef(false);
  useEffect(() => {
    if (!entityId) return;
    const publish = () => {
      publishEntityContext({
        clientSlug,
        clientName,
        section,
        entityType,
        entityId,
        entityTitle,
      });
    };
    if (initialPublishRef.current) {
      publish();
      return;
    }
    initialPublishRef.current = true;
    const timer = window.setTimeout(() => {
      publish();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [clientName, clientSlug, entityId, entityTitle, entityType, section]);
}

function entityIdFromPathname(
  pathname: string,
  section: EntityWorkspaceSection,
) {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "clients" || segments[2] !== section) return null;
  const value = segments[3];
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function EntityDialog({
  title,
  eyebrow,
  submitLabel,
  onClose,
  onSubmit,
  busy = false,
  children,
}: {
  title: string;
  eyebrow: string;
  submitLabel: string;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  busy?: boolean;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const dialog = dialogRef.current;
    const focusable = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          "button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex='-1'])",
        ) ?? [],
      );
    focusable()[0]?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const nodes = focusable();
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus();
    };
  }, [onClose]);

  return (
    <div
      className="modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="entity-dialog-title"
    >
      <button
        className="modal__scrim"
        type="button"
        onClick={onClose}
        aria-label="Cerrar"
        tabIndex={-1}
      />
      <form
        className="modal__body entity-dialog"
        onSubmit={onSubmit}
        ref={dialogRef}
        aria-busy={busy}
      >
        <header>
          <div>
            <p>{eyebrow}</p>
            <h2 id="entity-dialog-title">{title}</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <X size={19} />
          </button>
        </header>
        {children}
        <footer>
          <button
            className="button button--secondary"
            type="button"
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            className="button button--primary"
            type="submit"
            disabled={busy}
          >
            {submitLabel}
          </button>
        </footer>
      </form>
    </div>
  );
}

export function StrategyEditor({ data }: { data: ClientWorkspaceData }) {
  const router = useRouter();
  const strategy = data.strategy;
  const [draft, setDraft] = useState(() => ({
    title: strategy?.title || `Estrategia de ${data.client.name}`,
    objectives: lines(strategy?.objectives),
    audience: strategy?.audience || data.brief?.audience || "",
    tone: strategy?.tone || "",
    positioning: strategy?.positioning || data.brief?.summary || "",
    pillars: lines(strategy?.pillars),
    hypotheses: lines(strategy?.hypotheses),
    decisions: lines(strategy?.decisions),
    notes: strategy?.notes || "",
  }));
  const [saved, setSaved] = useState(draft);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [message, setMessage] = useState<string | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  function update(key: keyof typeof draft, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
    setState("idle");
  }

  async function save() {
    if (!dirty || state === "saving") return;
    setState("saving");
    setMessage(null);
    try {
      const payload = await apiJson<{ strategy?: StrategyData }>(
        `/api/clients/${data.client.slug}/strategy`,
        {
          method: "PATCH",
          body: JSON.stringify({
            title: draft.title,
            objectives: toLines(draft.objectives),
            audience: draft.audience,
            tone: draft.tone,
            positioning: draft.positioning,
            pillars: toLines(draft.pillars),
            hypotheses: toLines(draft.hypotheses),
            decisions: toLines(draft.decisions),
            notes: draft.notes,
            createVersion: true,
          }),
        },
      );
      setSaved(draft);
      setState("saved");
      setMessage(`Versión ${payload.strategy?.version || "nueva"} guardada.`);
      announceFeedback("Estrategia actualizada.");
      router.refresh();
    } catch (error) {
      const next =
        error instanceof Error
          ? error.message
          : "No pude guardar la estrategia.";
      setState("error");
      setMessage(next);
      announceFeedback(next, "error");
    }
  }

  return (
    <div className="v1-document-layout">
      <article className="v1-document">
        <header className="v1-document__header">
          <div>
            <span>Documento vivo</span>
            <input
              aria-label="Título de la estrategia"
              value={draft.title}
              onChange={(event) => update("title", event.target.value)}
            />
            <p>
              Versión {strategy?.version || 1}. Cada guardado conserva el estado
              anterior.
            </p>
          </div>
          <div className="v1-document__actions">
            <span aria-live="polite">
              <Check size={15} />
              {state === "saving"
                ? "Guardando"
                : dirty
                  ? "Cambios sin guardar"
                  : "Al día"}
            </span>
            <button
              className="button button--primary button--small"
              type="button"
              onClick={() => void save()}
              disabled={!dirty || state === "saving"}
            >
              <Save size={15} />
              Guardar versión
            </button>
          </div>
        </header>
        <Feedback
          message={message}
          tone={state === "error" ? "error" : "success"}
        />
        <div className="strategy-editor-grid">
          <label className="field field--wide">
            <span>
              Objetivos <small>Uno por línea</small>
            </span>
            <textarea
              rows={5}
              value={draft.objectives}
              onChange={(event) => update("objectives", event.target.value)}
            />
          </label>
          <label className="field">
            <span>Audiencia</span>
            <textarea
              rows={5}
              value={draft.audience}
              onChange={(event) => update("audience", event.target.value)}
            />
          </label>
          <label className="field">
            <span>Tono</span>
            <textarea
              rows={5}
              value={draft.tone}
              onChange={(event) => update("tone", event.target.value)}
            />
          </label>
          <label className="field field--wide">
            <span>Posicionamiento</span>
            <textarea
              rows={4}
              value={draft.positioning}
              onChange={(event) => update("positioning", event.target.value)}
            />
          </label>
          <label className="field">
            <span>
              Pilares <small>Uno por línea</small>
            </span>
            <textarea
              rows={7}
              value={draft.pillars}
              onChange={(event) => update("pillars", event.target.value)}
            />
          </label>
          <label className="field">
            <span>
              Hipótesis <small>Una por línea</small>
            </span>
            <textarea
              rows={7}
              value={draft.hypotheses}
              onChange={(event) => update("hypotheses", event.target.value)}
            />
          </label>
          <label className="field field--wide">
            <span>
              Decisiones tomadas <small>Una por línea</small>
            </span>
            <textarea
              rows={6}
              value={draft.decisions}
              onChange={(event) => update("decisions", event.target.value)}
            />
          </label>
          <label className="field field--wide">
            <span>Notas internas</span>
            <textarea
              rows={5}
              value={draft.notes}
              onChange={(event) => update("notes", event.target.value)}
            />
          </label>
        </div>
      </article>
      <aside className="v1-context-rail">
        <h3>Contexto de trabajo</h3>
        <p>
          La supervisora usa esta versión como verdad vigente. Las anteriores
          quedan en el historial.
        </p>
        <button
          className="button button--secondary button--small"
          type="button"
          onClick={() => window.dispatchEvent(new Event("martu:open-ai"))}
        >
          <Sparkles size={15} />
          Pensar sobre esto
        </button>
        <dl>
          <div>
            <dt>Estado</dt>
            <dd>{strategy?.status || "Vigente"}</dd>
          </div>
          <div>
            <dt>Versión</dt>
            <dd>{strategy?.version || 1}</dd>
          </div>
          <div>
            <dt>Cliente</dt>
            <dd>{data.client.name}</dd>
          </div>
        </dl>
      </aside>
    </div>
  );
}

type IdeaDraft = {
  title: string;
  description: string;
  status: string;
  format: string;
  tags: string;
  notes: string;
};

function ideaDraft(item?: ClientIdea): IdeaDraft {
  return {
    title: item?.title || "",
    description: item?.description || "",
    status: item?.status || "Borrador",
    format: item?.format || "",
    tags: (item?.tags || []).join(", "),
    notes: item?.notes || "",
  };
}

export function IdeasWorkspace({
  data,
  selectedEntityId,
  openCreate = false,
}: {
  data: ClientWorkspaceData;
  selectedEntityId?: string | null;
  openCreate?: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState(data.ideas);
  const [selectedId, setSelectedId] = useState(
    selectedEntityId || data.ideas[0]?.id || "",
  );
  const [mobileDetailOpen, setMobileDetailOpen] = useState(
    Boolean(selectedEntityId),
  );
  const selected = items.find((item) => item.id === selectedId) || items[0];
  useSelectedEntityContext({
    clientSlug: data.client.slug,
    clientName: data.client.name,
    section: "ideas",
    entityType: "idea",
    entityId: selected?.id,
    entityTitle: selected?.title,
  });
  const [draft, setDraft] = useState<IdeaDraft>(() => ideaDraft(selected));
  const [saved, setSaved] = useState<IdeaDraft>(() => ideaDraft(selected));
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const [filter, setFilter] = useState("Todas");
  const [dialogOpen, setDialogOpen] = useState(openCreate);
  const [newIdea, setNewIdea] = useState({ title: "", description: "" });
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{
    message: string;
    error?: boolean;
  } | null>(null);

  useEffect(() => {
    if (!openCreate) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("new");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, [openCreate]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const filtered = useMemo(
    () =>
      items.filter((idea) => {
        const matchesQuery =
          `${idea.title} ${idea.description} ${(idea.tags || []).join(" ")}`
            .toLocaleLowerCase("es")
            .includes(deferred.toLocaleLowerCase("es"));
        return matchesQuery && (filter === "Todas" || idea.status === filter);
      }),
    [deferred, filter, items],
  );

  useEffect(() => {
    function reconcileHistorySelection() {
      const routeId = entityIdFromPathname(window.location.pathname, "ideas");
      if (!routeId) return;
      const next = items.find((item) => item.id === routeId);
      if (!next || next.id === selectedId) return;
      setSelectedId(next.id);
      const nextDraft = ideaDraft(next);
      setDraft(nextDraft);
      setSaved(nextDraft);
    }
    window.addEventListener("popstate", reconcileHistorySelection);
    return () =>
      window.removeEventListener("popstate", reconcileHistorySelection);
  }, [items, selectedId]);

  function pick(item: ClientIdea, force = false) {
    if (
      !force &&
      dirty &&
      item.id !== selected?.id &&
      !window.confirm(
        "Tenés cambios sin guardar. ¿Querés descartarlos y abrir otra idea?",
      )
    )
      return;
    setSelectedId(item.id);
    setMobileDetailOpen(true);
    const next = ideaDraft(item);
    setDraft(next);
    setSaved(next);
    syncEntityRoute({
      clientSlug: data.client.slug,
      clientName: data.client.name,
      section: "ideas",
      entityType: "idea",
      entityId: item.id,
      entityTitle: item.title,
    });
  }

  async function save() {
    if (!selected || busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const payload = await apiJson<{ idea?: ClientIdea }>(
        `/api/ideas/${selected.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            ...draft,
            tags: draft.tags
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean),
          }),
        },
      );
      const next = payload.idea || {
        ...selected,
        ...draft,
        tags: draft.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      };
      setItems((current) =>
        current.map((item) => (item.id === selected.id ? next : item)),
      );
      setSaved(draft);
      setFeedback({ message: "Idea guardada." });
      announceFeedback("Idea guardada.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No pude guardar la idea.";
      setFeedback({ message, error: true });
      announceFeedback(message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newIdea.title.trim() || busy) return;
    setBusy(true);
    try {
      const payload = await apiJson<{ idea: ClientIdea }>("/api/ideas", {
        method: "POST",
        body: JSON.stringify({
          clientSlug: data.client.slug,
          title: newIdea.title,
          description: newIdea.description,
          status: "Borrador",
          origin: "Martu",
        }),
      });
      setItems((current) => [payload.idea, ...current]);
      pick(payload.idea, true);
      setDialogOpen(false);
      setNewIdea({ title: "", description: "" });
      announceFeedback("Idea creada.");
    } catch (error) {
      announceFeedback(
        error instanceof Error ? error.message : "No pude crear la idea.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  async function duplicate() {
    if (!selected || busy) return;
    setBusy(true);
    try {
      const payload = await apiJson<{ idea: ClientIdea }>(
        `/api/ideas/${selected.id}/duplicate`,
        { method: "POST", body: "{}" },
      );
      setItems((current) => [payload.idea, ...current]);
      pick(payload.idea, true);
      announceFeedback("Idea duplicada.");
    } catch (error) {
      announceFeedback(
        error instanceof Error ? error.message : "No pude duplicar la idea.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    if (!selected || busy || !window.confirm(`¿Archivar “${selected.title}”?`))
      return;
    setBusy(true);
    try {
      await apiJson<{ ok: boolean }>(`/api/ideas/${selected.id}`, {
        method: "DELETE",
      });
      const remaining = items.filter((item) => item.id !== selected.id);
      const nextSelected = remaining[0];
      setItems(remaining);
      setSelectedId(nextSelected?.id || "");
      const next = ideaDraft(nextSelected);
      setDraft(next);
      setSaved(next);
      syncEntityRoute({
        clientSlug: data.client.slug,
        clientName: data.client.name,
        section: "ideas",
        entityType: "idea",
        entityId: nextSelected?.id,
        entityTitle: nextSelected?.title,
        mode: "replace",
      });
      announceFeedback("Idea archivada.");
    } catch (error) {
      announceFeedback(
        error instanceof Error ? error.message : "No pude archivar la idea.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  async function convert() {
    if (!selected || busy) return;
    if (selected.scriptId) {
      router.push(
        clientSectionHref(data.client.slug, "guiones", selected.scriptId),
      );
      return;
    }
    setBusy(true);
    try {
      const payload = await apiJson<{ script: ClientScript }>(
        `/api/ideas/${selected.id}/convert`,
        { method: "POST", body: "{}" },
      );
      announceFeedback("Guion creado desde la idea.");
      router.push(
        clientSectionHref(data.client.slug, "guiones", payload.script.id),
      );
    } catch (error) {
      announceFeedback(
        error instanceof Error ? error.message : "No pude convertir la idea.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`entity-workspace ${
        mobileDetailOpen
          ? "entity-workspace--mobile-detail"
          : "entity-workspace--mobile-index"
      }`}
    >
      <aside className="entity-index">
        <header>
          <button
            className="button button--primary button--small"
            type="button"
            onClick={() => {
              if (
                !dirty ||
                window.confirm(
                  "Tenés cambios sin guardar. ¿Querés seguir y crear otra idea?",
                )
              )
                setDialogOpen(true);
            }}
          >
            <Plus size={15} />
            Nueva idea
          </button>
        </header>
        <label className="search-field">
          <Search size={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar ideas"
            aria-label="Buscar ideas"
          />
        </label>
        <label className="entity-filter">
          <ListFilter size={14} />
          <span>Estado</span>
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option>Todas</option>
            {Array.from(new Set(items.map((item) => item.status))).map(
              (status) => (
                <option key={status}>{status}</option>
              ),
            )}
          </select>
          <ChevronDown size={13} />
        </label>
        <div className="entity-list" aria-label="Ideas">
          {filtered.map((item) => (
            <button
              className={item.id === selected?.id ? "is-active" : ""}
              type="button"
              aria-current={item.id === selected?.id ? "true" : undefined}
              key={item.id}
              onClick={() => pick(item)}
            >
              <strong>{item.title}</strong>
              <span>{item.description || "Sin desarrollo"}</span>
              <small>{item.status}</small>
            </button>
          ))}
        </div>
        <footer>
          {filtered.length} {filtered.length === 1 ? "idea" : "ideas"}
        </footer>
      </aside>
      {selected ? (
        <article className="entity-detail">
          <button
            className="entity-detail__mobile-back"
            type="button"
            onClick={() => {
              setMobileDetailOpen(false);
              syncEntityRoute({
                clientSlug: data.client.slug,
                clientName: data.client.name,
                section: "ideas",
                entityType: "idea",
              });
            }}
          >
            <ArrowLeft size={16} />
            Todas las ideas
          </button>
          <header className="entity-detail__header">
            <div>
              <span>Idea</span>
              <h2>{selected.title}</h2>
            </div>
            <div>
              <button
                className="icon-button"
                type="button"
                onClick={() => void duplicate()}
                aria-label="Duplicar idea"
              >
                <Copy size={17} />
              </button>
              <button
                className="icon-button"
                type="button"
                onClick={() => void archive()}
                aria-label="Archivar idea"
              >
                <Archive size={17} />
              </button>
              <button
                className="button button--primary button--small"
                type="button"
                onClick={() => void save()}
                disabled={!dirty || busy}
              >
                <Save size={15} />
                Guardar cambios
              </button>
            </div>
          </header>
          <Feedback
            message={feedback?.message}
            tone={feedback?.error ? "error" : "success"}
          />
          <div className="entity-form-grid">
            <label className="field field--wide">
              <span>Título</span>
              <input
                value={draft.title}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Estado</span>
              <select
                value={draft.status}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    status: event.target.value,
                  }))
                }
              >
                <option>Borrador</option>
                <option>En evaluación</option>
                <option>Aprobada</option>
                <option>Descartada</option>
              </select>
            </label>
            <label className="field">
              <span>Formato</span>
              <input
                value={draft.format}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    format: event.target.value,
                  }))
                }
                placeholder="Reel, carrusel, historias"
              />
            </label>
            <label className="field field--wide">
              <span>Desarrollo</span>
              <textarea
                rows={8}
                value={draft.description}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
            </label>
            <label className="field field--wide">
              <span>
                Tags <small>Separados por coma</small>
              </span>
              <input
                value={draft.tags}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    tags: event.target.value,
                  }))
                }
              />
            </label>
            <label className="field field--wide">
              <span>Notas internas</span>
              <textarea
                rows={5}
                value={draft.notes}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
              />
            </label>
          </div>
          <footer className="lineage-strip">
            <div className="is-current">
              <Lightbulb size={17} />
              <span>
                <b>Idea</b>
                <small>Actual</small>
              </span>
            </div>
            <ArrowRight size={15} />
            <button
              type="button"
              onClick={() => void convert()}
              disabled={busy}
            >
              <FileText size={17} />
              <span>
                <b>Guion</b>
                <small>
                  {selected.scriptId
                    ? "Abrir vinculado"
                    : "Crear desde esta idea"}
                </small>
              </span>
            </button>
            <ArrowRight size={15} />
            <button
              type="button"
              disabled={!selected.contentId}
              onClick={() =>
                selected.contentId &&
                router.push(
                  clientSectionHref(
                    data.client.slug,
                    "contenido",
                    selected.contentId,
                  ),
                )
              }
            >
              <CalendarDays size={17} />
              <span>
                <b>Contenido</b>
                <small>
                  {selected.contentId ? "Abrir vinculado" : "Pendiente"}
                </small>
              </span>
            </button>
          </footer>
        </article>
      ) : (
        <EmptyState
          title="Todavía no hay ideas"
          body="Capturá la primera sin salir del cliente."
        />
      )}
      {dialogOpen ? (
        <EntityDialog
          eyebrow={`Nueva idea para ${data.client.name}`}
          title="Capturá lo que apareció"
          submitLabel={busy ? "Guardando" : "Crear idea"}
          busy={busy}
          onClose={() => setDialogOpen(false)}
          onSubmit={create}
        >
          <label>
            <span>Título</span>
            <input
              autoFocus
              required
              value={newIdea.title}
              onChange={(event) =>
                setNewIdea((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
            />
          </label>
          <label>
            <span>Desarrollo</span>
            <textarea
              rows={6}
              value={newIdea.description}
              onChange={(event) =>
                setNewIdea((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            />
          </label>
        </EntityDialog>
      ) : null}
    </div>
  );
}

type ScriptDraft = {
  title: string;
  format: string;
  objective: string;
  hook: string;
  body: string;
  cta: string;
  notes: string;
  status: string;
  dueAt: string;
};

function fullScriptDraft(item?: ClientScript): ScriptDraft {
  return {
    title: item?.title || "",
    format: item?.format || "Reel",
    objective: item?.objective || "",
    hook: item?.hook || "",
    body: item?.body || "",
    cta: item?.cta || "",
    notes: item?.notes || "",
    status: item?.status || "Borrador",
    dueAt: isoForInput(item?.deadline),
  };
}

export function ScriptsWorkspace({
  data,
  selectedEntityId,
}: {
  data: ClientWorkspaceData;
  selectedEntityId?: string | null;
}) {
  const router = useRouter();
  const [items, setItems] = useState(data.scripts);
  const [selectedId, setSelectedId] = useState(
    selectedEntityId || data.scripts[0]?.id || "",
  );
  const [mobileDetailOpen, setMobileDetailOpen] = useState(
    Boolean(selectedEntityId),
  );
  const selected = items.find((item) => item.id === selectedId) || items[0];
  useSelectedEntityContext({
    clientSlug: data.client.slug,
    clientName: data.client.name,
    section: "guiones",
    entityType: "script",
    entityId: selected?.id,
    entityTitle: selected?.title,
  });
  const [draft, setDraft] = useState<ScriptDraft>(() =>
    fullScriptDraft(selected),
  );
  const [saved, setSaved] = useState(draft);
  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{
    message: string;
    error?: boolean;
  } | null>(null);
  const filtered = items.filter((item) =>
    `${item.title} ${item.hook} ${item.status}`
      .toLocaleLowerCase("es")
      .includes(query.toLocaleLowerCase("es")),
  );
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const attemptedAutoSave = useRef("");
  const autoSave = useEffectEvent(() => void save(true));
  useEffect(() => {
    function reconcileHistorySelection() {
      const routeId = entityIdFromPathname(
        window.location.pathname,
        "guiones",
      );
      if (!routeId) return;
      const next = items.find((item) => item.id === routeId);
      if (!next || next.id === selectedId) return;
      setSelectedId(next.id);
      const nextDraft = fullScriptDraft(next);
      setDraft(nextDraft);
      setSaved(nextDraft);
    }
    window.addEventListener("popstate", reconcileHistorySelection);
    return () =>
      window.removeEventListener("popstate", reconcileHistorySelection);
  }, [items, selectedId]);
  useEffect(() => {
    if (!dirty || busy || !selected) return;
    const signature = `${selected.id}:${JSON.stringify(draft)}`;
    if (attemptedAutoSave.current === signature) return;
    const timer = window.setTimeout(() => {
      attemptedAutoSave.current = signature;
      autoSave();
    }, 1400);
    return () => window.clearTimeout(timer);
  }, [busy, dirty, draft, selected]);

  function pick(item: ClientScript, force = false) {
    if (
      !force &&
      dirty &&
      item.id !== selected?.id &&
      !window.confirm(
        "Tenés cambios sin guardar. ¿Querés descartarlos y abrir otro guion?",
      )
    )
      return;
    setSelectedId(item.id);
    setMobileDetailOpen(true);
    const next = fullScriptDraft(item);
    setDraft(next);
    setSaved(next);
    syncEntityRoute({
      clientSlug: data.client.slug,
      clientName: data.client.name,
      section: "guiones",
      entityType: "script",
      entityId: item.id,
      entityTitle: item.title,
    });
  }
  async function save(automatic = false) {
    if (!selected || !dirty || busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const payload = await apiJson<{ script?: ClientScript }>(
        `/api/scripts/${selected.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            ...draft,
            dueAt: undefined,
            deadline: isoFromInput(draft.dueAt),
          }),
        },
      );
      const next = payload.script || {
        ...selected,
        ...draft,
        deadline: isoFromInput(draft.dueAt),
      };
      setItems((current) =>
        current.map((item) => (item.id === selected.id ? next : item)),
      );
      setSaved(draft);
      setFeedback({
        message: automatic
          ? "Guardado automáticamente."
          : "Guion guardado. La versión anterior quedó en el historial.",
      });
      if (!automatic) announceFeedback("Guion guardado.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No pude guardar el guion.";
      setFeedback({ message, error: true });
      announceFeedback(message, "error");
    } finally {
      setBusy(false);
    }
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newTitle.trim() || busy) return;
    setBusy(true);
    try {
      const payload = await apiJson<{ script: ClientScript }>("/api/scripts", {
        method: "POST",
        body: JSON.stringify({
          clientSlug: data.client.slug,
          title: newTitle,
          format: "Reel",
          status: "Borrador",
        }),
      });
      setItems((current) => [payload.script, ...current]);
      pick(payload.script, true);
      setDialogOpen(false);
      setNewTitle("");
      announceFeedback("Guion creado.");
    } catch (error) {
      announceFeedback(
        error instanceof Error ? error.message : "No pude crear el guion.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }
  async function duplicate() {
    if (!selected || busy) return;
    setBusy(true);
    try {
      const payload = await apiJson<{ script: ClientScript }>(
        `/api/scripts/${selected.id}/duplicate`,
        { method: "POST", body: "{}" },
      );
      setItems((current) => [payload.script, ...current]);
      pick(payload.script, true);
      announceFeedback("Guion duplicado.");
    } catch (error) {
      announceFeedback(
        error instanceof Error ? error.message : "No pude duplicar el guion.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!selected || busy || !window.confirm(`¿Archivar “${selected.title}”?`))
      return;
    setBusy(true);
    try {
      await apiJson<{ ok: boolean }>(`/api/scripts/${selected.id}`, {
        method: "DELETE",
      });
      const remaining = items.filter((item) => item.id !== selected.id);
      const nextSelected = remaining[0];
      setItems(remaining);
      setSelectedId(nextSelected?.id || "");
      const next = fullScriptDraft(nextSelected);
      setDraft(next);
      setSaved(next);
      syncEntityRoute({
        clientSlug: data.client.slug,
        clientName: data.client.name,
        section: "guiones",
        entityType: "script",
        entityId: nextSelected?.id,
        entityTitle: nextSelected?.title,
        mode: "replace",
      });
      announceFeedback("Guion archivado.");
    } catch (error) {
      announceFeedback(
        error instanceof Error ? error.message : "No pude archivar el guion.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  async function openOrCreateContent() {
    if (!selected || busy) return;
    if (selected.contentId) {
      router.push(
        clientSectionHref(data.client.slug, "contenido", selected.contentId),
      );
      return;
    }

    setBusy(true);
    setFeedback(null);
    try {
      let linkedScript = selected;
      if (dirty) {
        const savedPayload = await apiJson<{ script?: ClientScript }>(
          `/api/scripts/${selected.id}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              ...draft,
              dueAt: undefined,
              deadline: isoFromInput(draft.dueAt),
            }),
          },
        );
        linkedScript = savedPayload.script || {
          ...selected,
          ...draft,
          deadline: isoFromInput(draft.dueAt),
        };
        setSaved(draft);
      }

      const payload = await apiJson<{ content: ContentItem }>("/api/content", {
        method: "POST",
        body: JSON.stringify({
          clientSlug: data.client.slug,
          scriptId: selected.id,
          ideaId: selected.ideaId || undefined,
          title: draft.title.trim() || selected.title,
          format: draft.format || "Reel",
          channel: "Instagram",
          caption: draft.body,
          cta: draft.cta,
          notes: draft.notes,
          dueAt: isoFromInput(draft.dueAt),
        }),
      });
      const next = { ...linkedScript, contentId: payload.content.id };
      setItems((current) =>
        current.map((item) => (item.id === selected.id ? next : item)),
      );
      announceFeedback("Contenido creado desde el guion.");
      router.push(
        clientSectionHref(data.client.slug, "contenido", payload.content.id),
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "No pude crear el contenido desde este guion.";
      setFeedback({ message, error: true });
      announceFeedback(message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`entity-workspace entity-workspace--script ${
        mobileDetailOpen
          ? "entity-workspace--mobile-detail"
          : "entity-workspace--mobile-index"
      }`}
    >
      <aside className="entity-index">
        <header>
          <button
            className="button button--primary button--small"
            type="button"
            onClick={() => {
              if (
                !dirty ||
                window.confirm(
                  "Tenés cambios sin guardar. ¿Querés seguir y crear otro guion?",
                )
              )
                setDialogOpen(true);
            }}
          >
            <Plus size={15} />
            Nuevo guion
          </button>
        </header>
        <label className="search-field">
          <Search size={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar guiones"
            aria-label="Buscar guiones"
          />
        </label>
        <div className="entity-list" aria-label="Guiones">
          {filtered.map((item) => (
            <button
              className={item.id === selected?.id ? "is-active" : ""}
              type="button"
              aria-current={item.id === selected?.id ? "true" : undefined}
              key={item.id}
              onClick={() => pick(item)}
            >
              <strong>{item.title}</strong>
              <span>{item.hook || "Sin hook"}</span>
              <small>
                v{item.version || 1} · {item.status}
              </small>
            </button>
          ))}
        </div>
        <footer>
          {filtered.length} {filtered.length === 1 ? "guion" : "guiones"}
        </footer>
      </aside>
      {selected ? (
        <article className="entity-detail">
          <button
            className="entity-detail__mobile-back"
            type="button"
            onClick={() => {
              setMobileDetailOpen(false);
              syncEntityRoute({
                clientSlug: data.client.slug,
                clientName: data.client.name,
                section: "guiones",
                entityType: "script",
              });
            }}
          >
            <ArrowLeft size={16} />
            Todos los guiones
          </button>
          <header className="entity-detail__header">
            <div>
              <span>Guion {selected.number ? `#${selected.number}` : ""}</span>
              <h2>{selected.title}</h2>
            </div>
            <div>
              <button
                className="icon-button"
                type="button"
                onClick={() => void duplicate()}
                aria-label="Duplicar guion"
              >
                <Copy size={17} />
              </button>
              <button
                className="icon-button"
                type="button"
                onClick={() => void remove()}
                aria-label="Archivar guion"
              >
                <Trash2 size={17} />
              </button>
              <button
                className="button button--primary button--small"
                type="button"
                onClick={() => void save()}
                disabled={!dirty || busy}
              >
                <Save size={15} />
                Guardar cambios
              </button>
            </div>
          </header>
          <Feedback
            message={feedback?.message}
            tone={feedback?.error ? "error" : "success"}
          />
          <div className="entity-form-grid">
            <label className="field field--wide">
              <span>Título</span>
              <input
                value={draft.title}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Formato</span>
              <input
                value={draft.format}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    format: event.target.value,
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Estado</span>
              <select
                value={draft.status}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    status: event.target.value,
                  }))
                }
              >
                <option>Borrador</option>
                <option>En revisión</option>
                <option>Aprobado</option>
              </select>
            </label>
            <label className="field">
              <span>Deadline</span>
              <input
                type="datetime-local"
                value={draft.dueAt}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    dueAt: event.target.value,
                  }))
                }
              />
            </label>
            <label className="field field--wide">
              <span>Objetivo</span>
              <textarea
                rows={3}
                value={draft.objective}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    objective: event.target.value,
                  }))
                }
              />
            </label>
            <label className="field field--wide">
              <span>Hook</span>
              <textarea
                rows={3}
                value={draft.hook}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    hook: event.target.value,
                  }))
                }
              />
            </label>
            <label className="field field--wide">
              <span>Cuerpo</span>
              <textarea
                rows={11}
                value={draft.body}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    body: event.target.value,
                  }))
                }
              />
            </label>
            <label className="field field--wide">
              <span>CTA</span>
              <textarea
                rows={3}
                value={draft.cta}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    cta: event.target.value,
                  }))
                }
              />
            </label>
            <label className="field field--wide">
              <span>Notas</span>
              <textarea
                rows={4}
                value={draft.notes}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
              />
            </label>
          </div>
          <footer className="lineage-strip">
            <button
              type="button"
              disabled={!selected.ideaId}
              className={selected.ideaId ? "" : "is-muted"}
              onClick={() =>
                selected.ideaId &&
                router.push(
                  clientSectionHref(data.client.slug, "ideas", selected.ideaId),
                )
              }
            >
              <Lightbulb size={17} />
              <span>
                <b>Idea</b>
                <small>
                  {selected.ideaId ? "Abrir vinculada" : "Sin vínculo"}
                </small>
              </span>
            </button>
            <ArrowRight size={15} />
            <div className="is-current">
              <FileText size={17} />
              <span>
                <b>Guion</b>
                <small>v{selected.version || 1}</small>
              </span>
            </div>
            <ArrowRight size={15} />
            <button
              type="button"
              disabled={busy}
              onClick={() => void openOrCreateContent()}
              aria-label={
                selected.contentId
                  ? "Abrir contenido vinculado"
                  : "Convertir en contenido"
              }
            >
              <CalendarDays size={17} />
              <span>
                <b>Contenido</b>
                <small>
                  {selected.contentId ? "Abrir vinculado" : "Crear desde guion"}
                </small>
              </span>
            </button>
          </footer>
        </article>
      ) : (
        <EmptyState
          title="Todavía no hay guiones"
          body="Creá uno vacío o convertilo desde una idea."
        />
      )}
      {dialogOpen ? (
        <EntityDialog
          eyebrow={`Nuevo guion para ${data.client.name}`}
          title="Empezá con una base limpia"
          submitLabel={busy ? "Creando" : "Crear guion"}
          busy={busy}
          onClose={() => setDialogOpen(false)}
          onSubmit={create}
        >
          <label>
            <span>Título</span>
            <input
              autoFocus
              required
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
            />
          </label>
        </EntityDialog>
      ) : null}
    </div>
  );
}

type ContentDraft = {
  title: string;
  format: string;
  channel: string;
  status: string;
  deadline: string;
  caption: string;
  cta: string;
  notes: string;
};
type WorkflowStateDraft = {
  id: string;
  slug?: string;
  label: string;
  color: string;
  terminalKind?: "delivered" | "published" | "cancelled" | null;
};
function workflowTerminalKind(
  value: string | null | undefined,
): WorkflowStateDraft["terminalKind"] {
  return value === "delivered" || value === "published" || value === "cancelled"
    ? value
    : null;
}
function contentDraft(item?: ContentItem): ContentDraft {
  return {
    title: item?.title || "",
    format: item?.format || "Reel",
    channel: item?.channel || "Instagram",
    status: item?.status || "Idea",
    deadline: isoForInput(item?.deadline),
    caption: item?.caption || "",
    cta: item?.cta || "",
    notes: item?.notes || "",
  };
}

export function ContentWorkspace({
  data,
  selectedEntityId,
}: {
  data: ClientWorkspaceData;
  selectedEntityId?: string | null;
}) {
  const router = useRouter();
  const [items, setItems] = useState(data.content);
  const [selectedId, setSelectedId] = useState(
    selectedEntityId || data.content[0]?.id || "",
  );
  const [mobileDetailOpen, setMobileDetailOpen] = useState(
    Boolean(selectedEntityId),
  );
  const selected = items.find((item) => item.id === selectedId) || items[0];
  const selectedMetric = selected
    ? data.metrics.find(
        (metric) =>
          metric.contentItemId === selected.id ||
          Boolean(
            selected.publicationId &&
              metric.publicationId === selected.publicationId,
          ),
      )
    : undefined;
  useSelectedEntityContext({
    clientSlug: data.client.slug,
    clientName: data.client.name,
    section: "contenido",
    entityType: "content",
    entityId: selected?.id,
    entityTitle: selected?.title,
  });
  const [draft, setDraft] = useState<ContentDraft>(() =>
    contentDraft(selected),
  );
  const [saved, setSaved] = useState(draft);
  const [view, setView] = useState<"list" | "flow">("list");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [workflowSaving, setWorkflowSaving] = useState(false);
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const [configuredStates, setConfiguredStates] = useState<
    WorkflowStateDraft[]
  >(() =>
    (data.workflowStates || []).map((state) => ({
      id: state.id,
      slug: state.slug,
      label: state.label,
      color: state.color || "#64748b",
      terminalKind: workflowTerminalKind(state.terminalKind),
    })),
  );
  const [workflowDraft, setWorkflowDraft] =
    useState<WorkflowStateDraft[]>(configuredStates);
  const [moving, setMoving] = useState<Set<string>>(() => new Set());
  const moveTokens = useRef(new Map<string, symbol>());
  const [feedback, setFeedback] = useState<{
    message: string;
    error?: boolean;
  } | null>(null);
  const serviceAllowsPublishing = data.services.some((service) =>
    /publicaci|community|cm|historias/i.test(service),
  );
  const fallbackStates = serviceAllowsPublishing
    ? [
        "Idea",
        "Guion",
        "Para grabar",
        "Grabado",
        "Editando",
        "En aprobación",
        "Aprobado",
        "Programado",
        "Publicado",
      ]
    : [
        "Idea",
        "Guion",
        "Para grabar",
        "Grabado",
        "Editando",
        "Listo",
        "Entregado",
      ];
  const states = Array.from(
    new Set([
      ...(configuredStates.length
        ? configuredStates.map((state) => state.label)
        : fallbackStates),
      ...items.map((item) => item.status).filter(Boolean),
    ]),
  );
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const selectedIndex = selected
    ? items.findIndex((item) => item.id === selected.id)
    : -1;
  useEffect(() => {
    function reconcileHistorySelection() {
      const routeId = entityIdFromPathname(
        window.location.pathname,
        "contenido",
      );
      if (!routeId) return;
      const next = items.find((item) => item.id === routeId);
      if (!next || next.id === selectedId) return;
      setSelectedId(next.id);
      const nextDraft = contentDraft(next);
      setDraft(nextDraft);
      setSaved(nextDraft);
    }
    window.addEventListener("popstate", reconcileHistorySelection);
    return () =>
      window.removeEventListener("popstate", reconcileHistorySelection);
  }, [items, selectedId]);
  function pick(item: ContentItem, force = false) {
    if (
      !force &&
      dirty &&
      item.id !== selected?.id &&
      !window.confirm(
        "Tenés cambios sin guardar. ¿Querés descartarlos y abrir otro contenido?",
      )
    )
      return;
    setSelectedId(item.id);
    setMobileDetailOpen(true);
    const next = contentDraft(item);
    setDraft(next);
    setSaved(next);
    syncEntityRoute({
      clientSlug: data.client.slug,
      clientName: data.client.name,
      section: "contenido",
      entityType: "content",
      entityId: item.id,
      entityTitle: item.title,
    });
  }
  async function save() {
    if (!selected || !dirty || busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const payload = await apiJson<{ content?: ContentItem }>(
        `/api/content/${selected.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            ...draft,
            deadline: isoFromInput(draft.deadline),
          }),
        },
      );
      const next = payload.content || {
        ...selected,
        ...draft,
        deadline: isoFromInput(draft.deadline),
      };
      setItems((current) =>
        current.map((item) => (item.id === selected.id ? next : item)),
      );
      setSaved(draft);
      setFeedback({ message: "Contenido actualizado." });
      announceFeedback("Contenido actualizado.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "No pude guardar el contenido.";
      setFeedback({ message, error: true });
      announceFeedback(message, "error");
    } finally {
      setBusy(false);
    }
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newTitle.trim() || busy) return;
    setBusy(true);
    try {
      const payload = await apiJson<{ content: ContentItem }>("/api/content", {
        method: "POST",
        body: JSON.stringify({
          clientSlug: data.client.slug,
          title: newTitle,
          format: "Reel",
          channel: "Instagram",
        }),
      });
      setItems((current) => [payload.content, ...current]);
      pick(payload.content, true);
      setDialogOpen(false);
      setNewTitle("");
      announceFeedback("Contenido creado.");
    } catch (error) {
      announceFeedback(
        error instanceof Error ? error.message : "No pude crear el contenido.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }
  async function duplicate() {
    if (!selected || busy) return;
    setBusy(true);
    try {
      const payload = await apiJson<{ content: ContentItem }>(
        `/api/content/${selected.id}/duplicate`,
        { method: "POST", body: "{}" },
      );
      setItems((current) => [payload.content, ...current]);
      pick(payload.content, true);
      announceFeedback("Contenido duplicado.");
    } catch (error) {
      announceFeedback(
        error instanceof Error
          ? error.message
          : "No pude duplicar el contenido.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!selected || busy || !window.confirm(`¿Archivar “${selected.title}”?`))
      return;
    setBusy(true);
    try {
      await apiJson<{ ok: boolean }>(`/api/content/${selected.id}`, {
        method: "DELETE",
      });
      const remaining = items.filter((item) => item.id !== selected.id);
      const nextSelected = remaining[0];
      setItems(remaining);
      setSelectedId(nextSelected?.id || "");
      const next = contentDraft(nextSelected);
      setDraft(next);
      setSaved(next);
      syncEntityRoute({
        clientSlug: data.client.slug,
        clientName: data.client.name,
        section: "contenido",
        entityType: "content",
        entityId: nextSelected?.id,
        entityTitle: nextSelected?.title,
        mode: "replace",
      });
      announceFeedback("Contenido archivado.");
    } catch (error) {
      announceFeedback(
        error instanceof Error
          ? error.message
          : "No pude archivar el contenido.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }
  async function move(item: ContentItem, status: string) {
    const previous = item.status;
    const token = Symbol(item.id);
    moveTokens.current.set(item.id, token);
    setMoving((current) => new Set(current).add(item.id));
    setItems((current) =>
      current.map((row) => (row.id === item.id ? { ...row, status } : row)),
    );
    try {
      await apiJson<{ content?: ContentItem }>(`/api/content/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      if (moveTokens.current.get(item.id) === token)
        announceFeedback(`“${item.title}” pasó a ${status}.`);
    } catch (error) {
      if (moveTokens.current.get(item.id) === token) {
        setItems((current) =>
          current.map((row) =>
            row.id === item.id && row.status === status
              ? { ...row, status: previous }
              : row,
          ),
        );
        announceFeedback(
          error instanceof Error ? error.message : "No pude cambiar el estado.",
          "error",
        );
      }
    } finally {
      if (moveTokens.current.get(item.id) === token) {
        moveTokens.current.delete(item.id);
        setMoving((current) => {
          const next = new Set(current);
          next.delete(item.id);
          return next;
        });
      }
    }
  }
  async function reorderSelected(direction: -1 | 1) {
    if (!selected || busy) return;
    const index = items.findIndex((item) => item.id === selected.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= items.length) return;
    const previous = items;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);
    setBusy(true);
    try {
      await apiJson<{ orderedIds: string[] }>("/api/content/reorder", {
        method: "PATCH",
        body: JSON.stringify({
          clientSlug: data.client.slug,
          orderedIds: next.map((item) => String(item.id)),
        }),
      });
      announceFeedback(
        direction < 0
          ? "Contenido subido en la lista."
          : "Contenido bajado en la lista.",
      );
    } catch (error) {
      setItems(previous);
      announceFeedback(
        error instanceof Error ? error.message : "No pude guardar el orden.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }
  function openWorkflow() {
    setWorkflowDraft(
      configuredStates.length
        ? configuredStates
        : fallbackStates.map((label, index) => ({
            id: `fallback-${index}`,
            label,
            color: "#64748b",
            terminalKind: /publicado/i.test(label)
              ? ("published" as const)
              : /entregado/i.test(label)
                ? ("delivered" as const)
                : null,
          })),
    );
    setWorkflowOpen(true);
  }
  function moveWorkflow(index: number, direction: -1 | 1) {
    setWorkflowDraft((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }
  async function saveWorkflow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (workflowSaving || !workflowDraft.length) return;
    setWorkflowSaving(true);
    try {
      const payload = await apiJson<{
        states: Array<{
          id: string;
          slug: string;
          label: string;
          color?: string;
          terminalKind?: string | null;
        }>;
      }>(`/api/clients/${data.client.slug}/workflow`, {
        method: "PATCH",
        body: JSON.stringify({
          states: workflowDraft.map(({ slug, label, color, terminalKind }) => ({
            slug,
            label,
            color,
            terminalKind,
          })),
        }),
      });
      const next: WorkflowStateDraft[] = payload.states.map((state) => ({
        ...state,
        color: state.color || "#64748b",
        terminalKind: workflowTerminalKind(state.terminalKind),
      }));
      setConfiguredStates(next);
      setWorkflowDraft(next);
      setWorkflowOpen(false);
      announceFeedback("Flujo actualizado.");
      router.refresh();
    } catch (error) {
      announceFeedback(
        error instanceof Error ? error.message : "No pude guardar el flujo.",
        "error",
      );
    } finally {
      setWorkflowSaving(false);
    }
  }
  return (
    <div className="content-v1">
      <div className="collection-toolbar">
        <div className="segmented-control" aria-label="Vista de contenido">
          <button
            className={view === "list" ? "is-active" : ""}
            type="button"
            onClick={() => setView("list")}
          >
            Lista
          </button>
          <button
            className={view === "flow" ? "is-active" : ""}
            type="button"
            onClick={() => setView("flow")}
          >
            Flujo
          </button>
        </div>
        <div className="content-toolbar-actions">
          <button
            className="button button--secondary button--small"
            type="button"
            onClick={openWorkflow}
          >
            <Settings2 size={15} />
            Configurar flujo
          </button>
          <button
            className="button button--primary button--small"
            type="button"
            onClick={() => {
              if (
                !dirty ||
                window.confirm(
                  "Tenés cambios sin guardar. ¿Querés seguir y crear otro contenido?",
                )
              )
                setDialogOpen(true);
            }}
          >
            <Plus size={15} />
            Nuevo contenido
          </button>
        </div>
      </div>
      {view === "flow" ? (
        <div className="workflow-board" aria-label="Flujo de contenido">
          {states.map((state) => (
            <section key={state}>
              <header>
                <strong>{state}</strong>
                <span>
                  {items.filter((item) => item.status === state).length}
                </span>
              </header>
              {items
                .filter((item) => item.status === state)
                .map((item) => (
                  <article key={item.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setView("list");
                        pick(item);
                      }}
                    >
                      <strong>{item.title}</strong>
                      <small>{item.format || "Contenido"}</small>
                    </button>
                    <label>
                      <span className="sr-only">Mover {item.title}</span>
                      <select
                        value={item.status}
                        disabled={moving.has(item.id)}
                        onChange={(event) =>
                          void move(item, event.target.value)
                        }
                      >
                        {states.map((option) => (
                          <option key={option}>{option}</option>
                        ))}
                      </select>
                      <ChevronDown size={12} />
                    </label>
                  </article>
                ))}
            </section>
          ))}
        </div>
      ) : (
        <div
          className={`entity-workspace ${
            mobileDetailOpen
              ? "entity-workspace--mobile-detail"
              : "entity-workspace--mobile-index"
          }`}
        >
          <aside className="entity-index">
            <div className="entity-list" aria-label="Contenido">
              {items.map((item) => (
                <button
                  className={item.id === selected?.id ? "is-active" : ""}
                  type="button"
                  aria-current={item.id === selected?.id ? "true" : undefined}
                  key={item.id}
                  onClick={() => pick(item)}
                >
                  <strong>{item.title}</strong>
                  <span>
                    {item.format || "Contenido"} · {item.channel || "Sin canal"}
                  </span>
                  <small>{item.status}</small>
                </button>
              ))}
            </div>
            <footer>{items.length} piezas</footer>
          </aside>
          {selected ? (
            <article className="entity-detail">
              <button
                className="entity-detail__mobile-back"
                type="button"
                onClick={() => {
                  setMobileDetailOpen(false);
                  syncEntityRoute({
                    clientSlug: data.client.slug,
                    clientName: data.client.name,
                    section: "contenido",
                    entityType: "content",
                  });
                }}
              >
                <ArrowLeft size={16} />
                Todo el contenido
              </button>
              <header className="entity-detail__header">
                <div>
                  <span>Contenido</span>
                  <h2>{selected.title}</h2>
                </div>
                <div>
                  <button
                    className="icon-button"
                    type="button"
                    onClick={() => void reorderSelected(-1)}
                    disabled={busy || selectedIndex <= 0}
                    aria-label="Subir contenido en la lista"
                  >
                    <ArrowUp size={17} />
                  </button>
                  <button
                    className="icon-button"
                    type="button"
                    onClick={() => void reorderSelected(1)}
                    disabled={
                      busy ||
                      selectedIndex < 0 ||
                      selectedIndex >= items.length - 1
                    }
                    aria-label="Bajar contenido en la lista"
                  >
                    <ArrowDown size={17} />
                  </button>
                  <button
                    className="icon-button"
                    type="button"
                    onClick={() => void duplicate()}
                    aria-label="Duplicar contenido"
                  >
                    <Copy size={17} />
                  </button>
                  <button
                    className="icon-button"
                    type="button"
                    onClick={() => void remove()}
                    aria-label="Archivar contenido"
                  >
                    <Archive size={17} />
                  </button>
                  <button
                    className="button button--primary button--small"
                    type="button"
                    onClick={() => void save()}
                    disabled={!dirty || busy}
                  >
                    <Save size={15} />
                    Guardar cambios
                  </button>
                </div>
              </header>
              <Feedback
                message={feedback?.message}
                tone={feedback?.error ? "error" : "success"}
              />
              <div className="entity-form-grid">
                <label className="field field--wide">
                  <span>Título</span>
                  <input
                    value={draft.title}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Formato</span>
                  <input
                    value={draft.format}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        format: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Canal</span>
                  <input
                    value={draft.channel}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        channel: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Estado</span>
                  <select
                    value={draft.status}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        status: event.target.value,
                      }))
                    }
                  >
                    {states.map((state) => (
                      <option key={state}>{state}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Deadline</span>
                  <input
                    type="datetime-local"
                    value={draft.deadline}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        deadline: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field field--wide">
                  <span>Caption</span>
                  <textarea
                    rows={8}
                    value={draft.caption}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        caption: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field field--wide">
                  <span>CTA</span>
                  <textarea
                    rows={3}
                    value={draft.cta}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        cta: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field field--wide">
                  <span>Notas</span>
                  <textarea
                    rows={4}
                    value={draft.notes}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        notes: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              <footer className="lineage-strip">
                <button
                  type="button"
                  disabled={!selected.ideaId}
                  className={selected.ideaId ? "" : "is-muted"}
                  onClick={() =>
                    selected.ideaId &&
                    router.push(
                      clientSectionHref(
                        data.client.slug,
                        "ideas",
                        selected.ideaId,
                      ),
                    )
                  }
                >
                  <Lightbulb size={17} />
                  <span>
                    <b>Idea</b>
                    <small>
                      {selected.ideaId ? "Abrir vinculada" : "Sin vínculo"}
                    </small>
                  </span>
                </button>
                <ArrowRight size={15} />
                <button
                  type="button"
                  disabled={!selected.scriptId}
                  className={selected.scriptId ? "" : "is-muted"}
                  onClick={() =>
                    selected.scriptId &&
                    router.push(
                      clientSectionHref(
                        data.client.slug,
                        "guiones",
                        selected.scriptId,
                      ),
                    )
                  }
                >
                  <FileText size={17} />
                  <span>
                    <b>Guion</b>
                    <small>
                      {selected.scriptId ? "Abrir vinculado" : "Sin vínculo"}
                    </small>
                  </span>
                </button>
                <ArrowRight size={15} />
                <div className="is-current">
                  <CalendarDays size={17} />
                  <span>
                    <b>Contenido</b>
                    <small>{selected.status}</small>
                  </span>
                </div>
                <ArrowRight size={15} />
                <div className={selected.publicationId ? "" : "is-muted"}>
                  <Check size={17} />
                  <span>
                    <b>Publicación</b>
                    <small>
                      {selected.publicationId ? "Vinculada" : "Pendiente"}
                    </small>
                  </span>
                </div>
                <ArrowRight size={15} />
                <button
                  type="button"
                  disabled={!selectedMetric}
                  className={selectedMetric ? "" : "is-muted"}
                  onClick={() =>
                    selectedMetric &&
                    router.push(
                      `${clientSectionHref(data.client.slug, "metricas")}?contentId=${encodeURIComponent(selected.id)}`,
                    )
                  }
                >
                  <BarChart3 size={17} />
                  <span>
                    <b>Métricas</b>
                    <small>{selectedMetric ? "Abrir vinculadas" : "Pendientes"}</small>
                  </span>
                </button>
              </footer>
            </article>
          ) : (
            <EmptyState
              title="Todavía no hay contenido"
              body="Creá una pieza o convertila desde un guion."
            />
          )}
        </div>
      )}
      {!serviceAllowsPublishing ? (
        <p className="service-boundary">
          <Check size={15} />
          El alcance termina en entrega. No se exigirán publicación ni métricas.
        </p>
      ) : null}
      {dialogOpen ? (
        <EntityDialog
          eyebrow={`Nuevo contenido para ${data.client.name}`}
          title="Creá la pieza de trabajo"
          submitLabel={busy ? "Creando" : "Crear contenido"}
          busy={busy}
          onClose={() => setDialogOpen(false)}
          onSubmit={create}
        >
          <label>
            <span>Título</span>
            <input
              autoFocus
              required
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
            />
          </label>
        </EntityDialog>
      ) : null}
      {workflowOpen ? (
        <EntityDialog
          eyebrow={`Pipeline de ${data.client.name}`}
          title="Configurar flujo"
          submitLabel={workflowSaving ? "Guardando" : "Guardar flujo"}
          busy={workflowSaving}
          onClose={() => setWorkflowOpen(false)}
          onSubmit={saveWorkflow}
        >
          <p className="workflow-config-help">
            Ordená y nombrá las etapas que usa este cliente. Las piezas que ya
            estén en una etapa eliminada mantienen su estado hasta que las
            muevas.
          </p>
          <div className="workflow-config-list">
            {workflowDraft.map((state, index) => (
              <div className="workflow-config-row" key={state.id}>
                <input
                  type="color"
                  aria-label={`Color de ${state.label}`}
                  value={state.color || "#64748b"}
                  onChange={(event) =>
                    setWorkflowDraft((current) =>
                      current.map((item) =>
                        item.id === state.id
                          ? { ...item, color: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
                <label>
                  <span>Estado {index + 1}</span>
                  <input
                    required
                    value={state.label}
                    onChange={(event) =>
                      setWorkflowDraft((current) =>
                        current.map((item) =>
                          item.id === state.id
                            ? { ...item, label: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                </label>
                <label className="workflow-config-row__terminal">
                  <span>Al llegar acá</span>
                  <select
                    value={state.terminalKind || ""}
                    onChange={(event) =>
                      setWorkflowDraft((current) =>
                        current.map((item) =>
                          item.id === state.id
                            ? {
                                ...item,
                                terminalKind:
                                  (event.target.value as
                                    | "delivered"
                                    | "published"
                                    | "cancelled") || null,
                              }
                            : item,
                        ),
                      )
                    }
                  >
                    <option value="">El trabajo sigue abierto</option>
                    <option value="delivered">Queda entregado</option>
                    {serviceAllowsPublishing ? (
                      <option value="published">Queda publicado</option>
                    ) : null}
                    <option value="cancelled">Queda cancelado</option>
                  </select>
                </label>
                <div className="workflow-config-row__actions">
                  <button
                    className="icon-button"
                    type="button"
                    disabled={index === 0}
                    aria-label={`Subir ${state.label}`}
                    onClick={() => moveWorkflow(index, -1)}
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button
                    className="icon-button"
                    type="button"
                    disabled={index === workflowDraft.length - 1}
                    aria-label={`Bajar ${state.label}`}
                    onClick={() => moveWorkflow(index, 1)}
                  >
                    <ArrowDown size={16} />
                  </button>
                  <button
                    className="icon-button"
                    type="button"
                    disabled={workflowDraft.length === 1}
                    aria-label={`Eliminar ${state.label}`}
                    onClick={() =>
                      setWorkflowDraft((current) =>
                        current.filter((item) => item.id !== state.id),
                      )
                    }
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button
            className="button button--secondary button--small"
            type="button"
            onClick={() =>
              setWorkflowDraft((current) => [
                ...current,
                {
                  id: crypto.randomUUID(),
                  label: "Nuevo estado",
                  color: "#64748b",
                  terminalKind: null,
                },
              ])
            }
          >
            <Plus size={15} />
            Agregar estado
          </button>
        </EntityDialog>
      ) : null}
    </div>
  );
}
