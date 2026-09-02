"use client";
/* eslint-disable @next/next/no-img-element -- Meta CDN URLs are dynamic, signed and may expire. */

import {
  FormEvent,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  Archive,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  FileText,
  FlaskConical,
  Folder,
  GitBranch,
  Instagram as InstagramIcon,
  ExternalLink,
  Link2,
  Lightbulb,
  NotebookPen,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Tag,
  Users,
  Unplug,
} from "lucide-react";
import { ClientMark, SunMark } from "@/components/brand";
import {
  announceFeedback,
  EmptyState,
  Feedback,
  SectionTitle,
  TimeAgo,
} from "@/components/ui";
import { entityHref } from "@/lib/entity-href";
import { activityLabel } from "@/lib/activity-label";
import type {
  ActivityItem,
  ClientScript,
  ClientWorkspaceData,
  ContentItem,
  DeadlineItem,
  WorkItem,
  InsightItem,
  InsightKind,
  InsightSurface,
} from "@/components/types";

function prettyDate(
  value?: string | null,
  options?: Intl.DateTimeFormatOptions,
) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const requested = options ?? { day: "numeric", month: "short" };
  const parts = new Intl.DateTimeFormat("es-AR", {
    ...requested,
    timeZone: "America/Argentina/Buenos_Aires",
    ...(requested.hour ? { hourCycle: "h23" as const } : {}),
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((result, part) => {
      if (part.type !== "literal")
        result[part.type] = part.value.replace(".", "");
      return result;
    }, {});
  const day = parts.day || "";
  const month = parts.month || "";
  const calendar =
    day && month
      ? `${day}${requested.month === "long" ? " de " : " "}${month}`
      : day || month;
  const time = parts.hour
    ? `${parts.hour.padStart(2, "0")}:${(parts.minute || "00").padStart(2, "0")}`
    : "";
  return [calendar, time].filter(Boolean).join(" · ");
}

function openAi() {
  window.dispatchEvent(new Event("martu:open-ai"));
}

function entityLabel(value?: string | null) {
  const normalized = (value ?? "").toLocaleLowerCase("es");
  return (
    {
      content: "Contenido",
      content_item: "Contenido",
      script: "Guion",
      idea: "Idea",
      task: "Tarea",
      meeting: "Reunión",
      note: "Nota",
      metric: "Métrica",
      campaign: "Campaña",
      creative: "Creativo",
    }[normalized] || value || "Tarea"
  );
}

function activityHref(item: ActivityItem, slug: string) {
  const exactEntity = entityHref({
    clientSlug: slug,
    entityType: item.entityType,
    entityId: item.entityId,
    fallback: `/clients/${slug}/actividad`,
  });
  return item.entityType && item.entityId
    ? exactEntity
    : item.targetPath || exactEntity;
}

function WorkRows({ items, slug }: { items: WorkItem[]; slug: string }) {
  if (!items.length)
    return (
      <EmptyState
        title="Todo al día"
        body="No hay trabajo abierto para este cliente."
      />
    );
  return (
    <div className="client-work-list">
      {items.slice(0, 5).map((item, index) => (
        <Link
          className={
            index === 0 ? "client-work-row is-primary" : "client-work-row"
          }
          prefetch={false}
          href={entityHref({
            clientSlug: slug,
            entityType: item.entityType || "task",
            entityId: item.entityId || item.id,
            fallback: `/work?item=${item.id}`,
          })}
          key={item.id}
          aria-label={`Abrir ${item.title}`}
        >
          <span>{index + 1}</span>
          <i />
          <div>
            <strong>{item.title}</strong>
            <small>
              <CalendarDays size={12} />
              {item.dueLabel || "Esta semana"}
              <em>·</em>
                  {entityLabel(item.entityType)}
            </small>
          </div>
          <b>{item.status}</b>
          <ChevronRight size={18} />
        </Link>
      ))}
    </div>
  );
}

function DeadlinesRail({
  deadlines,
  slug,
}: {
  deadlines: DeadlineItem[];
  slug: string;
}) {
  return (
    <section>
      <SectionTitle icon={<CalendarDays size={17} />}>Próximos</SectionTitle>
      <div className="deadline-list">
        {deadlines.slice(0, 5).map((deadline) => (
          <Link
            prefetch={false}
            href={
              deadline.targetPath ||
              entityHref({
                clientSlug: slug,
                entityType: deadline.entityType,
                entityId: deadline.entityId,
                fallback: `/clients/${slug}/calendario`,
              })
            }
            key={deadline.id}
          >
            <time className={deadline.urgent ? "is-urgent" : ""}>
              <b>{prettyDate(deadline.date, { day: "2-digit" })}</b>
              <span>
                {prettyDate(deadline.date, { month: "short" }).replace(
                  /\d/g,
                  "",
                )}
              </span>
            </time>
            <div>
              <strong>{deadline.title}</strong>
              <span>{deadline.type || deadline.dateLabel || "Deadline"}</span>
            </div>
            <ChevronRight size={16} />
          </Link>
        ))}
      </div>
      <Link
        className="text-link"
        href={`/clients/${slug}/calendario`}
        prefetch={false}
      >
        Ver calendario del cliente <ChevronRight size={15} />
      </Link>
    </section>
  );
}

function ActivityRail({
  activity,
  slug,
}: {
  activity: ActivityItem[];
  slug: string;
}) {
  return (
    <section>
      <SectionTitle icon={<Clock3 size={17} />}>
        Actividad reciente
      </SectionTitle>
      <div className="activity-timeline">
        {activity.slice(0, 5).map((item) => (
          <Link
            prefetch={false}
            href={
              activityHref(item, slug)
            }
            key={item.id}
          >
            <article>
              <i />
              <time>
                <TimeAgo value={item.createdAt} />
              </time>
              <strong>{item.title}</strong>
              <p>{item.detail}</p>
            </article>
          </Link>
        ))}
      </div>
      <Link
        className="text-link"
        href={`/clients/${slug}/actividad`}
        prefetch={false}
      >
        Ver toda la actividad <ChevronRight size={15} />
      </Link>
    </section>
  );
}

export function SummaryPanel({ data }: { data: ClientWorkspaceData }) {
  const work = data.summary?.workInProgress?.length
    ? data.summary.workInProgress
    : data.tasks.filter((task) => task.status !== "Completada");
  const deadlines = data.summary?.deadlines ?? [];
  const lastNote = data.notes[0];
  const meeting = data.meetings[0];
  const metric = data.metrics[0];

  return (
    <div className="summary-layout">
      <div className="summary-canvas">
        <section className="client-supervisor">
          <ClientMark
            name={data.client.name}
            large
            logoUrl={data.client.logoUrl}
            accent={data.client.accent}
          />
          <blockquote>
            {data.summary?.insight ||
              `Hay una sola cosa que hoy movería primero: cerrar lo urgente de ${data.client.name} antes del próximo deadline.`}
          </blockquote>
          <button
            className="button button--primary button--small"
            type="button"
            onClick={openAi}
          >
            Resolver con la Supervisora
          </button>
        </section>
        <section>
          <SectionTitle>En curso</SectionTitle>
          <WorkRows items={work} slug={data.client.slug} />
        </section>
        <div className="summary-notes">
          <section>
            <SectionTitle icon={<NotebookPen size={17} />}>
              Últimas notas
            </SectionTitle>
            {lastNote ? (
              <>
                <p>{lastNote.text}</p>
                <small>{prettyDate(lastNote.createdAt)} · por Martu</small>
              </>
            ) : (
              <EmptyState
                title="Sin notas"
                body="Añadí el primer dato que no querés perder."
              />
            )}
          </section>
          <section>
            <SectionTitle icon={<Users size={17} />}>
              Reunión reciente
            </SectionTitle>
            {meeting ? (
              <>
                <strong>
                  {meeting.title || `Reunión con ${data.client.name}`}{" "}
                  <small>· {prettyDate(meeting.date)}</small>
                </strong>
                <p>{meeting.summary}</p>
                <Link
                  className="text-link"
                  href={`/clients/${data.client.slug}/notas`}
                  prefetch={false}
                >
                  Ver resumen completo <ChevronRight size={14} />
                </Link>
              </>
            ) : (
              <EmptyState
                title="Sin reuniones"
                body="Todavía no hay reuniones registradas."
              />
            )}
          </section>
        </div>
        {metric ? (
          <section className="performance-strip">
            <SectionTitle icon={<BarChart3 size={17} />}>
              Rendimiento destacado
            </SectionTitle>
            <div className="content-thumbnail">
              <Play size={17} />
            </div>
            <div>
              <Link
                prefetch={false}
                href={entityHref({
                  clientSlug: data.client.slug,
                  entityType: "content",
                  entityId: metric.contentItemId,
                  fallback: `/clients/${data.client.slug}/metricas`,
                })}
              >
                <strong>{metric.contentTitle || "Contenido reciente"}</strong>
              </Link>
              <small>Publicado recientemente</small>
            </div>
            <p>
              Buen alcance en la última semana. Una señal para observar, no una
              causalidad.
            </p>
            <Link
              className="text-link"
              href={`/clients/${data.client.slug}/metricas`}
              prefetch={false}
            >
              Ver métricas <ChevronRight size={14} />
            </Link>
          </section>
        ) : null}
      </div>
      <aside className="client-rail">
        <DeadlinesRail deadlines={deadlines} slug={data.client.slug} />
        <ActivityRail activity={data.activity} slug={data.client.slug} />
      </aside>
    </div>
  );
}

export function StrategyPanel({ data }: { data: ClientWorkspaceData }) {
  const strategy = data.strategy;
  const brief = data.brief;
  if (!strategy && !brief)
    return (
      <EmptyState
        title="La estrategia está pendiente"
        body="La app no te bloquea, pero tu supervisora va a seguir recordando que falta cargar contexto real."
      />
    );
  return (
    <div className="document-layout strategy-panel">
      <article className="strategy-document">
        <header>
          <p>Documento vivo · versión {strategy?.version || 1}</p>
          <h2>Estrategia de {data.client.name}</h2>
          <span>Actualizada {prettyDate(strategy?.updatedAt)}</span>
        </header>
        <section>
          <h3>Objetivos</h3>
          <ul>
            {(
              strategy?.objectives || [
                brief?.summary ||
                  "Ordenar la comunicación y generar demanda consistente.",
              ]
            ).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
        <section className="strategy-split">
          <div>
            <h3>Audiencia</h3>
            <p>
              {strategy?.audience ||
                brief?.audience ||
                "Audiencia pendiente de completar."}
            </p>
          </div>
          <div>
            <h3>Tono</h3>
            <p>{strategy?.tone || "Cercano, claro y específico."}</p>
          </div>
        </section>
        <section>
          <h3>Posicionamiento</h3>
          <p>
            {strategy?.positioning ||
              "Una alternativa cercana, simple y confiable dentro de su categoría."}
          </p>
        </section>
        <section>
          <h3>Pilares de contenido</h3>
          <div className="open-list">
            {(
              strategy?.pillars || [
                "Educación útil",
                "Experiencias reales",
                "Prueba social",
              ]
            ).map((pillar, index) => (
              <div key={pillar}>
                <span>0{index + 1}</span>
                <strong>{pillar}</strong>
              </div>
            ))}
          </div>
        </section>
        <section>
          <h3>Decisiones tomadas</h3>
          <ul>
            {(
              strategy?.decisions || [
                "Priorizar piezas cortas y verticales.",
                "Usar testimonios reales antes que mensajes institucionales.",
              ]
            ).map((decision) => (
              <li key={decision}>{decision}</li>
            ))}
          </ul>
        </section>
      </article>
      <aside className="strategy-rail">
        <SectionTitle icon={<Sparkles size={17} />}>
          Sugerencias
        </SectionTitle>
        {(
          strategy?.aiSuggestions ||
          strategy?.hypotheses || [
            "Probar un hook más concreto para la próxima tanda y medir retención inicial.",
          ]
        ).map((suggestion) => (
          <article key={suggestion}>
            <SunMark size={19} />
            <p>{suggestion}</p>
            <button type="button" onClick={openAi}>
              Explorar
            </button>
          </article>
        ))}
      </aside>
    </div>
  );
}

function IdeaDialog({
  data,
  onClose,
  onSaved,
}: {
  data: ClientWorkspaceData;
  onClose: () => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientSlug: data.client.slug,
          title,
          description,
          status: "Borrador",
          origin: "Martu OS",
        }),
      });
      if (!response.ok) throw new Error("No pude guardar la idea.");
      announceFeedback("Idea guardada en el histórico de este cliente.");
      onSaved();
      onClose();
      window.setTimeout(() => router.refresh(), 1200);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No pude guardar la idea.";
      setError(message);
      announceFeedback(message, "error");
    } finally {
      setSaving(false);
    }
  }
  return (
    <div
      className="modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="idea-dialog-title"
    >
      <button
        className="modal__scrim"
        type="button"
        onClick={onClose}
        aria-label="Cerrar"
      />
      <form className="modal__body" onSubmit={submit}>
        <header>
          <div>
            <p>Nueva idea para {data.client.name}</p>
            <h2 id="idea-dialog-title">Que no se pierda</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </header>
        <label>
          <span>Título</span>
          <input
            autoFocus
            required
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Ej. Guía para una escapada corta"
            data-testid="idea-title"
          />
        </label>
        <label>
          <span>Desarrollo</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={5}
            placeholder="Qué imaginaste, para quién y por qué puede funcionar…"
          />
        </label>
        {error ? <Feedback message={error} tone="error" /> : null}
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
            disabled={saving || !title.trim()}
            data-testid="save-idea"
          >
            {saving ? "Guardando…" : "Guardar idea"}
          </button>
        </footer>
      </form>
    </div>
  );
}

export function IdeasPanel({ data }: { data: ClientWorkspaceData }) {
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const ideas = useMemo(
    () =>
      data.ideas.filter((idea) =>
        `${idea.title} ${idea.description} ${(idea.tags || []).join(" ")}`
          .toLocaleLowerCase("es")
          .includes(deferred.toLocaleLowerCase("es")),
      ),
    [data.ideas, deferred],
  );
  return (
    <div className="collection-panel ideas-panel">
      <div className="collection-toolbar">
        <label className="search-field">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar ideas…"
          />
        </label>
        <button
          className="button button--primary button--small"
          type="button"
          onClick={() => setOpen(true)}
          data-testid="add-idea"
        >
          <Plus size={16} />
          Nueva idea
        </button>
      </div>
      <Feedback message={feedback} />
      <div className="idea-list">
        {ideas.map((idea) => (
          <article key={idea.id}>
            <div className="idea-list__date">
              <span>{prettyDate(idea.createdAt, { month: "short" })}</span>
              <b>{prettyDate(idea.createdAt, { day: "2-digit" })}</b>
            </div>
            <div>
              <header>
                <strong>{idea.title}</strong>
                <span>{idea.status}</span>
              </header>
              <p>{idea.description}</p>
              <footer>
                <span>
                  <Lightbulb size={13} />
                  {idea.origin || "Martu"}
                </span>
                {(idea.tags || []).map((tag) => (
                  <span key={tag}>
                    <Tag size={12} />
                    {tag}
                  </span>
                ))}
                {idea.contentId ? (
                  <Link
                    href={`/clients/${data.client.slug}/contenido`}
                    prefetch={false}
                  >
                    Ver contenido <ChevronRight size={13} />
                  </Link>
                ) : null}
              </footer>
            </div>
          </article>
        ))}
      </div>
      {!ideas.length ? (
        <EmptyState
          title="No hay coincidencias"
          body="Probá otra búsqueda o capturá una idea nueva."
        />
      ) : null}
      {open ? (
        <IdeaDialog
          data={data}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setFeedback("Idea guardada en el histórico de este cliente.");
            window.setTimeout(() => setFeedback(null), 3500);
          }}
        />
      ) : null}
    </div>
  );
}

type ScriptDraft = Pick<
  ClientScript,
  "objective" | "hook" | "body" | "cta" | "notes"
>;

function scriptDraft(script: ClientScript): ScriptDraft {
  return {
    objective: script.objective || "",
    hook: script.hook || "",
    body: script.body || "",
    cta: script.cta || "",
    notes: script.notes || "",
  };
}

function ScriptDocument({
  script,
  clientSlug,
}: {
  script: ClientScript;
  clientSlug: string;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<ScriptDraft>(() => scriptDraft(script));
  const [savedDraft, setSavedDraft] = useState<ScriptDraft>(() =>
    scriptDraft(script),
  );
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    message: string;
    error?: boolean;
  } | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(savedDraft);
  const fields: Array<{ key: keyof ScriptDraft; label: string; rows: number }> =
    [
      { key: "objective", label: "Objetivo", rows: 2 },
      { key: "hook", label: "Hook", rows: 2 },
      { key: "body", label: "Cuerpo", rows: 7 },
      { key: "cta", label: "CTA", rows: 2 },
      { key: "notes", label: "Notas", rows: 3 },
    ];

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/scripts/${script.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        message?: string;
      };
      if (!response.ok)
        throw new Error(payload.message || "No pude guardar el guion.");
      setSavedDraft(draft);
      setFeedback({
        message: "Guion guardado y registrado en la actividad del cliente.",
      });
      announceFeedback("Guion guardado.");
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No pude guardar el guion.";
      setFeedback({ message, error: true });
      announceFeedback(message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="script-document">
      <header>
        <div>
          <h2>{script.title}</h2>
          <p>
            {script.format || "Reel"}
            <span>·</span>
            {draft.objective || "Sin objetivo"}
            <span>·</span>v{script.version || 1}
            <span>·</span>Editado {prettyDate(script.updatedAt)}
          </p>
        </div>
        <div className="script-document__actions">
          <span>
            <Check size={15} />
            {saving ? "Guardando…" : dirty ? "Cambios sin guardar" : "Guardado"}
          </span>
          <button
            className="button button--secondary button--small"
            type="button"
            onClick={() => void save()}
            disabled={!dirty || saving}
            data-testid="save-script"
          >
            <Check size={15} />
            Guardar cambios
          </button>
          <button
            className="button button--primary button--small"
            type="button"
            onClick={openAi}
          >
            <Sparkles size={15} />
            Pedir feedback
          </button>
        </div>
      </header>
      <Feedback
        message={feedback?.message}
        tone={feedback?.error ? "error" : "success"}
      />
      {fields.map((field) => (
        <label className="script-field" key={field.key}>
          <span>{field.label}</span>
          <textarea
            value={draft[field.key]}
            rows={field.rows}
            aria-label={field.label}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                [field.key]: event.target.value,
              }))
            }
          />
        </label>
      ))}
      <footer className="script-association">
        <div>
          <FileText size={17} />
          <span>
            <b>Contenido asociado</b>
            <small>
              {script.contentId ? "Reel vinculado" : "Todavía sin vincular"}
            </small>
          </span>
        </div>
        <div>
          <CalendarDays size={17} />
          <span>
            <b>Deadline</b>
            <small className="urgent-text">{prettyDate(script.deadline)}</small>
          </span>
        </div>
        {script.contentId ? (
          <Link
            className="text-link"
            href={`/clients/${clientSlug}/contenido`}
            prefetch={false}
          >
            Ver contenido <ChevronRight size={14} />
          </Link>
        ) : null}
      </footer>
    </article>
  );
}

export function ScriptsPanel({ data }: { data: ClientWorkspaceData }) {
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const filtered = useMemo(
    () =>
      data.scripts.filter((script) =>
        `${script.title} ${script.hook} ${script.status}`
          .toLocaleLowerCase("es")
          .includes(deferred.toLocaleLowerCase("es")),
      ),
    [data.scripts, deferred],
  );
  const [selectedId, setSelectedId] = useState(data.scripts[0]?.id || "");
  const selected =
    filtered.find((script) => script.id === selectedId) || filtered[0];
  if (!data.scripts.length)
    return (
      <EmptyState
        title="Todavía no hay guiones"
        body="Creá el primero con la supervisora o desde una idea."
      />
    );
  return (
    <div className="scripts-layout">
      <aside className="scripts-index">
        <div className="scripts-index__toolbar">
          <label className="search-field">
            <Search size={15} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar guiones…"
              data-testid="script-search"
            />
          </label>
          <div>
            <button
              type="button"
              disabled
              title="La V0 muestra todos los guiones"
            >
              Todos <ChevronDown size={14} />
            </button>
            <button
              className="button button--primary button--small"
              type="button"
              onClick={openAi}
            >
              <Plus size={15} />
              Nuevo guion
            </button>
          </div>
        </div>
        <div className="script-list">
          {filtered.map((script) => (
            <button
              className={script.id === selected?.id ? "is-active" : ""}
              type="button"
              key={script.id}
              onClick={() => setSelectedId(script.id)}
            >
              <strong>{script.title}</strong>
              <span>{script.status}</span>
              <small>
                v{script.version || 1}
                <em>·</em>
                {prettyDate(script.updatedAt)}
              </small>
            </button>
          ))}
        </div>
      </aside>
      {selected ? (
        <ScriptDocument
          key={selected.id}
          script={selected}
          clientSlug={data.client.slug}
        />
      ) : (
        <EmptyState
          title="Sin coincidencias"
          body="No hay guiones que coincidan con la búsqueda."
        />
      )}
      <aside className="versions-rail">
        <SectionTitle>Versiones</SectionTitle>
        {[selected?.version || 3, 2, 1].map((version, index) => (
          <article key={`${selected?.id}-${version}-${index}`}>
            <i />
            <strong>
              v{version} {index === 0 ? <span>Actual</span> : null}
            </strong>
            <small>
              {index === 0
                ? "Editado ayer por Martu"
                : `${index + 1} may · por Martu`}
            </small>
            <p>
              {index === 0
                ? "Ajuste de hook y cierre. Mejoró el CTA."
                : "Reestructura del cuerpo y enfoque."}
            </p>
          </article>
        ))}
        <div className="script-comment">
          <SectionTitle>Comentarios (1)</SectionTitle>
          <p>
            <b>{data.client.name}</b>
            <span>Ayer 16:40</span>
          </p>
          <blockquote>
            Me gusta el enfoque. ¿Podemos probar una opción de CTA más breve?
          </blockquote>
        </div>
      </aside>
    </div>
  );
}

const fullStatuses = [
  "Idea",
  "Guion",
  "Para grabar",
  "Grabado",
  "Editando",
  "Listo",
  "En aprobación",
  "Aprobado",
  "Programado",
  "Publicado",
  "Entregado",
];
const deliveryStatuses = [
  "Idea",
  "Guion",
  "Para grabar",
  "Grabado",
  "Editando",
  "Listo",
  "Entregado",
];

function ContentStatus({
  item,
  allowPublishing,
  onSaved,
}: {
  item: ContentItem;
  allowPublishing: boolean;
  onSaved?: (message: string, error?: boolean) => void;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(item.status);
  const [saving, setSaving] = useState(false);
  async function update(next: string) {
    const previous = status;
    setStatus(next);
    setSaving(true);
    try {
      const response = await fetch(`/api/content/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!response.ok) throw new Error();
      const message = `“${item.title}” pasó a ${next}.`;
      onSaved?.(message);
      announceFeedback(message);
      window.setTimeout(() => router.refresh(), 1200);
    } catch {
      setStatus(previous);
      onSaved?.("No pude actualizar el contenido.", true);
      announceFeedback("No pude actualizar el contenido.", "error");
    } finally {
      setSaving(false);
    }
  }
  return (
    <label className="status-select">
      <span className="sr-only">Estado de {item.title}</span>
      <select
        value={status}
        onChange={(event) => update(event.target.value)}
        disabled={saving}
        data-testid={`content-status-${item.id}`}
      >
        {(allowPublishing ? fullStatuses : deliveryStatuses).map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
      <ChevronDown size={13} />
    </label>
  );
}

export function ContentPanel({ data }: { data: ClientWorkspaceData }) {
  const allowPublishing = data.services.some((service) =>
    /publicaci|community|cm|historias/i.test(service),
  );
  const [view, setView] = useState<"list" | "board">("list");
  const [feedback, setFeedback] = useState<{
    message: string;
    error?: boolean;
  } | null>(null);
  function showFeedback(message: string, error?: boolean) {
    setFeedback({ message, error });
    window.setTimeout(() => setFeedback(null), 3500);
  }
  const stages = allowPublishing
    ? [
        "Guion",
        "Para grabar",
        "Grabado",
        "Editando",
        "En aprobación",
        "Programado",
        "Publicado",
      ]
    : ["Guion", "Para grabar", "Grabado", "Editando", "Listo", "Entregado"];
  return (
    <div className="content-panel">
      <div className="collection-toolbar">
        <div className="tab-filter">
          <button
            className={view === "list" ? "is-active" : ""}
            type="button"
            onClick={() => setView("list")}
          >
            Lista
          </button>
          <button
            className={view === "board" ? "is-active" : ""}
            type="button"
            onClick={() => setView("board")}
          >
            Flujo
          </button>
        </div>
        <button
          className="button button--primary button--small"
          type="button"
          onClick={openAi}
        >
          <Plus size={15} />
          Nuevo contenido
        </button>
      </div>
      <Feedback
        message={feedback?.message}
        tone={feedback?.error ? "error" : "success"}
      />
      {view === "list" ? (
        <div className="content-list">
          <div className="content-list__head">
            <span>Contenido</span>
            <span>Formato</span>
            <span>Deadline</span>
            <span>Estado</span>
          </div>
          {data.content.map((item) => (
            <article key={item.id}>
              <div>
                <span className="content-icon">
                  <Play size={15} />
                </span>
                <span>
                  <strong>{item.title}</strong>
                  <small>Actualizado {prettyDate(item.updatedAt)}</small>
                </span>
              </div>
              <span>{item.format || "Reel"}</span>
              <time>{prettyDate(item.deadline)}</time>
              <ContentStatus
                item={item}
                allowPublishing={allowPublishing}
                onSaved={showFeedback}
              />
            </article>
          ))}
        </div>
      ) : (
        <div className="content-board">
          {stages.map((stage) => (
            <section key={stage}>
              <header>
                <strong>{stage}</strong>
                <span>
                  {data.content.filter((item) => item.status === stage).length}
                </span>
              </header>
              {data.content
                .filter((item) => item.status === stage)
                .map((item) => (
                  <article key={item.id}>
                    <strong>{item.title}</strong>
                    <small>
                      {item.format || "Reel"} · {prettyDate(item.deadline)}
                    </small>
                    <ContentStatus
                      item={item}
                      allowPublishing={allowPublishing}
                      onSaved={showFeedback}
                    />
                  </article>
                ))}
            </section>
          ))}
        </div>
      )}
      {!allowPublishing ? (
        <p className="service-boundary">
          <Check size={15} />
          Este cliente contrata producción y entrega. Martu OS no te va a
          reclamar publicación ni métricas.
        </p>
      ) : null}
    </div>
  );
}

export function ClientCalendarPanel({ data }: { data: ClientWorkspaceData }) {
  const deadlines = data.summary?.deadlines || [];
  const combined = [
    ...deadlines.map((item) => ({
      id: item.id,
      date: item.date,
      title: item.title,
      detail: item.type || "Deadline",
      kind: "Entrega",
      targetPath:
        item.targetPath ||
        entityHref({
          clientSlug: data.client.slug,
          entityType: item.entityType,
          entityId: item.entityId,
          fallback: `/clients/${data.client.slug}/calendario`,
        }),
    })),
    ...data.meetings.map((item) => ({
      id: item.id,
      date: item.date,
      title: item.title || `Reunión con ${data.client.name}`,
      detail: item.summary,
      kind: "Reunión",
      targetPath: entityHref({
        clientSlug: data.client.slug,
        entityType: "meeting",
        entityId: item.id,
        fallback: `/clients/${data.client.slug}/notas`,
      }),
    })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return (
    <div className="client-calendar-panel">
      <header>
        <div>
          <h2>Lo que viene</h2>
          <p>Reuniones, entregas y decisiones de {data.client.name}.</p>
        </div>
        <button
          className="button button--primary button--small"
          type="button"
          onClick={openAi}
        >
          <Sparkles size={15} />
          Planear con la Supervisora
        </button>
      </header>
      <div className="event-list">
        {combined.map((item) => (
          <Link
            href={item.targetPath}
            prefetch={false}
            key={`${item.kind}-${item.id}`}
          >
            <article>
              <time>
                <b>{prettyDate(item.date, { day: "2-digit" })}</b>
                <span>{prettyDate(item.date, { month: "short" })}</span>
              </time>
              <i />
              <div>
                <span>{item.kind}</span>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
              </div>
              <ChevronRight size={16} aria-hidden="true" />
            </article>
          </Link>
        ))}
      </div>
    </div>
  );
}

const INSIGHT_KIND_COPY: Record<
  InsightKind,
  {
    label: string;
    singular: string;
    description: string;
    Icon: typeof Sparkles;
  }
> = {
  observation: {
    label: "Observaciones",
    singular: "Observación",
    description: "Qué muestran los datos, sin explicar todavía por qué.",
    Icon: BarChart3,
  },
  pattern: {
    label: "Patrones",
    singular: "Patrón",
    description: "Una señal repetida en más de un corte o pieza.",
    Icon: GitBranch,
  },
  hypothesis: {
    label: "Hipótesis",
    singular: "Hipótesis",
    description: "Una explicación posible que todavía necesita validación.",
    Icon: FlaskConical,
  },
  recommendation: {
    label: "Recomendaciones",
    singular: "Recomendación",
    description: "Un próximo paso prudente, conectado con la evidencia.",
    Icon: Lightbulb,
  },
};

const INSIGHT_KINDS = Object.keys(INSIGHT_KIND_COPY) as InsightKind[];

type InsightDraft = {
  id?: string;
  kind: InsightKind;
  statement: string;
  evidenceSummary: string;
  confidence: string;
  target: string;
};

function emptyInsightDraft(): InsightDraft {
  return {
    kind: "observation",
    statement: "",
    evidenceSummary: "",
    confidence: "",
    target: "",
  };
}

function evidenceSummary(evidence: Record<string, unknown>) {
  if (typeof evidence.summary === "string" && evidence.summary.trim()) {
    return evidence.summary.trim();
  }
  const labels: Record<string, string> = {
    views: "views",
    reach: "alcance",
    retention: "retención",
    saves: "guardados",
    shares: "compartidos",
    clicks: "clics",
    inquiries: "consultas",
    conversions: "conversiones",
    spend: "inversión",
    ctr: "CTR",
    cpc: "CPC",
    cpa: "CPA",
    roas: "ROAS",
    sampleSize: "muestra",
    period: "período",
  };
  return Object.entries(evidence)
    .filter(
      ([key, value]) =>
        key !== "surface" &&
        key !== "summary" &&
        ["string", "number", "boolean"].includes(typeof value),
    )
    .slice(0, 5)
    .map(([key, value]) => `${labels[key] ?? key}: ${String(value)}`)
    .join(" · ");
}

function insightTargetValue(insight: InsightItem) {
  if (insight.creativeId) return `creative:${insight.creativeId}`;
  if (insight.campaignId) return `campaign:${insight.campaignId}`;
  if (insight.publicationId) return `publication:${insight.publicationId}`;
  if (insight.contentItemId) return `content:${insight.contentItemId}`;
  return "";
}

function InsightsBoard({
  data,
  surface,
}: {
  data: ClientWorkspaceData;
  surface: InsightSurface;
}) {
  const [items, setItems] = useState(() =>
    data.insights.filter((item) => item.surface === surface),
  );
  const [draft, setDraft] = useState<InsightDraft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    message: string;
    tone: "success" | "error";
  } | null>(null);

  const targetOptions = useMemo(() => {
    if (surface === "ads") {
      return data.campaigns.flatMap((campaign) => [
        {
          value: `campaign:${campaign.id}`,
          label: `Campaña · ${campaign.name}`,
        },
        ...(campaign.creatives ?? []).map((creative) => ({
          value: `creative:${creative.id}`,
          label: `Creativo · ${creative.name}`,
        })),
      ]);
    }
    const unique = new Map<string, { value: string; label: string }>();
    for (const metric of data.metrics) {
      const value = metric.publicationId
        ? `publication:${metric.publicationId}`
        : metric.contentItemId
          ? `content:${metric.contentItemId}`
          : "";
      if (value && !unique.has(value)) {
        unique.set(value, {
          value,
          label: `Contenido · ${metric.contentTitle || "Sin título"}`,
        });
      }
    }
    return [...unique.values()];
  }, [data.campaigns, data.metrics, surface]);

  function openEdit(item: InsightItem) {
    setFeedback(null);
    setDraft({
      id: item.id,
      kind: item.kind,
      statement: item.statement,
      evidenceSummary: evidenceSummary(item.evidence),
      confidence:
        item.confidence == null ? "" : String(Math.round(item.confidence * 100)),
      target: insightTargetValue(item),
    });
  }

  async function saveInsight(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !draft.statement.trim() || busy) return;
    setBusy("form");
    setFeedback(null);
    const current = draft.id
      ? items.find((item) => item.id === draft.id)
      : undefined;
    const references = {
      contentItemId: null as string | null,
      publicationId: null as string | null,
      campaignId: null as string | null,
      creativeId: null as string | null,
    };
    if (draft.target) {
      const [targetType, targetId] = draft.target.split(":");
      if (targetType === "content") references.contentItemId = targetId;
      if (targetType === "publication") references.publicationId = targetId;
      if (targetType === "campaign") references.campaignId = targetId;
      if (targetType === "creative") references.creativeId = targetId;
    }
    const confidence = draft.confidence.trim()
      ? Number(draft.confidence) / 100
      : null;
    try {
      const response = await fetch(
        draft.id ? `/api/insights/${encodeURIComponent(draft.id)}` : "/api/insights",
        {
          method: draft.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(draft.id ? {} : { clientSlug: data.client.slug }),
            kind: draft.kind,
            statement: draft.statement.trim(),
            evidence: {
              ...(current?.evidence ?? {}),
              summary: draft.evidenceSummary.trim() || undefined,
              surface,
            },
            confidence,
            ...references,
          }),
        },
      );
      const payload = (await response.json().catch(() => null)) as {
        insight?: InsightItem;
        message?: string;
      } | null;
      if (!response.ok || !payload?.insight) {
        throw new Error(payload?.message || "No pude guardar el insight.");
      }
      setItems((previous) =>
        draft.id
          ? previous.map((item) =>
              item.id === payload.insight!.id ? payload.insight! : item,
            )
          : [...previous, payload.insight!],
      );
      const message = draft.id ? "Insight actualizado." : "Insight guardado.";
      setFeedback({ message, tone: "success" });
      announceFeedback(message);
      setDraft(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No pude guardar el insight.";
      setFeedback({ message, tone: "error" });
      announceFeedback(message, "error");
    } finally {
      setBusy(null);
    }
  }

  async function archiveInsight(item: InsightItem) {
    if (
      busy ||
      !window.confirm(
        `¿Archivar esta ${INSIGHT_KIND_COPY[item.kind].singular.toLocaleLowerCase("es")}?`,
      )
    ) {
      return;
    }
    setBusy(item.id);
    setFeedback(null);
    try {
      const response = await fetch(
        `/api/insights/${encodeURIComponent(item.id)}`,
        { method: "DELETE" },
      );
      const payload = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      if (!response.ok) {
        throw new Error(payload?.message || "No pude archivar el insight.");
      }
      setItems((previous) => previous.filter((entry) => entry.id !== item.id));
      const message = "Insight archivado.";
      setFeedback({ message, tone: "success" });
      announceFeedback(message);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No pude archivar el insight.";
      setFeedback({ message, tone: "error" });
      announceFeedback(message, "error");
    } finally {
      setBusy(null);
    }
  }

  const boardId = `insights-${surface}`;
  return (
    <section
      className="insights-board"
      aria-labelledby={`${boardId}-title`}
      aria-busy={busy != null}
    >
      <header className="insights-board__header">
        <div>
          <p>Lecturas persistentes</p>
          <h3 id={`${boardId}-title`}>Insights con evidencia</h3>
          <span>
            Separamos hechos, señales, explicaciones posibles y próximos pasos.
          </span>
        </div>
        <button
          className="button button--primary button--small"
          type="button"
          onClick={() => {
            setFeedback(null);
            setDraft(emptyInsightDraft());
          }}
          disabled={busy != null}
        >
          <Plus size={15} aria-hidden="true" />
          Nuevo insight
        </button>
      </header>
      {feedback ? <Feedback message={feedback.message} tone={feedback.tone} /> : null}
      <div className="insights-board__grid">
        {INSIGHT_KINDS.map((kind) => {
          const copy = INSIGHT_KIND_COPY[kind];
          const kindItems = items.filter((item) => item.kind === kind);
          return (
            <section
              className="insights-kind"
              aria-labelledby={`${boardId}-${kind}`}
              key={kind}
            >
              <header>
                <copy.Icon size={16} aria-hidden="true" />
                <div>
                  <h4 id={`${boardId}-${kind}`}>{copy.label}</h4>
                  <p>{copy.description}</p>
                </div>
                <span aria-label={`${kindItems.length} registros`}>
                  {kindItems.length}
                </span>
              </header>
              {kindItems.length ? (
                <div className="insights-kind__list">
                  {kindItems.map((item) => {
                    const evidence = evidenceSummary(item.evidence);
                    return (
                      <article className="insights-card" key={item.id}>
                        <p>{item.statement}</p>
                        <dl>
                          <div>
                            <dt>Evidencia</dt>
                            <dd>{evidence || "Sin evidencia registrada"}</dd>
                          </div>
                          <div>
                            <dt>Confianza de la lectura</dt>
                            <dd>
                              {item.confidence == null
                                ? "No estimada"
                                : `${Math.round(item.confidence * 100)}%`}
                            </dd>
                          </div>
                        </dl>
                        {kind === "hypothesis" ? (
                          <small>
                            Hipótesis a validar. No demuestra causalidad.
                          </small>
                        ) : null}
                        <footer>
                          <span>
                            {item.source === "manual" ? "Manual" : "Derivado"}
                          </span>
                          <div>
                            {item.targetPath ? (
                              <Link href={item.targetPath} prefetch={false}>
                                {item.targetLabel || "Ver evidencia"}
                              </Link>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => openEdit(item)}
                              disabled={busy != null}
                              aria-label={`Editar ${copy.singular.toLocaleLowerCase("es")}`}
                              title="Editar"
                            >
                              <Pencil size={14} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => archiveInsight(item)}
                              disabled={busy != null}
                              aria-label={`Archivar ${copy.singular.toLocaleLowerCase("es")}`}
                              title="Archivar"
                            >
                              <Archive size={14} aria-hidden="true" />
                            </button>
                          </div>
                        </footer>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className="insights-kind__empty">Sin registros todavía.</p>
              )}
            </section>
          );
        })}
      </div>
      {draft ? (
        <div
          className="modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="insight-dialog-title"
        >
          <button
            className="modal__scrim"
            type="button"
            onClick={() => !busy && setDraft(null)}
            aria-label="Cerrar"
          />
          <form
            className="modal__body insights-dialog"
            onSubmit={saveInsight}
          >
            <header>
              <div>
                <p>{data.client.name}</p>
                <h2 id="insight-dialog-title">
                  {draft.id ? "Editar insight" : "Nuevo insight"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setDraft(null)}
                aria-label="Cerrar"
                disabled={busy != null}
              >
                ×
              </button>
            </header>
            <div className="insights-dialog__grid">
              <label>
                <span>Tipo de lectura</span>
                <select
                  value={draft.kind}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      kind: event.target.value as InsightKind,
                    })
                  }
                >
                  {INSIGHT_KINDS.map((kind) => (
                    <option value={kind} key={kind}>
                      {INSIGHT_KIND_COPY[kind].singular}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Confianza de esta lectura (%)</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  inputMode="numeric"
                  value={draft.confidence}
                  onChange={(event) =>
                    setDraft({ ...draft, confidence: event.target.value })
                  }
                  placeholder="Sin estimar"
                />
              </label>
            </div>
            <label>
              <span>Lectura</span>
              <textarea
                autoFocus
                required
                rows={4}
                maxLength={4000}
                value={draft.statement}
                onChange={(event) =>
                  setDraft({ ...draft, statement: event.target.value })
                }
                placeholder="Describí qué muestran los datos y qué queda por validar."
              />
            </label>
            <label>
              <span>Evidencia registrada</span>
              <textarea
                rows={3}
                value={draft.evidenceSummary}
                onChange={(event) =>
                  setDraft({ ...draft, evidenceSummary: event.target.value })
                }
                placeholder="Corte, muestra y métricas que sostienen esta lectura."
              />
            </label>
            <label>
              <span>Vincular con</span>
              <select
                value={draft.target}
                onChange={(event) =>
                  setDraft({ ...draft, target: event.target.value })
                }
              >
                <option value="">Sin vínculo</option>
                {targetOptions.map((option) => (
                  <option value={option.value} key={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {feedback?.tone === "error" ? (
              <Feedback message={feedback.message} tone="error" />
            ) : null}
            <footer>
              <button
                className="button button--secondary"
                type="button"
                onClick={() => setDraft(null)}
                disabled={busy != null}
              >
                Cancelar
              </button>
              <button
                className="button button--primary"
                type="submit"
                disabled={busy != null || !draft.statement.trim()}
              >
                {busy === "form" ? "Guardando…" : "Guardar insight"}
              </button>
            </footer>
          </form>
        </div>
      ) : null}
    </section>
  );
}

function metricValue(value?: number, suffix = "") {
  return typeof value === "number"
    ? `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(value)}${suffix}`
    : "Sin dato";
}

function instagramMetric(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  if (value && typeof value === "object" && "value" in value) return instagramMetric((value as { value?: unknown }).value);
  return undefined;
}

function InstagramConnectionPanel({ data }: { data: ClientWorkspaceData }) {
  const router = useRouter();
  const instagram = data.instagram ?? { configured: false, connected: false, media: [] };
  const [busy, setBusy] = useState<"connect" | "sync" | "disconnect" | `link-${string}` | null>(null);
  const [feedback, setFeedback] = useState<string | null>(instagram.lastError ?? null);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const [links, setLinks] = useState<Record<string, string>>(() => Object.fromEntries(
    instagram.media.map((item) => [item.id, item.contentItemId ?? ""]),
  ));

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("instagram");
    const message = params.get("message");
    const nextFeedback = status === "connected"
      ? "Instagram quedó conectado y sincronizado."
      : status === "cancelled"
        ? "La conexión fue cancelada. No se guardó ninguna cuenta."
        : status === "error"
          ? message || "No pude conectar Instagram."
          : null;
    if (nextFeedback) queueMicrotask(() => setFeedback(nextFeedback));
    if (status) {
      const url = new URL(window.location.href);
      url.searchParams.delete("instagram");
      url.searchParams.delete("message");
      window.history.replaceState(window.history.state, "", url.pathname + url.search);
    }
  }, []);

  async function readResponse(response: Response) {
    const payload = await response.json().catch(() => ({})) as { message?: string };
    if (!response.ok) throw new Error(payload.message || "No pude completar la acción de Instagram.");
    return payload;
  }

  async function connect() {
    setBusy("connect");
    setFeedback(null);
    try {
      const response = await fetch("/api/instagram/oauth/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientSlug: data.client.slug }),
      });
      const payload = await response.json().catch(() => ({})) as { authorizationUrl?: string; message?: string };
      if (!response.ok || !payload.authorizationUrl) throw new Error(payload.message || "No pude iniciar la conexión con Instagram.");
      window.location.assign(payload.authorizationUrl);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "No pude iniciar la conexión con Instagram.");
      setBusy(null);
    }
  }

  async function sync() {
    setBusy("sync");
    setFeedback(null);
    try {
      await readResponse(await fetch("/api/instagram/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientSlug: data.client.slug }),
      }));
      setFeedback("Instagram se actualizó sin duplicar publicaciones.");
      router.refresh();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "No pude actualizar Instagram.");
    } finally { setBusy(null); }
  }

  async function disconnect() {
    setBusy("disconnect");
    setFeedback(null);
    try {
      await readResponse(await fetch(`/api/instagram?client=${encodeURIComponent(data.client.slug)}`, { method: "DELETE" }));
      setFeedback("Instagram quedó desconectado. El historial sincronizado se conservó.");
      setConfirmingDisconnect(false);
      router.refresh();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "No pude desconectar Instagram.");
    } finally { setBusy(null); }
  }

  async function saveLink(mediaId: string) {
    setBusy(`link-${mediaId}`);
    setFeedback(null);
    try {
      await readResponse(await fetch(`/api/instagram/media/${mediaId}/link`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientSlug: data.client.slug, contentItemId: links[mediaId] || null }),
      }));
      setFeedback(links[mediaId] ? "Publicación vinculada al contenido interno." : "Vinculación eliminada.");
      router.refresh();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "No pude guardar la vinculación.");
    } finally { setBusy(null); }
  }

  const totals = instagram.media.reduce((result, item) => {
    for (const key of ["views", "reach", "total_interactions"] as const) {
      const value = instagramMetric(item.insights[key]);
      if (value != null) result[key] += value;
    }
    return result;
  }, { views: 0, reach: 0, total_interactions: 0 });

  return <section className="instagram-connection" aria-busy={busy != null}>
    <header className="instagram-connection__header">
      <div className="instagram-connection__identity">
        {instagram.profilePictureUrl ? <img src={instagram.profilePictureUrl} alt="" loading="lazy" /> : <span><InstagramIcon size={21} aria-hidden="true" /></span>}
        <div><small>Instagram</small><strong>{instagram.username ? `@${instagram.username}` : "No conectado"}</strong></div>
      </div>
      {instagram.connected ? <div className="instagram-connection__status"><i /><span>Conectado</span>{instagram.lastSyncAt ? <small>Actualizado <TimeAgo value={instagram.lastSyncAt} /></small> : <small>Todavía sin sincronizar</small>}</div> : null}
      <div className="instagram-connection__actions">
        {instagram.connected ? <>
          <button className="button button--secondary button--small" type="button" onClick={() => void sync()} disabled={busy != null}><RefreshCw size={15} aria-hidden="true" />{busy === "sync" ? "Sincronizando…" : "Sincronizar ahora"}</button>
          <button className="button button--ghost-danger button--small" type="button" onClick={() => setConfirmingDisconnect(true)} disabled={busy != null}><Unplug size={14} aria-hidden="true" />Desconectar</button>
        </> : <button className="button button--primary button--small" type="button" onClick={() => void connect()} disabled={busy != null || !instagram.configured}><InstagramIcon size={15} aria-hidden="true" />{busy === "connect" ? "Abriendo Instagram…" : "Conectar"}</button>}
      </div>
    </header>
    {!instagram.connected ? <p className="instagram-connection__hint">{instagram.configured ? "Conectá una cuenta Creator o Business para traer publicaciones y métricas reales." : "La integración todavía no tiene credenciales configuradas en el servidor."}</p> : null}
    {instagram.status === "needs_reauth" ? <Feedback tone="error" message="La conexión necesita renovarse. Volvé a conectar la cuenta." /> : <Feedback tone={instagram.lastError ? "error" : undefined} message={feedback} />}
    {confirmingDisconnect ? <div className="instagram-disconnect" role="alert"><p><strong>¿Desconectar Instagram?</strong><span>Se elimina el token, pero las publicaciones y métricas ya sincronizadas quedan guardadas.</span></p><div><button className="button button--secondary button--small" type="button" onClick={() => setConfirmingDisconnect(false)} disabled={busy != null}>Cancelar</button><button className="button button--danger button--small" type="button" onClick={() => void disconnect()} disabled={busy != null}>{busy === "disconnect" ? "Desconectando…" : "Desconectar"}</button></div></div> : null}
    {instagram.connected ? <>
      <div className="instagram-summary" aria-label="Resumen de Instagram">
        <div><span>Piezas sincronizadas</span><strong>{instagram.media.length}</strong></div>
        <div><span>Views disponibles</span><strong>{metricValue(totals.views)}</strong></div>
        <div><span>Alcance acumulado</span><strong>{metricValue(totals.reach)}</strong></div>
        <div><span>Interacciones</span><strong>{metricValue(totals.total_interactions)}</strong></div>
      </div>
      <div className="instagram-media-list">
        <SectionTitle>Publicaciones y reels reales</SectionTitle>
        {instagram.media.length ? instagram.media.map((item) => {
          const image = item.thumbnailUrl || item.mediaUrl;
          const entries = Object.entries(item.insights).filter(([, value]) => instagramMetric(value) != null);
          return <details className="instagram-media" key={item.id}>
            <summary>
              <span className="instagram-media__thumb">{image ? <img src={image} alt="" loading="lazy" /> : <InstagramIcon size={20} aria-hidden="true" />}</span>
              <span className="instagram-media__copy"><small>{item.mediaProductType || item.mediaType} · {prettyDate(item.publishedAt)}</small><strong>{item.caption?.trim() || "Publicación sin caption"}</strong>{item.contentTitle ? <em><Link2 size={12} aria-hidden="true" />{item.contentTitle}</em> : null}</span>
              <span className="instagram-media__quick"><b>{metricValue(instagramMetric(item.insights.views))}</b><small>views</small></span>
              <ChevronDown size={17} aria-hidden="true" />
            </summary>
            <div className="instagram-media__detail">
              <dl>{entries.length ? entries.map(([name, value]) => <div key={name}><dt>{name.replaceAll("_", " ")}</dt><dd>{metricValue(instagramMetric(value))}</dd></div>) : <div><dt>Métricas</dt><dd>No disponibles para esta pieza</dd></div>}</dl>
              <div className="instagram-media__link"><label><span>Contenido interno</span><select value={links[item.id] ?? ""} onChange={(event) => setLinks((current) => ({ ...current, [item.id]: event.target.value }))}><option value="">Sin vincular</option>{data.content.map((content) => <option key={content.id} value={content.id}>{content.title}</option>)}</select></label><button className="button button--secondary button--small" type="button" onClick={() => void saveLink(item.id)} disabled={busy != null}>{busy === `link-${item.id}` ? "Guardando…" : "Guardar vínculo"}</button></div>
              {item.permalink ? <a className="text-link" href={item.permalink} target="_blank" rel="noreferrer">Abrir en Instagram <ExternalLink size={13} aria-hidden="true" /></a> : null}
            </div>
          </details>;
        }) : <EmptyState title="Sin publicaciones disponibles" body="La cuenta está conectada, pero Instagram no devolvió media para sincronizar." />}
      </div>
    </> : null}
  </section>;
}

export function MetricsPanel({ data }: { data: ClientWorkspaceData }) {
  const latest = data.metrics[0];
  const maxViews = Math.max(
    1,
    ...data.metrics.map((item) => item.views || 0),
  );
  return (
    <div className="metrics-panel">
      <InstagramConnectionPanel data={data} />
      <header>
        <div>
          <p>Últimos 30 días</p>
          <h2>Rendimiento orgánico</h2>
          <span>{data.instagram?.connected ? `Datos internos separados de @${data.instagram.username}` : "Datos demo · no conectado a Instagram"}</span>
        </div>
        <button
          className="button button--secondary button--small"
          type="button"
          onClick={openAi}
        >
          <Sparkles size={15} />
          Pedir una hipótesis
        </button>
      </header>
      {!data.instagram?.connected && latest ? (
        <>
          <section className="metric-strip">
            {[
              ["Alcance", metricValue(latest.reach)],
              ["Views", metricValue(latest.views)],
              ["Retención", metricValue(latest.retention, "%")],
              ["Guardados", metricValue(latest.saves)],
              ["Consultas", metricValue(latest.inquiries)],
            ].map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </section>
          <section className="metric-chart">
            <SectionTitle>Views por contenido</SectionTitle>
            <div className="bar-chart">
              {data.metrics.slice(0, 8).map((item) => (
                <div key={item.id}>
                  <Link
                    prefetch={false}
                    href={entityHref({
                      clientSlug: data.client.slug,
                      entityType: "content",
                      entityId: item.contentItemId,
                      fallback: `/clients/${data.client.slug}/metricas`,
                    })}
                    aria-label={`Abrir ${item.contentTitle || "contenido"}`}
                  >
                    <span
                      style={{
                        height: `${Math.max(9, ((item.views || 0) / maxViews) * 100)}%`,
                      }}
                    />
                    <small>
                      {(item.contentTitle || "Contenido").slice(0, 13)}
                    </small>
                  </Link>
                </div>
              ))}
            </div>
          </section>
          <section className="metric-table">
            <SectionTitle>Contenido + resultado</SectionTitle>
            <div className="metric-table__head">
              <span>Contenido</span>
              <span>Views</span>
              <span>Retención</span>
              <span>Guardados</span>
              <span>Compartidos</span>
            </div>
            {data.metrics.map((metric) => (
              <div key={metric.id}>
                <Link
                  prefetch={false}
                  href={entityHref({
                    clientSlug: data.client.slug,
                    entityType: "content",
                    entityId: metric.contentItemId,
                    fallback: `/clients/${data.client.slug}/metricas`,
                  })}
                >
                  <strong>{metric.contentTitle || "Contenido"}</strong>
                  <ChevronRight size={13} aria-hidden="true" />
                </Link>
                <span>{metricValue(metric.views)}</span>
                <span>{metricValue(metric.retention, "%")}</span>
                <span>{metricValue(metric.saves)}</span>
                <span>{metricValue(metric.shares)}</span>
              </div>
            ))}
          </section>
        </>
      ) : !data.instagram?.connected ? (
        <EmptyState
          title="Todavía no hay métricas"
          body="Este servicio está activo, pero falta cargar el primer corte de datos."
        />
      ) : null}
      <InsightsBoard
        data={data}
        surface="metrics"
        key={`${data.client.slug}-metrics`}
      />
    </div>
  );
}

export function AdsPanel({
  data,
  selectedEntityId,
}: {
  data: ClientWorkspaceData;
  selectedEntityId?: string | null;
}) {
  const spend = data.campaigns.reduce(
    (sum, item) => sum + (item.spend || 0),
    0,
  );
  return (
    <div className="ads-panel">
      <header>
        <div>
          <p>Datos demo · Meta no conectado</p>
          <h2>Campañas activas</h2>
          <span>Lectura de performance sin fingir sincronización.</span>
        </div>
        <button
          className="button button--primary button--small"
          type="button"
          onClick={openAi}
        >
          <Sparkles size={15} />
          Pedir recomendaciones
        </button>
      </header>
      {data.campaigns.length ? (
        <>
          <section className="metric-strip">
            {[
              ["Inversión", `$ ${metricValue(spend)}`],
              [
                "CTR promedio",
                metricValue(
                  data.campaigns.reduce(
                    (sum, item) => sum + (item.ctr || 0),
                    0,
                  ) / data.campaigns.length,
                  "%",
                ),
              ],
              [
                "CPC promedio",
                `$ ${metricValue(data.campaigns.reduce((sum, item) => sum + (item.cpc || 0), 0) / data.campaigns.length)}`,
              ],
              [
                "ROAS promedio",
                `${metricValue(data.campaigns.reduce((sum, item) => sum + (item.roas || 0), 0) / data.campaigns.length)}x`,
              ],
            ].map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </section>
          <section className="campaign-table">
            <div className="campaign-table__head">
              <span>Campaña</span>
              <span>Estado</span>
              <span>Gasto</span>
              <span>CTR</span>
              <span>CPA</span>
              <span>ROAS</span>
            </div>
            {data.campaigns.map((campaign) => (
              <article
                className={
                  campaign.id === selectedEntityId ? "is-selected" : undefined
                }
                key={campaign.id}
              >
                <div>
                  <Link
                    href={`/clients/${encodeURIComponent(data.client.slug)}/pauta/${encodeURIComponent(campaign.id)}`}
                    prefetch={false}
                  >
                    <strong>{campaign.name}</strong>
                  </Link>
                  <small>{campaign.observations}</small>
                  {campaign.creatives?.length ? (
                    <div className="campaign-creatives">
                      {campaign.creatives.map((creative) => (
                        <Link
                          id={`creative-${creative.id}`}
                          prefetch={false}
                          href={entityHref({
                            clientSlug: data.client.slug,
                            entityType: creative.contentItemId
                              ? "content"
                              : "creative",
                            entityId: creative.contentItemId || creative.id,
                            fallback: `/clients/${data.client.slug}/pauta`,
                          })}
                          key={creative.id}
                        >
                          <Play size={11} aria-hidden="true" />
                          {creative.name}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
                <span className="campaign-status">
                  <i />
                  {campaign.status}
                </span>
                <span>$ {metricValue(campaign.spend)}</span>
                <span>{metricValue(campaign.ctr, "%")}</span>
                <span>$ {metricValue(campaign.cpa)}</span>
                <b>{metricValue(campaign.roas, "x")}</b>
              </article>
            ))}
          </section>
        </>
      ) : (
        <EmptyState
          title="Todavía no hay campañas"
          body="Pauta está dentro del servicio, pero no hay datos cargados para este período."
        />
      )}
      <InsightsBoard
        data={data}
        surface="ads"
        key={`${data.client.slug}-ads`}
      />
    </div>
  );
}

export function NotesPanel({
  data,
  onAddNote,
}: {
  data: ClientWorkspaceData;
  onAddNote: () => void;
}) {
  const [query, setQuery] = useState("");
  const notes = data.notes.filter((note) =>
    `${note.text} ${(note.tags || []).join(" ")}`
      .toLocaleLowerCase("es")
      .includes(query.toLocaleLowerCase("es")),
  );
  return (
    <div className="notes-panel">
      <div className="collection-toolbar">
        <label className="search-field">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar en notas y reuniones…"
          />
        </label>
        <button
          className="button button--primary button--small"
          type="button"
          onClick={onAddNote}
        >
          <Plus size={15} />
          Añadir nota
        </button>
      </div>
      <div className="notes-layout">
        <section>
          <SectionTitle icon={<NotebookPen size={17} />}>
            Notas privadas
          </SectionTitle>
          <div className="note-list">
            {notes.map((note) => (
              <article key={note.id}>
                <p>{note.text}</p>
                <footer>
                  <time>
                    {prettyDate(note.createdAt, {
                      day: "numeric",
                      month: "long",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                  {(note.tags || []).map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </footer>
              </article>
            ))}
          </div>
        </section>
        <section>
          <SectionTitle icon={<Users size={17} />}>Reuniones</SectionTitle>
          <div className="meeting-list">
            {data.meetings.map((meeting) => (
              <article key={meeting.id}>
                <header>
                  <time>
                    {prettyDate(meeting.date, {
                      day: "numeric",
                      month: "long",
                    })}
                  </time>
                  <span>{meeting.duration || "30 min"}</span>
                </header>
                <strong>
                  {meeting.title || `Reunión con ${data.client.name}`}
                </strong>
                <p>{meeting.summary}</p>
                {meeting.decisions?.length ? (
                  <div>
                    <b>Decidimos</b>
                    <ul>
                      {meeting.decisions.map((decision) => (
                        <li key={decision}>{decision}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export function FilesPanel({ data }: { data: ClientWorkspaceData }) {
  return (
    <div className="files-panel">
      <header>
        <div>
          <h2>Archivos vinculados</h2>
          <p>Links y metadata demo. Google Drive todavía no está conectado.</p>
        </div>
        <Link
          className="button button--secondary button--small"
          href="/integrations"
          prefetch={false}
        >
          <Folder size={15} />
          Ver integración
        </Link>
      </header>
      <div className="file-list">
        {data.files.map((file) =>
          file.url ? (
            <a href={file.url} key={file.id} target="_blank" rel="noreferrer">
              <span>
                <Folder size={20} />
              </span>
              <div>
                <strong>{file.name}</strong>
                <small>
                  {file.type || "Documento"} · actualizado{" "}
                  {prettyDate(file.updatedAt)}
                </small>
              </div>
              <ChevronRight size={18} />
            </a>
          ) : (
            <div className="file-list__static" key={file.id}>
              <span>
                <Folder size={20} />
              </span>
              <div>
                <strong>{file.name}</strong>
                <small>{file.type || "Documento"} · sin link disponible</small>
              </div>
            </div>
          ),
        )}
      </div>
      {!data.files.length ? (
        <EmptyState
          title="Sin archivos"
          body="Los links aparecen acá cuando se cargan en el contexto del cliente."
        />
      ) : null}
    </div>
  );
}

export function ActivityPanel({ data }: { data: ClientWorkspaceData }) {
  return (
    <div className="activity-panel">
      <header>
        <h2>Todo lo que pasó en {data.client.name}</h2>
        <p>
          Una historia única de tareas, decisiones, contenido y conversaciones.
        </p>
      </header>
      <div className="full-activity-timeline">
        {data.activity.map((item, index) => (
          <Link
            prefetch={false}
            href={
              activityHref(item, data.client.slug)
            }
            key={item.id}
          >
            <article>
              <time>
                {prettyDate(item.createdAt, {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
              <i className={index === 0 ? "is-current" : ""} />
              <div>
                <span>{activityLabel(item.kind, item.entityType)}</span>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
              </div>
              <ChevronRight size={16} aria-hidden="true" />
            </article>
          </Link>
        ))}
      </div>
    </div>
  );
}
