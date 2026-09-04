"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  Clock3,
  Cloud,
  Instagram,
  Link2,
  LogOut,
  Megaphone,
  MessageCircle,
  Plus,
  RotateCcw,
  Save,
  Settings,
  Video,
} from "lucide-react";
import { Feedback, SectionTitle } from "@/components/ui";
import { registerActivePushServiceWorker } from "@/lib/web-push";

const integrations = [
  { name: "Instagram", icon: Instagram, description: "Métricas de contenido, publicaciones y señales de rendimiento.", enables: "Contenido + Métricas" },
  { name: "Meta Ads", icon: Megaphone, description: "Campañas, anuncios, gasto y performance sin entrar al administrador.", enables: "Pauta" },
  { name: "Google Drive", icon: Cloud, description: "Archivos de trabajo y entregables vinculados a cada cliente.", enables: "Archivos" },
  { name: "Google Calendar", icon: CalendarDays, description: "Reuniones, grabaciones y deadlines sincronizados.", enables: "Calendario" },
  { name: "Google Meet", icon: Video, description: "Reuniones con resumen, decisiones y compromisos.", enables: "Reuniones" },
  { name: "WhatsApp", icon: MessageCircle, description: "Mensajes proactivos y respuestas que actualicen el mismo contexto.", enables: "Supervisora" },
];

export function IntegrationsView() {
  return (
    <div className="standard-page integrations-page">
      <header className="standard-heading"><div><p>Conexiones externas</p><h1>Integraciones</h1><span>La casa ya está armada. Estos son los puentes que se pueden conectar después.</span></div></header>
      <div className="integration-notice"><Link2 size={20} /><div><strong>Nada está conectado todavía.</strong><p>Todo lo que ves hoy son datos demo coherentes. Nunca vamos a fingir que una cuenta externa está sincronizada.</p></div></div>
      <section className="integration-list">
        {integrations.map(({ name, icon: Icon, description, enables }) => (
          <article className="integration-row" key={name}>
            <span className="integration-row__icon"><Icon size={22} /></span>
            <div><strong>{name}</strong><p>{description}</p></div>
            <span className="integration-enables">Habilitaría <b>{enables}</b></span>
            <button type="button" disabled>Próximamente <small>no conectado</small></button>
          </article>
        ))}
      </section>
    </div>
  );
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

function subscribeToPushSupport() {
  return () => undefined;
}

function getPushSupportSnapshot() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && typeof Notification !== "undefined";
}

function PushSettings() {
  const pushSupported = useSyncExternalStore(subscribeToPushSupport, getPushSupportSnapshot, () => false);
  const [permissionOverride, setPermissionOverride] = useState<NotificationPermission | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const status: NotificationPermission | "unsupported" = pushSupported ? permissionOverride ?? Notification.permission : "unsupported";

  async function enablePush() {
    setBusy(true);
    setFeedback(null);
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || typeof Notification === "undefined") throw new Error("Este navegador no admite Web Push.");
      const permission = await Notification.requestPermission();
      setPermissionOverride(permission);
      if (permission !== "granted") throw new Error("Las notificaciones quedaron bloqueadas en el navegador.");
      const registration = await registerActivePushServiceWorker(navigator.serviceWorker);
      let key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
      if (!key) {
        const keyResponse = await fetch("/api/push/public-key");
        if (keyResponse.ok) {
          const payload = await keyResponse.json();
          key = payload.publicKey || payload.key || "";
        }
      }
      if (!key) throw new Error("Falta configurar la clave pública VAPID.");
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
      const response = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription) });
      if (!response.ok) throw new Error("No pude guardar la suscripción push.");
      setFeedback("Listo. Martu OS puede avisarte aunque la web esté cerrada.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "No pude activar las notificaciones.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-section">
      <SectionTitle icon={<Bell size={18} />}>Avisos fuera de la app</SectionTitle>
      <div className="push-row">
        <div><strong>Web Push</strong><p>Notificaciones persistentes del navegador para deadlines y compromisos.</p><span>Estado: {status === "granted" ? "permitido" : status === "denied" ? "bloqueado" : status === "unsupported" ? "no disponible" : "sin configurar"}</span></div>
        <button className="button button--primary" type="button" onClick={enablePush} disabled={busy || status === "unsupported"}>{busy ? "Activando…" : status === "granted" ? "Reconfigurar" : "Activar avisos"}</button>
      </div>
      <Feedback message={feedback} tone={feedback?.startsWith("Listo") ? "success" : "error"} />
    </section>
  );
}

type FreelancerService = {
  id: string;
  name: string;
  icon: string;
  sortOrder: number;
  active: boolean;
};

const serviceIconOptions = [
  ["briefcase-business", "General"],
  ["target", "Estrategia"],
  ["users", "Comunidad"],
  ["lightbulb", "Ideas"],
  ["file-text", "Documento"],
  ["video", "Video"],
  ["scissors", "Edición"],
  ["send", "Publicación"],
  ["bar-chart-3", "Métricas"],
  ["megaphone", "Pauta"],
  ["calendar-days", "Calendario"],
] as const;

function ServicesSettings() {
  const [services, setServices] = useState<FreelancerService[]>([]);
  const [newName, setNewName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; tone: "success" | "error" } | null>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/services?includeArchived=true")
      .then(async (response) => {
        const payload = await response.json() as { services?: FreelancerService[]; message?: string };
        if (!response.ok) throw new Error(payload.message || "No pude cargar tus servicios.");
        if (active) setServices(payload.services || []);
      })
      .catch((error) => { if (active) setFeedback({ message: error instanceof Error ? error.message : "No pude cargar tus servicios.", tone: "error" }); });
    return () => { active = false; };
  }, []);

  async function createService() {
    const name = newName.trim();
    if (!name) return;
    setBusyId("new");
    try {
      const response = await fetch("/api/services", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, icon: "briefcase-business" }) });
      const payload = await response.json() as { service?: FreelancerService; message?: string };
      if (!response.ok || !payload.service) throw new Error(payload.message || "No pude crear el servicio.");
      setServices((current) => [...current, payload.service!]);
      setNewName("");
      setFeedback({ message: "Servicio agregado.", tone: "success" });
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : "No pude crear el servicio.", tone: "error" });
    } finally { setBusyId(null); }
  }

  async function saveService(service: FreelancerService, patch: Partial<FreelancerService>) {
    setBusyId(service.id);
    try {
      const response = await fetch(`/api/services/${encodeURIComponent(service.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      const payload = await response.json() as { service?: FreelancerService; message?: string };
      if (!response.ok || !payload.service) throw new Error(payload.message || "No pude guardar el servicio.");
      setServices((current) => current.map((item) => item.id === service.id ? payload.service! : item));
      setFeedback({ message: patch.active === false ? "Servicio archivado." : patch.active === true ? "Servicio reactivado." : "Servicio actualizado.", tone: "success" });
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : "No pude guardar el servicio.", tone: "error" });
    } finally { setBusyId(null); }
  }

  async function moveService(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= services.length) return;
    const previous = services;
    const next = [...services];
    [next[index], next[target]] = [next[target], next[index]];
    setServices(next);
    setBusyId("reorder");
    try {
      const response = await fetch("/api/services/reorder", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ serviceIds: next.map((item) => item.id) }) });
      const payload = await response.json() as { services?: FreelancerService[]; message?: string };
      if (!response.ok) throw new Error(payload.message || "No pude reordenar los servicios.");
      if (payload.services) setServices(payload.services);
    } catch (error) {
      setServices(previous);
      setFeedback({ message: error instanceof Error ? error.message : "No pude reordenar los servicios.", tone: "error" });
    } finally { setBusyId(null); }
  }

  return <section className="settings-section">
    <SectionTitle icon={<BriefcaseBusiness size={18} />}>Servicios que ofrecés</SectionTitle>
    <p className="settings-section__intro">Tu catálogo define qué puede aparecer para cada cliente. Podés cambiarlo cuando quieras.</p>
    <div className="service-settings-list">
      {services.map((service, index) => <div className={service.active ? "service-setting-row" : "service-setting-row is-archived"} key={service.id}>
        <BriefcaseBusiness size={18} />
        <input value={service.name} onChange={(event) => setServices((current) => current.map((item) => item.id === service.id ? { ...item, name: event.target.value } : item))} aria-label={`Nombre de ${service.name}`} />
        <select value={service.icon} onChange={(event) => setServices((current) => current.map((item) => item.id === service.id ? { ...item, icon: event.target.value } : item))} aria-label={`Icono de ${service.name}`}>{serviceIconOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
        <button type="button" onClick={() => void moveService(index, -1)} disabled={index === 0 || busyId === "reorder"} aria-label={`Subir ${service.name}`}><ArrowUp size={16} /></button>
        <button type="button" onClick={() => void moveService(index, 1)} disabled={index === services.length - 1 || busyId === "reorder"} aria-label={`Bajar ${service.name}`}><ArrowDown size={16} /></button>
        <button type="button" onClick={() => void saveService(service, { name: service.name.trim(), icon: service.icon })} disabled={!service.name.trim() || busyId === service.id} aria-label={`Guardar ${service.name}`}><Save size={16} /></button>
        <button type="button" onClick={() => void saveService(service, { active: !service.active })} disabled={busyId === service.id} aria-label={service.active ? `Archivar ${service.name}` : `Reactivar ${service.name}`}>{service.active ? <Archive size={16} /> : <RotateCcw size={16} />}</button>
      </div>)}
    </div>
    <form className="service-settings-create" onSubmit={(event) => { event.preventDefault(); void createService(); }}><Plus size={18} /><input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Agregar otro servicio" aria-label="Nuevo servicio" /><button className="button button--secondary" type="submit" disabled={!newName.trim() || busyId === "new"}>Agregar</button></form>
    <Feedback message={feedback?.message} tone={feedback?.tone} />
  </section>;
}

export function SettingsView() {
  const router = useRouter();
  const [profile, setProfile] = useState({
    morningBriefingEnabled: true,
    middayCheckEnabled: true,
    endOfDayEnabled: false,
    insistenceLevel: 4,
    quietHoursStart: "22:30",
    quietHoursEnd: "08:30",
    explicitPreferences: "Rioplatense, directa, breve y con un poco de humor. Sin tono de coach.",
    name: "",
    timezone: "America/Argentina/Buenos_Aires",
    description: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; tone: "success" | "error" } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void fetch("/api/settings/profile", { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as {
          profile?: {
            morningBriefingEnabled: boolean;
            middayCheckEnabled: boolean;
            endOfDayEnabled: boolean;
            insistenceLevel: number;
            quietHoursStart: string;
            quietHoursEnd: string;
            explicitPreferences: string[];
          };
          user?: { preferredName: string; name: string; timezone: string; description: string };
          message?: string;
        };
        if (!response.ok || !payload.profile) throw new Error(payload.message || "No pude cargar tus preferencias.");
        if (!active) return;
        setProfile({
          morningBriefingEnabled: payload.profile.morningBriefingEnabled,
          middayCheckEnabled: payload.profile.middayCheckEnabled,
          endOfDayEnabled: payload.profile.endOfDayEnabled,
          insistenceLevel: payload.profile.insistenceLevel,
          quietHoursStart: payload.profile.quietHoursStart.slice(0, 5),
          quietHoursEnd: payload.profile.quietHoursEnd.slice(0, 5),
          explicitPreferences: Array.isArray(payload.profile.explicitPreferences)
            ? payload.profile.explicitPreferences.join("\n")
            : "",
          name: payload.user?.preferredName || payload.user?.name || "",
          timezone: payload.user?.timezone || "America/Argentina/Buenos_Aires",
          description: payload.user?.description || "",
        });
      })
      .catch((error: unknown) => {
        if (active && (error as { name?: string }).name !== "AbortError") {
          setFeedback({ message: error instanceof Error ? error.message : "No pude cargar tus preferencias.", tone: "error" });
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  async function savePreferences() {
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/settings/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...profile,
          explicitPreferences: profile.explicitPreferences.split("\n").map((item) => item.trim()).filter(Boolean),
        }),
      });
      const payload = await response.json() as { message?: string };
      if (!response.ok) throw new Error(payload.message || "No pude guardar tus preferencias.");
      setFeedback({ message: "Preferencias guardadas para próximas conversaciones y check-ins.", tone: "success" });
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : "No pude guardar tus preferencias.", tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function logOut() {
    setSaving(true);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("No pude cerrar la sesión.");
      router.push("/");
      router.refresh();
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : "No pude cerrar la sesión.", tone: "error" });
      setSaving(false);
    }
  }

  const checkins = {
    morning: profile.morningBriefingEnabled,
    midday: profile.middayCheckEnabled,
    evening: profile.endOfDayEnabled,
  };
  const checkinFields = {
    morning: "morningBriefingEnabled",
    midday: "middayCheckEnabled",
    evening: "endOfDayEnabled",
  } as const;

  return (
    <div className="standard-page settings-page">
      <header className="standard-heading"><div><p>Cómo querés que te acompañe</p><h1>Configuración</h1><span>La insistencia se adapta a vos; los compromisos importantes no se pierden.</span></div></header>
      <section className="settings-section">
        <SectionTitle icon={<BriefcaseBusiness size={18} />}>Tu perfil</SectionTitle>
        <div className="settings-grid">
          <label><span>Nombre</span><input autoComplete="name" disabled={loading || saving} value={profile.name} onChange={(event) => setProfile((current) => ({ ...current, name: event.target.value }))} /></label>
          <label><span>Zona horaria</span><input disabled={loading || saving} value={profile.timezone} onChange={(event) => setProfile((current) => ({ ...current, timezone: event.target.value }))} /></label>
          <label className="settings-wide"><span>Qué hacés</span><textarea disabled={loading || saving} value={profile.description} onChange={(event) => setProfile((current) => ({ ...current, description: event.target.value }))} rows={3} /></label>
        </div>
        <div className="settings-profile-actions"><button className="button button--primary" type="button" disabled={loading || saving || !profile.name.trim()} onClick={() => void savePreferences()}><Save size={16} />Guardar perfil</button><button className="button button--secondary" type="button" disabled={saving} onClick={() => void logOut()}><LogOut size={16} />Cerrar sesión</button></div>
      </section>
      <PushSettings />
      <ServicesSettings />
      <section className="settings-section">
        <SectionTitle icon={<Clock3 size={18} />}>Check-ins</SectionTitle>
        <div className="setting-list">
          {[
            ["morning", "Briefing de la mañana", "09:00 · qué conviene mover primero"],
            ["midday", "Chequeo del mediodía", "13:30 · ajustar lo que se trabó"],
            ["evening", "Cierre del día", "18:30 · opcional"],
          ].map(([key, label, description]) => (
            <label className="toggle-row" key={key}><div><strong>{label}</strong><span>{description}</span></div><input type="checkbox" disabled={loading || saving} checked={checkins[key as keyof typeof checkins]} onChange={() => setProfile((current) => ({ ...current, [checkinFields[key as keyof typeof checkinFields]]: !checkins[key as keyof typeof checkins] }))} /><i /></label>
          ))}
        </div>
      </section>
      <section className="settings-section">
        <SectionTitle icon={<Settings size={18} />}>Tono y límites</SectionTitle>
        <div className="settings-grid">
          <label><span>Nivel de insistencia</span><select disabled={loading || saving} value={profile.insistenceLevel} onChange={(event) => setProfile((current) => ({ ...current, insistenceLevel: Number(event.target.value) }))}><option value={1}>Muy suave</option><option value={2}>Suave</option><option value={3}>Equilibrada</option><option value={4}>Directa, con criterio</option><option value={5}>No me dejes patear nada</option></select></label>
          <label><span>Horario silencioso</span><div className="time-pair"><input aria-label="Inicio del horario silencioso" disabled={loading || saving} type="time" value={profile.quietHoursStart} onChange={(event) => setProfile((current) => ({ ...current, quietHoursStart: event.target.value }))} /><span>a</span><input aria-label="Fin del horario silencioso" disabled={loading || saving} type="time" value={profile.quietHoursEnd} onChange={(event) => setProfile((current) => ({ ...current, quietHoursEnd: event.target.value }))} /></div></label>
          <label className="settings-wide"><span>Preferencia de comunicación</span><textarea disabled={loading || saving} value={profile.explicitPreferences} onChange={(event) => setProfile((current) => ({ ...current, explicitPreferences: event.target.value }))} rows={3} /></label>
        </div>
        <button className="button button--primary" type="button" disabled={loading || saving} onClick={savePreferences}><Check size={16} />{loading ? "Cargando…" : saving ? "Guardando…" : "Guardar preferencias"}</button>
        <Feedback message={feedback?.message} tone={feedback?.tone} />
      </section>
    </div>
  );
}
