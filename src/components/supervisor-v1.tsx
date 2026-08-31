"use client";

import Link from "next/link";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Archive,
  ArrowRight,
  BellRing,
  Brain,
  Check,
  ChevronRight,
  Clock3,
  History,
  MessageSquareText,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import { Feedback } from "@/components/ui";

type Nudge = {
  id: string;
  title: string;
  message?: string | null;
  priority?: string | null;
  status?: string | null;
  clientSlug?: string | null;
  clientName?: string | null;
  deepLink?: string | null;
  targetPath?: string | null;
  dueAt?: string | null;
  createdAt?: string | null;
};

type OpenLoop = {
  id: string;
  title: string;
  body?: string | null;
  kind?: string | null;
  status?: string | null;
  salience?: number | null;
  clientSlug?: string | null;
  clientName?: string | null;
  nextEligibleAt?: string | null;
};

type Thread = {
  id: string;
  title: string;
  scope?: string | null;
  clientSlug?: string | null;
  lastMessageAt?: string | null;
};

type Memory = {
  id: string;
  fact: string;
  category: string;
  scope: "global" | "client";
  importance: number;
  clientSlug?: string | null;
  clientName?: string | null;
  updatedAt?: string | null;
};

type ClientChoice = {
  slug: string;
  name: string;
};

type MemoryDraft = {
  id?: string;
  fact: string;
  category: string;
  scope: "global" | "client";
  clientSlug: string;
  importance: number;
};

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function mapRows<T>(
  value: unknown,
  key: string,
  mapper: (row: Record<string, unknown>) => T | null,
) {
  const payload = object(value);
  const rows = Array.isArray(payload?.[key]) ? (payload[key] as unknown[]) : [];
  return rows
    .map(object)
    .filter((row): row is Record<string, unknown> => Boolean(row))
    .map(mapper)
    .filter((row): row is T => Boolean(row));
}

function mapNudge(row: Record<string, unknown>): Nudge | null {
  if (row.id == null || typeof row.title !== "string") return null;
  return {
    id: String(row.id),
    title: row.title,
    message: typeof row.message === "string" ? row.message : null,
    priority:
      typeof row.priority === "string"
        ? row.priority
        : typeof row.severity === "string"
          ? row.severity
          : null,
    status: typeof row.status === "string" ? row.status : null,
    clientSlug: typeof row.clientSlug === "string" ? row.clientSlug : null,
    clientName: typeof row.clientName === "string" ? row.clientName : null,
    deepLink: typeof row.deepLink === "string" ? row.deepLink : null,
    targetPath: typeof row.targetPath === "string" ? row.targetPath : null,
    dueAt: typeof row.dueAt === "string" ? row.dueAt : null,
    createdAt: typeof row.createdAt === "string" ? row.createdAt : null,
  };
}

function mapLoop(row: Record<string, unknown>): OpenLoop | null {
  if (row.id == null || typeof row.title !== "string") return null;
  return {
    id: String(row.id),
    title: row.title,
    body: typeof row.body === "string" ? row.body : null,
    kind: typeof row.kind === "string" ? row.kind : null,
    status: typeof row.status === "string" ? row.status : null,
    salience: typeof row.salience === "number" ? row.salience : null,
    clientSlug: typeof row.clientSlug === "string" ? row.clientSlug : null,
    clientName: typeof row.clientName === "string" ? row.clientName : null,
    nextEligibleAt:
      typeof row.nextEligibleAt === "string" ? row.nextEligibleAt : null,
  };
}

function mapThread(row: Record<string, unknown>): Thread | null {
  if (row.id == null || typeof row.title !== "string") return null;
  return {
    id: String(row.id),
    title: row.title,
    scope: typeof row.scope === "string" ? row.scope : null,
    clientSlug: typeof row.clientSlug === "string" ? row.clientSlug : null,
    lastMessageAt:
      typeof row.lastMessageAt === "string" ? row.lastMessageAt : null,
  };
}

function mapMemory(row: Record<string, unknown>): Memory | null {
  if (row.id == null || typeof row.fact !== "string") return null;
  return {
    id: String(row.id),
    fact: row.fact,
    category: typeof row.category === "string" ? row.category : "hecho",
    scope: row.scope === "client" ? "client" : "global",
    importance: typeof row.importance === "number" ? row.importance : 3,
    clientSlug: typeof row.clientSlug === "string" ? row.clientSlug : null,
    clientName: typeof row.clientName === "string" ? row.clientName : null,
    updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : null,
  };
}

function mapClient(row: Record<string, unknown>): ClientChoice | null {
  if (typeof row.slug !== "string" || typeof row.name !== "string") return null;
  return { slug: row.slug, name: row.name };
}

function relative(value?: string | null) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  const minutes = Math.round((date.getTime() - Date.now()) / 60_000);
  const absoluteMinutes = Math.abs(minutes);
  if (absoluteMinutes < 2) return "Ahora";
  if (absoluteMinutes < 60)
    return minutes > 0
      ? `En ${absoluteMinutes} min`
      : `Hace ${absoluteMinutes} min`;
  const hours = Math.round(absoluteMinutes / 60);
  if (hours < 24) return minutes > 0 ? `En ${hours} h` : `Hace ${hours} h`;
  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "short",
  }).format(date);
}

function openSupervisor(detail?: {
  threadId?: string;
  nudgeId?: string;
  prefill?: string;
  newConversation?: boolean;
}) {
  if (detail?.newConversation) {
    window.localStorage.removeItem("martu-supervisor-thread");
    window.sessionStorage.setItem("martu-supervisor-new", "true");
  }
  if (detail?.threadId)
    window.localStorage.setItem("martu-supervisor-thread", detail.threadId);
  if (detail?.nudgeId)
    window.sessionStorage.setItem("martu-supervisor-nudge", detail.nudgeId);
  if (detail?.prefill)
    window.sessionStorage.setItem("martu-supervisor-prefill", detail.prefill);
  window.dispatchEvent(new Event("martu:open-ai"));
  window.setTimeout(() => {
    if (detail?.newConversation)
      window.dispatchEvent(new Event("martu:supervisor-new"));
    if (detail?.threadId)
      window.dispatchEvent(
        new CustomEvent("martu:supervisor-thread", {
          detail: { threadId: detail.threadId },
        }),
      );
    if (detail?.nudgeId)
      window.dispatchEvent(
        new CustomEvent("martu:supervisor-nudge", {
          detail: { nudgeId: detail.nudgeId },
        }),
      );
    if (detail?.prefill)
      window.dispatchEvent(
        new CustomEvent("martu:supervisor-prefill", {
          detail: { message: detail.prefill },
        }),
      );
  }, 80);
}

export function SupervisorV1() {
  const [nudges, setNudges] = useState<Nudge[]>([]);
  const [loops, setLoops] = useState<OpenLoop[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [clients, setClients] = useState<ClientChoice[]>([]);
  const [memoryFilter, setMemoryFilter] = useState("all");
  const [memoryDraft, setMemoryDraft] = useState<MemoryDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    message: string;
    error?: boolean;
  } | null>(null);
  const loadRequestRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setFeedback(null);

    async function fetchPayload(url: string) {
      const response = await fetch(url, { cache: "no-store" });
      const payload: unknown = await response.json().catch(() => ({}));
      const value = object(payload);
      if (!response.ok)
        throw new Error(
          typeof value?.message === "string"
            ? value.message
            : "No pude actualizar esta sección.",
        );
      return payload;
    }

    const results = await Promise.allSettled([
      fetchPayload("/api/nudges?limit=12"),
      fetchPayload("/api/work/open-loops?status=open&limit=12"),
      fetchPayload("/api/ai/threads?limit=8"),
      fetchPayload("/api/memories?scope=all&limit=100"),
    ]);
    if (requestId !== loadRequestRef.current) return;

    const [nudgesResult, loopsResult, threadsResult, memoriesResult] = results;
    if (nudgesResult.status === "fulfilled")
      setNudges(mapRows(nudgesResult.value, "nudges", mapNudge));
    if (loopsResult.status === "fulfilled")
      setLoops(mapRows(loopsResult.value, "loops", mapLoop));
    if (threadsResult.status === "fulfilled")
      setThreads(mapRows(threadsResult.value, "threads", mapThread));
    if (memoriesResult.status === "fulfilled") {
      setMemories(mapRows(memoriesResult.value, "memories", mapMemory));
      setClients(mapRows(memoriesResult.value, "clients", mapClient));
    }

    const failures = results.filter(
      (result) => result.status === "rejected",
    ).length;
    if (failures) {
      setFeedback({
        message:
          failures === results.length
            ? "No pude actualizar la supervisora. Probá de nuevo."
            : `Actualicé lo disponible; ${failures === 1 ? "una sección no respondió" : `${failures} secciones no respondieron`}.`,
        error: true,
      });
    }
    setLoading(false);
  }, []);

  const visibleMemories = memories.filter((memory) =>
    memoryFilter === "all"
      ? true
      : memoryFilter === "global"
        ? memory.scope === "global"
        : memory.clientSlug === memoryFilter,
  );

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  async function updateLoop(loop: OpenLoop, status: "resolved" | "archived") {
    if (resolving) return;
    if (
      status === "archived" &&
      !window.confirm(
        `¿Archivar “${loop.title}”? Va a salir de los hilos abiertos.`,
      )
    )
      return;
    setResolving(loop.id);
    try {
      const response = await fetch(
        `/api/work/open-loops/${encodeURIComponent(loop.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        message?: string;
      };
      if (!response.ok)
        throw new Error(payload.message || "No pude cerrar este pendiente.");
      setLoops((current) => current.filter((item) => item.id !== loop.id));
      setFeedback({
        message:
          status === "archived" ? "Hilo archivado." : "Pendiente cerrado.",
      });
    } catch (error) {
      setFeedback({
        message:
          error instanceof Error
            ? error.message
            : "No pude cerrar este pendiente.",
        error: true,
      });
    } finally {
      setResolving(null);
    }
  }

  function startMemory(memory?: Memory) {
    setMemoryDraft(
      memory
        ? {
            id: memory.id,
            fact: memory.fact,
            category: memory.category,
            scope: memory.scope,
            clientSlug: memory.clientSlug ?? "",
            importance: memory.importance,
          }
        : {
            fact: "",
            category: "preferencia",
            scope: "global",
            clientSlug: "",
            importance: 3,
          },
    );
  }

  async function saveMemory(draft: MemoryDraft) {
    const editing = Boolean(draft.id);
    const response = await fetch(
      editing
        ? `/api/memories/${encodeURIComponent(draft.id!)}`
        : "/api/memories",
      {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editing ? { action: "correct" } : {}),
          scope: draft.scope,
          clientSlug: draft.scope === "client" ? draft.clientSlug : null,
          category: draft.category,
          fact: draft.fact,
          importance: draft.importance,
        }),
      },
    );
    const payload = (await response.json().catch(() => ({}))) as {
      memory?: unknown;
      message?: string;
    };
    if (!response.ok)
      throw new Error(payload.message || "No pude guardar la memoria.");
    const next = object(payload.memory);
    const memory = next ? mapMemory(next) : null;
    if (!memory)
      throw new Error("La memoria se guardó con una respuesta inválida.");
    setMemories((current) =>
      editing
        ? [memory, ...current.filter((item) => item.id !== draft.id)]
        : [memory, ...current.filter((item) => item.id !== memory.id)],
    );
    setMemoryDraft(null);
    setFeedback({
      message: editing
        ? "Memoria corregida; la versión anterior quedó archivada."
        : "Memoria guardada.",
    });
  }

  async function forgetMemory(memory: Memory) {
    if (
      resolving ||
      !window.confirm(
        `¿Olvidar “${memory.fact}”? La Supervisora dejará de usarlo.`,
      )
    )
      return;
    setResolving(`memory-${memory.id}`);
    try {
      const response = await fetch(
        `/api/memories/${encodeURIComponent(memory.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "forget" }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        message?: string;
      };
      if (!response.ok)
        throw new Error(payload.message || "No pude olvidar esa memoria.");
      setMemories((current) => current.filter((item) => item.id !== memory.id));
      setFeedback({
        message: "Memoria olvidada. La Supervisora ya no la va a tener presente.",
      });
    } catch (error) {
      setFeedback({
        message:
          error instanceof Error
            ? error.message
            : "No pude olvidar esa memoria.",
        error: true,
      });
    } finally {
      setResolving(null);
    }
  }

  return (
    <div className="standard-page supervisor-v1-page">
      <header className="standard-heading supervisor-v1-heading">
        <div>
          <p>Una sola voz, todo el contexto</p>
          <h1>Supervisora</h1>
          <span>
            Te ayuda a decidir y ejecutar sin mezclar conversación con memoria
            permanente.
          </span>
        </div>
        <button
          className="button button--primary"
          type="button"
          onClick={() => openSupervisor({ newConversation: true })}
          data-testid="ai-open"
        >
          <MessageSquareText size={17} />
          Nueva conversación
        </button>
      </header>

      <Feedback
        message={feedback?.message}
        tone={feedback?.error ? "error" : "success"}
      />

      <section className="supervisor-v1-brief">
        <div className="supervisor-v1-brief__copy">
          <span>
            <Sparkles size={15} />
            Foco actual
          </span>
          <h2>
            {loading
              ? "Leyendo tu operación"
              : nudges.length
                ? `${nudges.length} asuntos merecen una decisión`
                : "No hay urgencias abiertas"}
          </h2>
          <p>
            {loading
              ? "Un momento."
              : nudges.length
                ? "Arrancá por los avisos de mayor prioridad o pedime que ordene el día completo."
                : "Podés usar este espacio para pensar, capturar algo o preparar el próximo paso."}
          </p>
        </div>
        <div className="supervisor-v1-brief__stats">
          <div>
            <strong>{nudges.length}</strong>
            <span>Avisos activos</span>
          </div>
          <div>
            <strong>{loops.length}</strong>
            <span>Pendientes abiertos</span>
          </div>
          <div>
            <strong>{threads.length}</strong>
            <span>Conversaciones recientes</span>
          </div>
          <div>
            <strong>{memories.length}</strong>
            <span>Memorias activas</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() =>
            openSupervisor({
              prefill: "Ordename el día y decime por dónde conviene empezar.",
            })
          }
        >
          Ordenar mi día <ArrowRight size={16} />
        </button>
      </section>

      <div className="supervisor-v1-grid" aria-busy={loading}>
        <section className="supervisor-v1-panel supervisor-v1-panel--attention">
          <header>
            <div>
              <BellRing size={17} />
              <span>
                <strong>Necesita atención</strong>
                <small>Señales reales, no recordatorios genéricos</small>
              </span>
            </div>
            <button
              className="icon-button"
              type="button"
              onClick={() => void load()}
              aria-label="Actualizar"
              disabled={loading}
            >
              <RefreshCw size={16} />
            </button>
          </header>
          <div className="supervisor-v1-list">
            {!loading && !nudges.length ? (
              <p className="supervisor-v1-empty">Nada urgente por ahora.</p>
            ) : null}
            {nudges.map((nudge) => (
              <article
                className={
                  /urgent|high/i.test(nudge.priority || "")
                    ? "supervisor-alert is-urgent"
                    : "supervisor-alert"
                }
                key={nudge.id}
              >
                <i aria-hidden="true" />
                <div>
                  <span>
                    {nudge.clientName || "General"}
                    <time>{relative(nudge.createdAt || nudge.dueAt)}</time>
                  </span>
                  <strong>{nudge.title}</strong>
                  {nudge.message ? <p>{nudge.message}</p> : null}
                </div>
                <div className="supervisor-alert__actions">
                  <button
                    type="button"
                    onClick={() => openSupervisor({ nudgeId: nudge.id })}
                  >
                    Resolver
                  </button>
                  <Link
                    href={nudge.deepLink || nudge.targetPath || "/day"}
                    prefetch={false}
                    aria-label={`Abrir contexto de ${nudge.title}`}
                  >
                    <ChevronRight size={17} />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="supervisor-v1-panel">
          <header>
            <div>
              <Clock3 size={17} />
              <span>
                <strong>Pendientes que no hay que perder</strong>
                <small>Se mantienen hasta que se resuelven</small>
              </span>
            </div>
          </header>
          <div className="supervisor-v1-list">
            {!loading && !loops.length ? (
              <p className="supervisor-v1-empty">No hay cabos sueltos.</p>
            ) : null}
            {loops.map((loop) => (
              <article className="open-loop-row" key={loop.id}>
                <button
                  className="open-loop-row__check"
                  type="button"
                  onClick={() => void updateLoop(loop, "resolved")}
                  disabled={Boolean(resolving)}
                  aria-label={`Cerrar ${loop.title}`}
                >
                  <Check size={15} />
                </button>
                <div>
                  <span>
                    {loop.clientName || "General"}
                    {loop.kind ? ` · ${loop.kind}` : ""}
                  </span>
                  <strong>{loop.title}</strong>
                  {loop.body ? <p>{loop.body}</p> : null}
                </div>
                <div className="open-loop-row__actions">
                  <button
                    type="button"
                    onClick={() =>
                      openSupervisor({
                        prefill: `Retomemos este hilo abierto${loop.clientName ? ` de ${loop.clientName}` : ""}: ${loop.title}${loop.body ? `. Contexto: ${loop.body}` : ""}`,
                      })
                    }
                  >
                    <Sparkles size={14} />
                    Abrir
                  </button>
                  <button
                    type="button"
                    onClick={() => void updateLoop(loop, "archived")}
                    disabled={Boolean(resolving)}
                    aria-label={`Archivar ${loop.title}`}
                  >
                    <Archive size={14} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="supervisor-v1-panel supervisor-v1-panel--history">
          <header>
            <div>
              <History size={17} />
              <span>
                <strong>Conversaciones</strong>
                <small>Historial separado de la memoria</small>
              </span>
            </div>
            <button
              type="button"
              onClick={() => openSupervisor({ newConversation: true })}
            >
              Nueva
            </button>
          </header>
          <div className="supervisor-v1-list">
            {!loading && !threads.length ? (
              <p className="supervisor-v1-empty">
                Todavía no hay conversaciones guardadas.
              </p>
            ) : null}
            {threads.map((thread) => (
              <button
                className="conversation-row"
                type="button"
                onClick={() => openSupervisor({ threadId: thread.id })}
                key={thread.id}
              >
                <MessageSquareText size={16} />
                <span>
                  <strong>{thread.title}</strong>
                  <small>{thread.clientSlug || "Contexto global"}</small>
                </span>
                <time>{relative(thread.lastMessageAt)}</time>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
        </section>

        <section className="supervisor-v1-panel supervisor-v1-panel--memories">
          <header>
            <div>
              <Brain size={17} />
              <span>
                <strong>Memoria explícita</strong>
                <small>Hechos y preferencias que la Supervisora tiene presentes</small>
              </span>
            </div>
            <div className="memory-panel__controls">
              <label>
                <span className="sr-only">Filtrar memorias</span>
                <select
                  value={memoryFilter}
                  onChange={(event) => setMemoryFilter(event.target.value)}
                >
                  <option value="all">Todas</option>
                  <option value="global">General</option>
                  {clients.map((client) => (
                    <option key={client.slug} value={client.slug}>
                      {client.name}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={() => startMemory()}>
                <Plus size={14} />
                Agregar
              </button>
            </div>
          </header>
          <p className="memory-panel__explain">
            El historial conserva conversaciones. Esta lista es más chica y
            controlable: podés corregir un dato o pedir que se olvide.
          </p>
          <div className="supervisor-v1-list">
            {!loading && !visibleMemories.length ? (
              <p className="supervisor-v1-empty">
                No hay memorias activas en este alcance.
              </p>
            ) : null}
            {visibleMemories.map((memory) => (
              <article className="memory-row" key={memory.id}>
                <div
                  className="memory-row__mark"
                  aria-label={`Importancia ${memory.importance} de 5`}
                >
                  <Brain size={15} />
                </div>
                <div>
                  <span>
                    {memory.scope === "global"
                      ? "General"
                      : memory.clientName || memory.clientSlug}{" "}
                    · {memory.category}
                  </span>
                  <strong>{memory.fact}</strong>
                  <small>
                    Importancia {memory.importance}/5 ·{" "}
                    {relative(memory.updatedAt)}
                  </small>
                </div>
                <div className="memory-row__actions">
                  <button
                    type="button"
                    onClick={() => startMemory(memory)}
                    aria-label={`Corregir memoria: ${memory.fact}`}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => void forgetMemory(memory)}
                    disabled={Boolean(resolving)}
                    aria-label={`Olvidar memoria: ${memory.fact}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      {memoryDraft ? (
        <MemoryDialog
          draft={memoryDraft}
          clients={clients}
          onClose={() => setMemoryDraft(null)}
          onSave={saveMemory}
        />
      ) : null}
    </div>
  );
}

function MemoryDialog({
  draft,
  clients,
  onClose,
  onSave,
}: {
  draft: MemoryDraft;
  clients: ClientChoice[];
  onClose: () => void;
  onSave: (draft: MemoryDraft) => Promise<void>;
}) {
  const [value, setValue] = useState(draft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const form = formRef.current;
    form?.querySelector<HTMLElement>("textarea")?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !form) return;
      const focusable = [
        ...form.querySelectorAll<HTMLElement>(
          "button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])",
        ),
      ];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(value);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No pude guardar la memoria.",
      );
      setSaving(false);
    }
  }

  return (
    <div
      className="modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="memory-dialog-title"
    >
      <button
        className="modal__scrim"
        type="button"
        onClick={onClose}
        aria-label="Cerrar edición de memoria"
        tabIndex={-1}
      />
      <form
        className="modal__body memory-dialog"
        ref={formRef}
        onSubmit={submit}
        aria-busy={saving}
      >
        <header>
          <div>
            <p>Contexto controlado</p>
            <h2 id="memory-dialog-title">
              {value.id ? "Corregir memoria" : "Agregar memoria"}
            </h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </header>
        <Feedback message={error} tone="error" />
        <label className="field memory-dialog__fact">
          <span>Qué debe recordar</span>
          <textarea
            rows={4}
            maxLength={4_000}
            required
            value={value.fact}
            onChange={(event) =>
              setValue((current) => ({ ...current, fact: event.target.value }))
            }
            placeholder="Ej.: Para Gavilán, evitar videos institucionales."
          />
        </label>
        <div className="memory-dialog__grid">
          <label className="field">
            <span>Alcance</span>
            <select
              value={value.scope}
              onChange={(event) =>
                setValue((current) => ({
                  ...current,
                  scope: event.target.value as MemoryDraft["scope"],
                  clientSlug:
                    event.target.value === "global" ? "" : current.clientSlug,
                }))
              }
            >
              <option value="global">General</option>
              <option value="client">Un cliente</option>
            </select>
          </label>
          {value.scope === "client" ? (
            <label className="field">
              <span>Cliente</span>
              <select
                required
                value={value.clientSlug}
                onChange={(event) =>
                  setValue((current) => ({
                    ...current,
                    clientSlug: event.target.value,
                  }))
                }
              >
                <option value="">Elegir cliente</option>
                {clients.map((client) => (
                  <option key={client.slug} value={client.slug}>
                    {client.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="field">
            <span>Categoría</span>
            <input
              maxLength={80}
              required
              value={value.category}
              onChange={(event) =>
                setValue((current) => ({
                  ...current,
                  category: event.target.value,
                }))
              }
            />
          </label>
          <label className="field">
            <span>Importancia</span>
            <select
              value={value.importance}
              onChange={(event) =>
                setValue((current) => ({
                  ...current,
                  importance: Number(event.target.value),
                }))
              }
            >
              {[1, 2, 3, 4, 5].map((importance) => (
                <option key={importance} value={importance}>
                  {importance} / 5
                </option>
              ))}
            </select>
          </label>
        </div>
        {value.id ? (
          <p className="memory-dialog__note">
            La corrección crea una versión nueva y archiva la anterior. Así no
            se pierde el historial de por qué cambió el contexto.
          </p>
        ) : null}
        <footer>
          <button
            className="button"
            type="button"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            className="button button--primary"
            type="submit"
            disabled={saving}
          >
            {saving
              ? "Guardando…"
              : value.id
                ? "Guardar corrección"
                : "Guardar memoria"}
          </button>
        </footer>
      </form>
    </div>
  );
}
