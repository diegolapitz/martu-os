"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock3,
  ImagePlus,
  MessageSquareText,
  Pencil,
  Sparkles,
  X,
} from "lucide-react";
import { ClientMark } from "@/components/brand";
import {
  ActivityPanel,
  AdsPanel,
  ClientCalendarPanel,
  FilesPanel,
  MetricsPanel,
  NotesPanel,
  SummaryPanel,
} from "@/components/client-panels";
import {
  ContentWorkspace,
  IdeasWorkspace,
  ScriptsWorkspace,
  StrategyEditor,
} from "@/components/client-v1-panels";
import { announceFeedback, Feedback, TimeAgo } from "@/components/ui";
import type { ClientWorkspaceData, WorkspaceTab } from "@/components/types";
import { getClientLogoSuggestedAccent, prepareClientLogo, removeClientLogo, saveClientLogo, type PreparedClientLogo } from "@/lib/client-logo-browser";

const aliases: Record<string, string> = {
  summary: "resumen",
  resumen: "resumen",
  strategy: "estrategia",
  estrategia: "estrategia",
  ideas: "ideas",
  scripts: "guiones",
  guiones: "guiones",
  content: "contenido",
  contenido: "contenido",
  calendar: "calendario",
  calendario: "calendario",
  metrics: "metricas",
  metricas: "metricas",
  métricas: "metricas",
  ads: "pauta",
  pauta: "pauta",
  meetings: "notas",
  notes: "notas",
  notas: "notas",
  "reuniones-notas": "notas",
  "reuniones-y-notas": "notas",
  files: "archivos",
  archivos: "archivos",
  activity: "actividad",
  actividad: "actividad",
};

const labels: Record<string, string> = {
  resumen: "Resumen",
  estrategia: "Estrategia",
  ideas: "Ideas",
  guiones: "Guiones",
  contenido: "Contenido",
  calendario: "Calendario",
  metricas: "Métricas",
  pauta: "Pauta",
  notas: "Reuniones y notas",
  archivos: "Archivos",
  actividad: "Actividad",
};

const serviceOptions = [
  ["strategy", "Estrategia"],
  ["community-management", "Community Management"],
  ["content-creation", "Creación de contenido"],
  ["ideas-planning", "Ideas y planificación"],
  ["scripts", "Guiones"],
  ["recording", "Grabación"],
  ["editing", "Edición"],
  ["publishing", "Publicación"],
  ["stories", "Historias"],
  ["metrics-reporting", "Métricas y reporting"],
  ["meta-ads", "Meta Ads"],
  ["meetings-account-management", "Reuniones y cuenta"],
] as const;

type ClientSetup = {
  completeness: number;
  sections: Array<{ id: string; label: string; items: Array<{ id: string; label: string; complete: boolean; optional: boolean }> }>;
  brief?: { businessDescription?: string; objectives?: string[]; audience?: string; tone?: string; avoidances?: string[] } | null;
  nonBlocking: true;
};

function ClientSetupOverview({ slug, name }: { slug: string; name: string }) {
  const router = useRouter();
  const [setup, setSetup] = useState<ClientSetup | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);
  const [brief, setBrief] = useState({ businessDescription: "", objective: "", audience: "", tone: "", avoidances: "" });
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch(`/api/clients/${encodeURIComponent(slug)}/setup`)
      .then(async (response) => {
        const payload = await response.json() as { setup?: ClientSetup };
        if (!response.ok || !payload.setup) return;
        if (!active) return;
        setSetup(payload.setup);
        setBrief({
          businessDescription: payload.setup.brief?.businessDescription || "",
          objective: payload.setup.brief?.objectives?.join(", ") || "",
          audience: payload.setup.brief?.audience || "",
          tone: payload.setup.brief?.tone || "",
          avoidances: payload.setup.brief?.avoidances?.join(", ") || "",
        });
        const params = new URLSearchParams(window.location.search);
        if (params.get("setup") === "brief") {
          setExpanded(true);
          setBriefOpen(true);
        }
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [slug]);

  async function saveBrief() {
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(slug)}/setup`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief: {
          businessDescription: brief.businessDescription.trim(),
          objectives: brief.objective.split(",").map((item) => item.trim()).filter(Boolean),
          audience: brief.audience.trim(),
          tone: brief.tone.trim(),
          avoidances: brief.avoidances.split(",").map((item) => item.trim()).filter(Boolean),
          source: "questions",
          confirmed: true,
        } }),
      });
      const payload = await response.json() as { setup?: ClientSetup; message?: string };
      if (!response.ok || !payload.setup) throw new Error(payload.message || "No pude guardar el brief.");
      setSetup(payload.setup);
      setBriefOpen(false);
      setFeedback("Brief guardado. Podés seguir completándolo cuando haga falta.");
      const url = new URL(window.location.href);
      url.searchParams.delete("setup");
      window.history.replaceState(window.history.state, "", url.pathname + url.search);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "No pude guardar el brief.");
    } finally { setSaving(false); }
  }

  if (!setup) return null;
  return <section className={expanded ? "client-setup is-expanded" : "client-setup"}>
    <button className="client-setup__summary" type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
      <span><CheckCircle2 size={17} /><strong>Configuración del cliente</strong><small>No bloquea el trabajo de hoy</small></span>
      <i><b style={{ width: `${setup.completeness}%` }} /></i>
      <b>{setup.completeness}% preparado</b>
      <ChevronDown size={17} />
    </button>
    {expanded ? <div className="client-setup__body">
      {setup.sections.map((section) => <section key={section.id}><strong>{section.label}</strong>{section.items.map((item) => <span key={item.id}>{item.complete ? <Check size={15} /> : <Circle size={15} />}<b>{item.label}</b>{!item.complete && item.optional ? <small>completar después</small> : null}</span>)}</section>)}
      <div className="client-setup__actions"><button className="button button--secondary button--small" type="button" onClick={() => setBriefOpen(true)}>Completar brief</button><button className="button button--secondary button--small" type="button" onClick={() => router.push(`/clients/${slug}/estrategia`)}>Ver estrategia</button></div>
    </div> : null}
    <Feedback message={feedback} />
    {briefOpen ? <div className="modal" role="dialog" aria-modal="true" aria-labelledby="setup-brief-title"><button className="modal__scrim" type="button" onClick={() => setBriefOpen(false)} aria-label="Cerrar" /><section className="modal__body client-setup-dialog"><header><div><p>Brief de {name}</p><h2 id="setup-brief-title">Completá lo que tengas a mano</h2></div><button className="icon-button" type="button" onClick={() => setBriefOpen(false)} aria-label="Cerrar"><X size={19} /></button></header><label className="field"><span>Qué hace</span><textarea rows={5} value={brief.businessDescription} onChange={(event) => setBrief((current) => ({ ...current, businessDescription: event.target.value }))} /></label><div className="client-setup-dialog__grid"><label className="field"><span>Objetivo</span><input value={brief.objective} onChange={(event) => setBrief((current) => ({ ...current, objective: event.target.value }))} placeholder="Separá varios objetivos con comas" /></label><label className="field"><span>Público</span><input value={brief.audience} onChange={(event) => setBrief((current) => ({ ...current, audience: event.target.value }))} /></label><label className="field"><span>Tono</span><input value={brief.tone} onChange={(event) => setBrief((current) => ({ ...current, tone: event.target.value }))} /></label></div><label className="field"><span>Qué evita o no quiere</span><input value={brief.avoidances} onChange={(event) => setBrief((current) => ({ ...current, avoidances: event.target.value }))} placeholder="Separá varios puntos con comas" /></label><p>No hace falta dejarlo perfecto. Esto se puede editar después.</p><footer><button className="button button--secondary" type="button" onClick={() => setBriefOpen(false)}>Cancelar</button><button className="button button--primary" type="button" onClick={() => void saveBrief()} disabled={saving}>{saving ? "Guardando…" : "Guardar brief"}</button></footer></section></div> : null}
  </section>;
}

function useModalA11y(onClose: () => void) {
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
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
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
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus();
    };
  }, [onClose]);
  return dialogRef;
}

function normalizeTab(tab: WorkspaceTab | string) {
  const id = typeof tab === "string" ? tab : tab.id;
  const label = typeof tab === "string" ? tab : tab.label;
  const cleanId = id
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/[ _/]+/g, "-");
  const cleanLabel = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/[ _/]+/g, "-");
  const key = aliases[cleanId] || aliases[cleanLabel] || cleanId;
  return { key, label: labels[key] || label };
}

function NoteDialog({
  data,
  onClose,
  onSaved,
}: {
  data: ClientWorkspaceData;
  onClose: () => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const dialogRef = useModalA11y(onClose);
  const [text, setText] = useState("");
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientSlug: data.client.slug,
          text,
          tags: tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
        }),
      });
      if (!response.ok) throw new Error("No pude guardar la nota.");
      announceFeedback("Nota guardada con fecha y hora.");
      onSaved();
      onClose();
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No pude guardar la nota.";
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
      aria-labelledby="note-dialog-title"
    >
      <button
        className="modal__scrim"
        type="button"
        onClick={onClose}
        aria-label="Cerrar"
        tabIndex={-1}
      />
      <form
        className="modal__body"
        onSubmit={submit}
        ref={dialogRef}
        aria-busy={saving}
      >
        <header>
          <div>
            <p>Nota privada · {data.client.name}</p>
            <h2 id="note-dialog-title">Anotá lo que no querés perder</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </header>
        <label>
          <span>Nota</span>
          <textarea
            autoFocus
            required
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={7}
            placeholder="Ej. Volvió a pedir videos institucionales. Plantear en la próxima reunión que los últimos rindieron peor…"
            data-testid="note-input"
          />
        </label>
        <label>
          <span>Tags opcionales</span>
          <input
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="reunión, decisión, recordar"
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
            disabled={saving || !text.trim()}
            data-testid="save-note"
          >
            {saving ? "Guardando…" : "Guardar nota"}
          </button>
        </footer>
      </form>
    </div>
  );
}

function ClientDialog({
  data,
  onClose,
  onSaved,
}: {
  data: ClientWorkspaceData;
  onClose: () => void;
  onSaved: (client: ClientWorkspaceData["client"]) => void;
}) {
  const router = useRouter();
  const dialogRef = useModalA11y(onClose);
  const [name, setName] = useState(data.client.name);
  const [description, setDescription] = useState(data.client.description);
  const [status, setStatus] = useState(data.client.status || "Activo");
  const [logo, setLogo] = useState<PreparedClientLogo | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [showAccentSuggestion, setShowAccentSuggestion] = useState(false);
  const [suggestedAccent, setSuggestedAccent] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const [accent, setAccent] = useState(data.client.accent || "#155eef");
  const [serviceSlugs, setServiceSlugs] = useState<string[]>(
    data.client.serviceSlugs || [],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => () => { if (logo) URL.revokeObjectURL(logo.previewUrl); }, [logo]);

  useEffect(() => {
    let active = true;
    if (!data.client.logoUrl) return;
    void getClientLogoSuggestedAccent(data.client.logoUrl)
      .then((value) => { if (active) setSuggestedAccent(value); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [data.client.logoUrl]);

  async function chooseLogo(file: File | undefined) {
    if (!file) return;
    setError("");
    try {
      const prepared = await prepareClientLogo(file);
      setLogo((current) => { if (current) URL.revokeObjectURL(current.previewUrl); return prepared; });
      setSuggestedAccent(prepared.suggestedAccent);
      setRemoveLogo(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No pude preparar la imagen.");
    } finally {
      if (logoInputRef.current) { logoInputRef.current.value = ""; logoInputRef.current.blur(); }
    }
  }

  function clearLogo() {
    setLogo((current) => { if (current) URL.revokeObjectURL(current.previewUrl); return null; });
    setRemoveLogo(Boolean(data.client.logoUrl));
    setSuggestedAccent(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/clients/${data.client.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          status,
          accent,
          serviceSlugs,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        client?: ClientWorkspaceData["client"];
        message?: string;
      };
      if (!response.ok)
        throw new Error(payload.message || "No pude actualizar el cliente.");
      const serviceLabels = serviceOptions
        .filter(([slug]) => serviceSlugs.includes(slug))
        .map(([, label]) => label);
      let nextLogoUrl = data.client.logoUrl || null;
      if (logo) nextLogoUrl = await saveClientLogo(data.client.slug, logo.file);
      else if (removeLogo) {
        await removeClientLogo(data.client.slug);
        nextLogoUrl = null;
      }
      onSaved({
        ...data.client,
        ...(payload.client || {}),
        name,
        description,
        status,
        logoUrl: nextLogoUrl,
        accent,
        serviceSlugs,
        services: serviceLabels,
      });
      window.dispatchEvent(new CustomEvent("martu:client-identity", { detail: { slug: data.client.slug, name, accent, logoUrl: nextLogoUrl } }));
      announceFeedback("Cliente actualizado.");
      onClose();
      router.refresh();
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : "No pude actualizar el cliente.";
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
      aria-labelledby="client-dialog-title"
    >
      <button
        className="modal__scrim"
        type="button"
        onClick={onClose}
        aria-label="Cerrar"
        tabIndex={-1}
      />
      <form
        className="modal__body client-edit-dialog"
        onSubmit={submit}
        ref={dialogRef}
        aria-busy={saving}
      >
        <header>
          <div>
            <p>Ficha del cliente</p>
            <h2 id="client-dialog-title">Editar identidad</h2>
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
        <label>
          <span>Nombre</span>
          <input
            autoFocus
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          <span>Descripción breve</span>
          <textarea
            rows={4}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <div className="client-edit-dialog__identity">
          <div className="client-logo-upload">
            <span>Logo o foto</span>
            <div className="client-logo-upload__row">
              <ClientMark name={name || data.client.name} accent={accent} logoUrl={logo?.previewUrl ?? (removeLogo ? null : data.client.logoUrl)} large />
              <div className="client-logo-upload__details"><strong>{logo || (!removeLogo && data.client.logoUrl) ? "Imagen del cliente" : "Sin imagen"}</strong><small>JPG, PNG o WebP</small><button className="client-logo-upload__choose" type="button" onClick={() => logoInputRef.current?.click()}><ImagePlus size={14} aria-hidden="true" />{logo || (!removeLogo && data.client.logoUrl) ? "Cambiar imagen" : "Elegir imagen"}</button><input className="client-logo-upload__input" ref={logoInputRef} type="file" accept="image/jpeg,image/png,image/webp" tabIndex={-1} onChange={(event) => void chooseLogo(event.target.files?.[0])} /></div>
              {logo || (!removeLogo && data.client.logoUrl) ? <button className="client-logo-upload__remove" type="button" onClick={clearLogo}>Quitar</button> : null}
            </div>
          </div>
          <div className="client-color-field">
            <span>Color del cliente</span>
            <input
              type="color"
              value={accent}
              onFocus={() => setShowAccentSuggestion(true)}
              onClick={() => setShowAccentSuggestion(true)}
              onChange={(event) => setAccent(event.target.value)}
            />
            {showAccentSuggestion && suggestedAccent && suggestedAccent !== accent ? <button className="client-color-field__suggestion" type="button" onClick={() => setAccent(suggestedAccent)}><i style={{ backgroundColor: suggestedAccent }} />Sugerido: {suggestedAccent.toUpperCase()}</button> : null}
          </div>
          <label>
            <span>Estado</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option>Activo</option>
              <option>Pausado</option>
              <option>Archivado</option>
            </select>
          </label>
        </div>
        <fieldset className="client-service-options">
          <legend>Servicios contratados</legend>
          {serviceOptions.map(([slug, label]) => (
            <label key={slug}>
              <input
                type="checkbox"
                checked={serviceSlugs.includes(slug)}
                onChange={(event) =>
                  setServiceSlugs((current) =>
                    event.target.checked
                      ? [...new Set([...current, slug])]
                      : current.filter((item) => item !== slug),
                  )
                }
              />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>
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
            disabled={saving}
          >
            {saving ? "Guardando" : "Guardar cambios"}
          </button>
        </footer>
      </form>
    </div>
  );
}

export function ClientWorkspace({
  data,
  requestedTab,
  requestedEntityId,
}: {
  data: ClientWorkspaceData;
  requestedTab?: string;
  requestedEntityId?: string | null;
}) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [clientOpen, setClientOpen] = useState(false);
  const [client, setClient] = useState(data.client);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [intentPrefetchTab, setIntentPrefetchTab] = useState<string | null>(
    null,
  );
  const tabs = useMemo(() => {
    const normalized = data.tabs.map(normalizeTab);
    const seen = new Set<string>();
    return normalized.filter((tab) => !seen.has(tab.key) && seen.add(tab.key));
  }, [data.tabs]);
  const requested =
    aliases[
      (requestedTab || "resumen")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("es")
    ] ||
    requestedTab ||
    "resumen";
  const active = tabs.some((tab) => tab.key === requested)
    ? requested
    : "resumen";

  useEffect(() => {
    const entityType =
      active === "guiones"
        ? "script"
        : active === "contenido"
          ? "content"
          : active === "ideas"
            ? "idea"
            : active;
    window.dispatchEvent(
      new CustomEvent("martu:context", {
        detail: {
          clientSlug: client.slug,
          clientName: client.name,
          section: active,
          entityType,
          entityId: requestedEntityId || null,
        },
      }),
    );
  }, [active, client.name, client.slug, requestedEntityId]);

  let panel;
  switch (active) {
    case "estrategia":
      panel = (
        <StrategyEditor
          key={`strategy-${data.strategy?.version || 0}`}
          data={{ ...data, client }}
        />
      );
      break;
    case "ideas":
      panel = (
        <IdeasWorkspace
          key={`ideas-${requestedEntityId || "first"}-${data.ideas.map((item) => item.updatedAt || item.createdAt).join("|")}`}
          data={{ ...data, client }}
          selectedEntityId={requestedEntityId}
        />
      );
      break;
    case "guiones":
      panel = (
        <ScriptsWorkspace
          key={`scripts-${requestedEntityId || "first"}-${data.scripts.map((item) => `${item.id}:${item.version || item.updatedAt}`).join("|")}`}
          data={{ ...data, client }}
          selectedEntityId={requestedEntityId}
        />
      );
      break;
    case "contenido":
      panel = (
        <ContentWorkspace
          key={`content-${requestedEntityId || "first"}-${data.content.map((item) => `${item.id}:${item.updatedAt || item.status}`).join("|")}`}
          data={{ ...data, client }}
          selectedEntityId={requestedEntityId}
        />
      );
      break;
    case "calendario":
      panel = <ClientCalendarPanel data={data} />;
      break;
    case "metricas":
      panel = <MetricsPanel data={data} />;
      break;
    case "pauta":
      panel = <AdsPanel data={data} selectedEntityId={requestedEntityId} />;
      break;
    case "notas":
      panel = <NotesPanel data={data} onAddNote={() => setNoteOpen(true)} />;
      break;
    case "archivos":
      panel = <FilesPanel data={data} />;
      break;
    case "actividad":
      panel = <ActivityPanel data={data} />;
      break;
    default:
      panel = <SummaryPanel data={data} />;
  }

  return (
    <div
      className={`client-workspace client-workspace--${active}`}
      style={{ "--client-accent": client.accent || "#64748b" } as CSSProperties}
    >
      <header className="client-header">
        <div className="client-header__identity">
          <ClientMark
            name={client.name}
            large
            logoUrl={client.logoUrl}
            accent={client.accent}
          />
          <div>
            <div className="client-header__title">
              <h1>{client.name}</h1>
              <button
                className="icon-button"
                type="button"
                onClick={() => setClientOpen(true)}
                aria-label="Editar cliente"
              >
                <Pencil size={16} />
              </button>
            </div>
            <p>{client.description}</p>
            <span>
              <i />
              {client.status || "Activo"}
            </span>
          </div>
        </div>
        <div className="client-header__meta">
          <span>Servicios</span>
          <p>
            {client.services.slice(0, 4).join(" · ") || "Sin servicios activos"}
          </p>
        </div>
        <div className="client-header__meta">
          <span>Próximo deadline</span>
          <p className="urgent-text">
            <CalendarDays size={15} />
            {client.nextDeadline || "Sin urgencias"}
          </p>
        </div>
        <div className="client-header__meta">
          <span>Última actividad</span>
          <p>
            <Clock3 size={15} />
            <TimeAgo value={data.activity[0]?.createdAt || client.updatedAt} />
          </p>
        </div>
        <div className="client-header__actions">
          <button
            className="button button--secondary button--small"
            type="button"
            onClick={() => setNoteOpen(true)}
            data-testid="add-note"
          >
            <MessageSquareText size={15} />
            Añadir nota
          </button>
          <button
            className="button button--primary button--small"
            type="button"
            onClick={() => window.dispatchEvent(new Event("martu:open-ai"))}
            data-testid="ai-open"
          >
            <Sparkles size={15} />
            Conversar
          </button>
        </div>
      </header>

      <nav
        className="client-tabs"
        aria-label={`Secciones de ${client.name}`}
        data-testid="client-tabs"
      >
        {tabs.map((tab) => (
          <Link
            className={tab.key === active ? "is-active" : ""}
            aria-current={tab.key === active ? "page" : undefined}
            href={
              tab.key === "resumen"
                ? `/clients/${client.slug}`
                : `/clients/${client.slug}/${tab.key}`
            }
            prefetch={intentPrefetchTab === tab.key ? null : false}
            onMouseEnter={() => setIntentPrefetchTab(tab.key)}
            onFocus={() => setIntentPrefetchTab(tab.key)}
            key={tab.key}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      <Feedback message={feedback} />
      {active === "resumen" ? <ClientSetupOverview slug={client.slug} name={client.name} /> : null}
      <div className="client-panel">{panel}</div>
      {noteOpen ? (
        <NoteDialog
          data={data}
          onClose={() => setNoteOpen(false)}
          onSaved={() => {
            setFeedback("Nota guardada con fecha y hora.");
            window.setTimeout(() => setFeedback(null), 3500);
          }}
        />
      ) : null}
      {clientOpen ? (
        <ClientDialog
          data={{ ...data, client }}
          onClose={() => setClientOpen(false)}
          onSaved={setClient}
        />
      ) : null}
    </div>
  );
}
