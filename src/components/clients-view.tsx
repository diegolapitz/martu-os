"use client";

import { FormEvent, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, CalendarDays, CheckCircle2, ChevronRight, ImagePlus, LoaderCircle, Plus, Search, Users, X } from "lucide-react";
import { ClientMark } from "@/components/brand";
import type { ClientSummary } from "@/components/types";
import { Feedback } from "@/components/ui";
import { prepareClientLogo, saveClientLogo, type PreparedClientLogo } from "@/lib/client-logo-browser";

type Service = { id: string; name: string; icon: string; active: boolean };

function NewClientDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (client: ClientSummary) => void }) {
  const router = useRouter();
  const [services, setServices] = useState<Service[]>([]);
  const [name, setName] = useState("");
  const [logo, setLogo] = useState<PreparedClientLogo | null>(null);
  const [showAccentSuggestion, setShowAccentSuggestion] = useState(false);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const [color, setColor] = useState("#4f7157");
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<ClientSummary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => () => { if (logo) URL.revokeObjectURL(logo.previewUrl); }, [logo]);

  async function chooseLogo(file: File | undefined) {
    if (!file) return;
    setError("");
    try {
      const prepared = await prepareClientLogo(file);
      setLogo((current) => { if (current) URL.revokeObjectURL(current.previewUrl); return prepared; });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No pude preparar la imagen.");
    } finally {
      if (logoInputRef.current) { logoInputRef.current.value = ""; logoInputRef.current.blur(); }
    }
  }

  useEffect(() => {
    let active = true;
    void fetch("/api/services")
      .then(async (response) => {
        const payload = await response.json() as { services?: Service[]; message?: string };
        if (!response.ok) throw new Error(payload.message || "No pude cargar tus servicios.");
        if (active) setServices((payload.services || []).filter((service) => service.active));
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "No pude cargar tus servicios."); });
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || !serviceIds.length || saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: "", logoUrl: null, color, serviceIds }),
      });
      const payload = await response.json() as { client?: { id: string; slug: string; name: string; description?: string; logoUrl?: string | null; color: string }; message?: string };
      if (!response.ok || !payload.client) throw new Error(payload.message || "No pude crear el cliente.");
      const next: ClientSummary = {
        id: payload.client.id,
        slug: payload.client.slug,
        name: payload.client.name,
        description: payload.client.description || "Podés completar la descripción cuando quieras.",
        status: "Activo",
        services: services.filter((service) => serviceIds.includes(service.id)).map((service) => service.name),
        serviceSlugs: [],
        accent: payload.client.color,
        logoUrl: logo ? await saveClientLogo(payload.client.slug, logo.file) : payload.client.logoUrl,
        attention: "Recién creado",
      };
      setCreated(next);
      onCreated(next);
      window.dispatchEvent(new CustomEvent("martu:client-identity", { detail: { slug: next.slug, name: next.name, accent: next.accent, logoUrl: next.logoUrl } }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No pude crear el cliente.");
    } finally { setSaving(false); }
  }

  return <div className="modal" role="dialog" aria-modal="true" aria-labelledby="new-client-title">
    <button className="modal__scrim" type="button" onClick={onClose} aria-label="Cerrar" />
    {created ? <section className="modal__body new-client-dialog new-client-success">
      <header><div><p>Cliente creado</p><h2 id="new-client-title">{created.name} ya tiene su espacio.</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Cerrar"><X size={19} /></button></header>
      <CheckCircle2 size={38} />
      <p>No hace falta completar todo ahora. Podés entrar y seguir, o avanzar con el brief.</p>
      <footer><button className="button button--secondary" type="button" onClick={() => router.push(`/clients/${created.slug}`)}>Seguir después</button><button className="button button--primary" type="button" onClick={() => router.push(`/clients/${created.slug}?setup=brief`)}>Completar brief ahora</button></footer>
    </section> : <form className="modal__body new-client-dialog" onSubmit={submit} aria-busy={saving}>
      <header><div><p>Alta rápida</p><h2 id="new-client-title">Nuevo cliente</h2><span>Con nombre y servicios alcanza para arrancar.</span></div><button className="icon-button" type="button" onClick={onClose} aria-label="Cerrar"><X size={19} /></button></header>
      <div className="new-client-preview"><ClientMark name={name || "Cliente"} accent={color} large /><span><strong>{name || "Tu cliente"}</strong><small>Todo esto se puede editar después.</small></span></div>
      <div className="new-client-grid"><label className="field"><span>Nombre</span><input autoFocus required value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej. Gavilán" /></label><div className="client-color-field"><span>Color</span><input type="color" value={color} onFocus={() => setShowAccentSuggestion(true)} onClick={() => setShowAccentSuggestion(true)} onChange={(event) => setColor(event.target.value)} />{showAccentSuggestion && logo?.suggestedAccent && logo.suggestedAccent !== color ? <button className="client-color-field__suggestion" type="button" onClick={() => setColor(logo.suggestedAccent!)}><i style={{ backgroundColor: logo.suggestedAccent }} />Sugerido: {logo.suggestedAccent.toUpperCase()}</button> : null}</div><div className="client-logo-upload field--wide"><span>Logo o foto opcional</span><div className="client-logo-upload__row"><ClientMark name={name || "Cliente"} accent={color} logoUrl={logo?.previewUrl} large /><div className="client-logo-upload__details"><strong>{logo ? "Imagen lista" : "Sin imagen"}</strong><small>JPG, PNG o WebP</small><button className="client-logo-upload__choose" type="button" onClick={() => logoInputRef.current?.click()}><ImagePlus size={14} aria-hidden="true" />{logo ? "Cambiar imagen" : "Elegir imagen"}</button><input className="client-logo-upload__input" ref={logoInputRef} type="file" accept="image/jpeg,image/png,image/webp" tabIndex={-1} onChange={(event) => void chooseLogo(event.target.files?.[0])} /></div>{logo ? <button className="client-logo-upload__remove" type="button" onClick={() => setLogo((current) => { if (current) URL.revokeObjectURL(current.previewUrl); return null; })}>Quitar</button> : null}</div></div></div>
      <fieldset className="new-client-services"><legend>Servicios contratados</legend>{services.map((service) => <label key={service.id}><input type="checkbox" checked={serviceIds.includes(service.id)} onChange={(event) => setServiceIds((current) => event.target.checked ? [...new Set([...current, service.id])] : current.filter((id) => id !== service.id))} /><span>{service.name}</span></label>)}</fieldset>
      <Feedback message={error} tone="error" />
      <footer><button className="button button--secondary" type="button" onClick={onClose}>Cancelar</button><button className="button button--primary" type="submit" disabled={saving || !name.trim() || !serviceIds.length}>{saving ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />}Crear cliente</button></footer>
    </form>}
  </div>;
}

export function ClientsView({ clients }: { clients: ClientSummary[] }) {
  const [rows, setRows] = useState(clients);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const filtered = useMemo(() => {
    const normalized = deferredQuery.trim().toLocaleLowerCase("es");
    if (!normalized) return rows;
    return rows.filter((client) => `${client.name} ${client.description} ${client.services.join(" ")}`.toLocaleLowerCase("es").includes(normalized));
  }, [deferredQuery, rows]);

  return (
    <div className="standard-page clients-page">
      <header className="standard-heading">
        <div><p>Tu cartera activa</p><h1>Clientes</h1><span>Todo lo que sabés, decidiste y prometiste para cada cuenta.</span></div>
        <button className="button button--primary" type="button" onClick={() => setDialogOpen(true)}><Users size={17} />Nuevo cliente</button>
      </header>

      <div className="list-toolbar">
        <label className="search-field"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar clientes o servicios…" /></label>
        <span>{filtered.length} clientes</span>
      </div>

      <section className="client-directory" aria-label="Directorio de clientes">
        <div className="directory-head"><span>Cliente</span><span>Servicios</span><span>Próximo</span><span>Estado</span><span /></div>
        {filtered.map((client) => (
          <Link className="client-directory__row" href={`/clients/${client.slug}`} prefetch={false} key={client.id}>
            <div className="client-directory__identity"><ClientMark name={client.name} /><div><strong>{client.name}</strong><span>{client.description}</span></div></div>
            <div className="service-stack">{client.services.slice(0, 3).map((service) => <span key={service}>{service}</span>)}{client.services.length > 3 ? <small>+{client.services.length - 3}</small> : null}</div>
            <div className="deadline-cell"><CalendarDays size={15} /><span>{client.nextDeadline || "Sin urgencias"}</span></div>
            <div className="status-cell"><i />{client.attention || client.status}</div>
            <ChevronRight size={19} />
          </Link>
        ))}
        {filtered.length === 0 ? <div className="directory-empty"><Search size={23} /><strong>No encontré ese cliente</strong><p>Probá buscar por un servicio, por ejemplo “pauta”.</p></div> : null}
      </section>

      <footer className="portfolio-note"><ArrowUpRight size={17} /><span>La vista de cada cliente cambia según los servicios que realmente contrató.</span></footer>
      {dialogOpen ? <NewClientDialog onClose={() => setDialogOpen(false)} onCreated={(client) => setRows((current) => [client, ...current])} /> : null}
    </div>
  );
}
