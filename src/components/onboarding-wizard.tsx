"use client";

import type { ComponentType } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  CheckCircle2,
  FileText,
  Lightbulb,
  LoaderCircle,
  Megaphone,
  Mic,
  PencilLine,
  Plus,
  Scissors,
  Send,
  ShieldCheck,
  Target,
  Upload,
  Users,
  Video,
  X,
} from "lucide-react";

import { Brand, ClientMark } from "@/components/brand";
import { Feedback } from "@/components/ui";
import { prepareClientLogo, removeClientLogo, saveClientLogo, type PreparedClientLogo } from "@/lib/client-logo-browser";

type Step = "welcome" | "profile" | "services" | "client" | "brief" | "strategy" | "complete";
type Service = { id: string; name: string; icon: string; sortOrder: number; active: boolean };
type OnboardingState = {
  status: "not_started" | "in_progress" | "completed" | "skipped";
  step: Step;
  completed: Step[];
  skipped: Step[];
  profileText: string;
  confirmedServiceIds: string[];
};
type ClientSetup = {
  completeness: number;
  sections: Array<{ id: string; label: string; items: Array<{ id: string; label: string; complete: boolean; optional: boolean }> }>;
  nonBlocking: true;
};
type CreatedClient = { id: string; slug: string; name: string; description: string; color: string; logoUrl: string | null; serviceIds: string[] };
type UserProfile = { name: string; preferredName: string; email: string | null; timezone: string; avatarUrl: string | null; description: string };
type PreparedLogo = PreparedClientLogo;

const STEPS: Step[] = ["welcome", "profile", "services", "client", "brief", "strategy", "complete"];
const STEP_LABELS: Record<Step, string> = {
  welcome: "Bienvenida",
  profile: "Tu trabajo",
  services: "Servicios",
  client: "Primer cliente",
  brief: "Brief",
  strategy: "Estrategia",
  complete: "Listo",
};

const SERVICE_ICONS: Array<[RegExp, ComponentType<{ size?: number }>]> = [
  [/estrateg|strategy/i, Target],
  [/community|cuenta|reunion/i, Users],
  [/idea|plan/i, Lightbulb],
  [/guion|script/i, FileText],
  [/graba|record/i, Video],
  [/edici|edit/i, Scissors],
  [/public|histor/i, Send],
  [/metric|report/i, BarChart3],
  [/ads|pauta/i, Megaphone],
  [/calendar|evento/i, CalendarDays],
];

function ServiceIcon({ service, size = 19 }: { service: Pick<Service, "name" | "icon">; size?: number }) {
  const Icon = SERVICE_ICONS.find(([pattern]) => pattern.test(`${service.name} ${service.icon}`))?.[1] || BriefcaseBusiness;
  return <Icon size={size} aria-hidden="true" />;
}

function normalized(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");
}

function detectedServiceIds(text: string, services: Service[]) {
  const value = normalized(text);
  const aliases: Array<[RegExp, RegExp]> = [
    [/estrateg/, /estrateg/],
    [/community|redes|cuenta/, /community|account/],
    [/contenido|creo contenido/, /contenido|content/],
    [/idea|planific/, /idea|plan/],
    [/guion/, /guion|script/],
    [/grabo|grabacion|filmo/, /graba|record/],
    [/edito|edicion/, /edici|edit/],
    [/publico|publicacion/, /public/],
    [/historias/, /histor/],
    [/metrica|reporte|reporting/, /metric|report/],
    [/meta ads|pauta/, /meta ads|pauta/],
    [/google ads/, /google ads/],
    [/evento|cobertura/, /evento|cobertura/],
  ];
  const found = new Set<string>();
  for (const service of services) {
    const serviceText = normalized(`${service.name} ${service.icon}`);
    if (aliases.some(([spoken, catalog]) => spoken.test(value) && catalog.test(serviceText))) found.add(service.id);
  }
  return [...found];
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({})) as T & { message?: string };
  if (!response.ok) throw new Error(payload.message || "No pude guardar eso todavía.");
  return payload;
}

function nextCompleted(state: OnboardingState, ...steps: Step[]) {
  return [...new Set([...state.completed, ...steps])];
}

export function OnboardingWizard() {
  const router = useRouter();
  const [state, setState] = useState<OnboardingState | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [step, setStep] = useState<Step>("welcome");
  const [profileText, setProfileText] = useState("");
  const [profileName, setProfileName] = useState("");
  const [timezone, setTimezone] = useState("America/Argentina/Buenos_Aires");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<PreparedLogo | null>(null);
  const [avatarDirty, setAvatarDirty] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [profileMode, setProfileMode] = useState<"voice" | "services" | "write" | null>(null);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [customServices, setCustomServices] = useState<string[]>([]);
  const [customService, setCustomService] = useState("");
  const [client, setClient] = useState({ name: "", description: "", color: "#4f7157", serviceIds: [] as string[] });
  const [clientLogo, setClientLogo] = useState<PreparedLogo | null>(null);
  const [clientLogoDirty, setClientLogoDirty] = useState(false);
  const [clientLogoError, setClientLogoError] = useState<string | null>(null);
  const [preparingLogo, setPreparingLogo] = useState(false);
  const [createdClient, setCreatedClient] = useState<CreatedClient | null>(null);
  const [setup, setSetup] = useState<ClientSetup | null>(null);
  const [briefMode, setBriefMode] = useState<"upload" | "voice" | "questions" | "later" | null>(null);
  const [brief, setBrief] = useState({ businessDescription: "", objective: "", audience: "", tone: "", avoidances: "", fileName: "" });
  const [strategyMode, setStrategyMode] = useState<"upload" | "paste" | "write" | "voice" | "later" | null>(null);
  const [strategy, setStrategy] = useState({ title: "Estrategia inicial", text: "", fileName: "" });
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ message: string; tone: "success" | "error" } | null>(null);
  const [recordingFor, setRecordingFor] = useState<"profile" | "client" | "brief" | "strategy" | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    let active = true;
    void api<{ onboarding: OnboardingState; services: Service[]; user: UserProfile; clients?: Array<{ id: string; slug: string; name: string; color: string; logoUrl: string | null }> }>("/api/onboarding")
      .then(async (payload) => {
        if (!active) return;
        setState(payload.onboarding);
        setServices(payload.services.filter((service) => service.active));
        setStep(payload.onboarding.step);
        setProfileText(payload.onboarding.profileText || "");
        setProfileName(payload.user.preferredName || payload.user.name || "");
        setTimezone(payload.user.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Argentina/Buenos_Aires");
        setAvatarUrl(payload.user.avatarUrl);
        setSelectedServiceIds(payload.onboarding.confirmedServiceIds || []);
        setClient((current) => ({ ...current, serviceIds: payload.onboarding.confirmedServiceIds || [] }));
        const existingClient = payload.clients?.[0];
        if (existingClient && STEPS.indexOf(payload.onboarding.step) >= STEPS.indexOf("brief")) {
          const saved = await api<{ client: CreatedClient; setup: ClientSetup }>(`/api/clients/${encodeURIComponent(existingClient.slug)}/setup`);
          if (!active) return;
          setCreatedClient(saved.client);
          setSetup(saved.setup);
          setClient({ name: saved.client.name, description: saved.client.description, color: saved.client.color, serviceIds: saved.client.serviceIds });
        }
      })
      .catch((error) => setFeedback({ message: error instanceof Error ? error.message : "No pude abrir el onboarding.", tone: "error" }))
      .finally(() => { if (active) setLoading(false); });
    return () => {
      active = false;
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => () => {
    if (clientLogo) URL.revokeObjectURL(clientLogo.previewUrl);
    if (avatar) URL.revokeObjectURL(avatar.previewUrl);
  }, [clientLogo, avatar]);

  const activeStepNumber = Math.max(1, STEPS.indexOf(step));
  const progress = step === "welcome" ? 0 : step === "complete" ? 100 : Math.round((activeStepNumber / (STEPS.length - 1)) * 100);
  const selectedServices = useMemo(() => services.filter((service) => selectedServiceIds.includes(service.id)), [selectedServiceIds, services]);

  async function patchOnboarding(body: Record<string, unknown>) {
    const next = await api<{ onboarding: OnboardingState; services: Service[] }>("/api/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setState(next.onboarding);
    setServices(next.services.filter((service) => service.active));
    setStep(next.onboarding.step);
    return next.onboarding;
  }

  async function moveTo(nextStep: Step, complete: Step[] = [], skipped: Step[] = []) {
    if (!state) return;
    setBusy(true);
    setFeedback(null);
    try {
      await patchOnboarding({
        status: nextStep === "complete" ? "completed" : "in_progress",
        step: nextStep,
        completed: nextCompleted(state, ...complete),
        skipped: [...new Set([...state.skipped, ...skipped])].filter((item) => !nextCompleted(state, ...complete).includes(item)),
      });
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : "No pude avanzar.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function skipOnboarding() {
    if (!state) return;
    setBusy(true);
    try {
      await patchOnboarding({ status: "skipped", step: "welcome", skipped: ["welcome"] });
      router.push("/day");
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : "No pude guardar tu elección.", tone: "error" });
      setBusy(false);
    }
  }

  async function continueLater() {
    if (!state) return;
    setBusy(true);
    setFeedback(null);
    try {
      await patchOnboarding({ status: "in_progress", step });
      router.push("/day");
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : "No pude guardar el avance.", tone: "error" });
      setBusy(false);
    }
  }

  function applyTranscript(target: "profile" | "client" | "brief" | "strategy", text: string) {
    const detected = detectedServiceIds(text, services);
    if (target === "profile") {
      setProfileText(text);
      setSelectedServiceIds((current) => detected.length ? [...new Set([...current, ...detected])] : current);
      setProfileMode("voice");
    } else if (target === "client") {
      setClient((current) => ({ ...current, description: text, serviceIds: detected.length ? [...new Set([...current.serviceIds, ...detected])] : current.serviceIds }));
    } else if (target === "brief") {
      setBrief((current) => ({ ...current, businessDescription: text }));
      setBriefMode("voice");
    } else {
      setStrategy((current) => ({ ...current, text }));
      setStrategyMode("voice");
    }
  }

  async function toggleRecording(target: "profile" | "client" | "brief" | "strategy") {
    if (recordingFor) {
      recorderRef.current?.stop();
      return;
    }
    setFeedback(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = async () => {
        setRecordingFor(null);
        stream.getTracks().forEach((track) => track.stop());
        setTranscribing(true);
        try {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
          const form = new FormData();
          form.append("audio", blob, "onboarding.webm");
          form.append("process", "false");
          const payload = await api<{ text: string }>("/api/ai/transcribe", { method: "POST", body: form });
          applyTranscript(target, payload.text);
          setFeedback({ message: "Listo, lo pasé a texto. Revisalo antes de confirmar.", tone: "success" });
        } catch (error) {
          setFeedback({ message: error instanceof Error ? error.message : "No pude entender el audio.", tone: "error" });
        } finally {
          setTranscribing(false);
        }
      };
      recorder.start();
      setRecordingFor(target);
    } catch {
      setFeedback({ message: "Necesito permiso para usar el micrófono. También podés seguir escribiendo.", tone: "error" });
    }
  }

  function continueProfile() {
    const detected = detectedServiceIds(profileText, services);
    if (detected.length) setSelectedServiceIds((current) => [...new Set([...current, ...detected])]);
    setStep("services");
  }

  async function confirmServices() {
    if (!state || !profileName.trim() || (!selectedServiceIds.length && !customServices.length)) {
      setFeedback({ message: "Elegí al menos un servicio. Después podés cambiarlo.", tone: "error" });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const created = await Promise.all(customServices.map((name) => api<{ service: Service }>("/api/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, icon: "briefcase-business" }),
      })));
      const allIds = [...new Set([...selectedServiceIds, ...created.map((item) => item.service.id)])];
      if (avatarDirty) {
        if (avatar) {
          const form = new FormData();
          form.set("image", avatar.file);
          const result = await api<{ avatarUrl: string }>("/api/profile/avatar", { method: "POST", body: form });
          setAvatarUrl(result.avatarUrl);
        } else {
          await api("/api/profile/avatar", { method: "DELETE" });
          setAvatarUrl(null);
        }
        setAvatarDirty(false);
      }
      const next = await patchOnboarding({
        status: "in_progress",
        step: "client",
        completed: nextCompleted(state, "welcome", "profile", "services"),
        skipped: state.skipped.filter((item) => !["welcome", "profile", "services"].includes(item)),
        profileText: profileText.trim(),
        profileName: profileName.trim(),
        timezone,
        confirmedServiceIds: allIds,
        confirmed: true,
      });
      setSelectedServiceIds(allIds);
      setClient((current) => ({ ...current, serviceIds: allIds }));
      setState(next);
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : "No pude guardar tus servicios.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function chooseAvatar(file: File | undefined) {
    if (!file) return;
    setPreparingLogo(true);
    setFeedback(null);
    try {
      const prepared = await prepareClientLogo(file);
      setAvatar(prepared);
      setAvatarDirty(true);
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : "No pude preparar tu foto.", tone: "error" });
    } finally {
      setPreparingLogo(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  }

  async function createFirstClient() {
    if (!state || !client.name.trim() || client.serviceIds.length === 0) {
      setFeedback({ message: "Con nombre y al menos un servicio ya podemos arrancar.", tone: "error" });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      if (createdClient) {
        await api(`/api/clients/${encodeURIComponent(createdClient.slug)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: client.name.trim(),
            description: client.description.trim(),
            accent: client.color,
          }),
        });
        await api(`/api/clients/${encodeURIComponent(createdClient.slug)}/setup`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ serviceIds: client.serviceIds }),
        });
        const nextClient = clientLogoDirty
          ? await syncClientLogo(createdClient, clientLogo)
          : createdClient;
        setCreatedClient(nextClient);
        await moveTo("brief", ["client"]);
        return;
      }
      const payload = await api<{ client: CreatedClient; setup: ClientSetup }>("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: client.name.trim(),
          description: client.description.trim(),
          logoUrl: null,
          color: client.color,
          serviceIds: client.serviceIds,
        }),
      });
      setCreatedClient(payload.client);
      setSetup(payload.setup);
      const nextClient = clientLogo
        ? await syncClientLogo(payload.client, clientLogo)
        : payload.client;
      setCreatedClient(nextClient);
      await moveTo("brief", ["client"]);
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : "No pude crear el cliente.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function syncClientLogo(current: CreatedClient, logo: PreparedLogo | null) {
    if (!logo) {
      await removeClientLogo(current.slug);
      setClientLogoDirty(false);
      return { ...current, logoUrl: null };
    }
    const logoUrl = await saveClientLogo(current.slug, logo.file);
    setClientLogoDirty(false);
    return { ...current, logoUrl };
  }

  async function chooseClientLogo(file: File | undefined) {
    if (!file) return;
    setPreparingLogo(true);
    setClientLogoError(null);
    try {
      const prepared = await prepareClientLogo(file);
      setClientLogo(prepared);
      setClientLogoDirty(true);
    } catch (error) {
      setClientLogoError(error instanceof Error ? error.message : "No pude preparar esa imagen.");
    } finally {
      setPreparingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  }

  function removeSelectedLogo() {
    setClientLogo(null);
    setClientLogoDirty(true);
    setClientLogoError(null);
    if (logoInputRef.current) logoInputRef.current.value = "";
  }

  async function saveBrief(skip = false) {
    if (!createdClient || !state) return;
    setBusy(true);
    setFeedback(null);
    try {
      const payload = await api<{ setup: ClientSetup }>(`/api/clients/${encodeURIComponent(createdClient.slug)}/setup`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief: skip ? { status: "missing" } : {
          businessDescription: brief.businessDescription.trim(),
          objectives: brief.objective.trim() ? [brief.objective.trim()] : [],
          audience: brief.audience.trim(),
          tone: brief.tone.trim(),
          avoidances: brief.avoidances.trim() ? [brief.avoidances.trim()] : [],
          source: briefMode === "voice" ? "voice" : briefMode === "upload" ? "upload" : "questions",
          confirmed: !skip,
        } }),
      });
      setSetup(payload.setup);
      await moveTo("strategy", skip ? [] : ["brief"], skip ? ["brief"] : []);
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : "No pude guardar el brief.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function saveStrategy(skip = false) {
    if (!createdClient || !state) return;
    setBusy(true);
    setFeedback(null);
    try {
      const payload = await api<{ setup: ClientSetup }>(`/api/clients/${encodeURIComponent(createdClient.slug)}/setup`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy: skip ? { deferred: true } : {
          title: strategy.title.trim() || "Estrategia inicial",
          status: "draft",
          sourceText: strategy.text,
          sourceType: strategyMode === "voice" ? "voice" : strategyMode === "upload" ? "upload" : strategyMode === "paste" ? "paste" : "manual",
          confirmed: true,
        } }),
      });
      setSetup(payload.setup);
      await moveTo("complete", skip ? ["complete"] : ["strategy", "complete"], skip ? ["strategy"] : []);
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : "No pude guardar la estrategia.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function readTextFile(file: File, target: "brief" | "strategy") {
    if (!/\.(txt|md|pdf)$/i.test(file.name)) {
      setFeedback({ message: "Subí un archivo .txt, .md o .pdf.", tone: "error" });
      return;
    }
    if (file.size > 20_000_000) {
      setFeedback({ message: "Ese archivo pesa más de 20 MB. Probá con una versión más liviana.", tone: "error" });
      return;
    }
    let text: string;
    try {
      if (/\.pdf$/i.test(file.name)) {
        const pdfjs = await import("pdfjs-dist");
        // PDF.js needs an explicit worker in bundled browser apps. Resolving it
        // through the module lets Next emit the worker with the application.
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        const { getDocument } = pdfjs;
        const loadingTask = getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
        const document = await loadingTask.promise;
        const pages = await Promise.all(Array.from({ length: Math.min(document.numPages, 50) }, async (_, index) => {
          const page = await document.getPage(index + 1);
          const content = await page.getTextContent();
          return content.items.map((item) => "str" in item ? item.str : "").join(" ");
        }));
        await loadingTask.destroy();
        text = pages.join("\n\n").replace(/\s+\n/g, "\n").trim();
        if (!text) throw new Error("El PDF no tiene texto seleccionable. Subí una versión con texto o pegá el contenido.");
      } else {
        text = await file.text();
      }
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : "No pude leer ese PDF.", tone: "error" });
      return;
    }
    if (target === "brief") {
      setBrief((current) => ({ ...current, businessDescription: text, fileName: file.name }));
      setBriefMode("upload");
    } else {
      setStrategy((current) => ({ ...current, text, fileName: file.name }));
      setStrategyMode("upload");
    }
  }

  if (loading) return <main className="onboarding-shell"><div className="onboarding-loading"><LoaderCircle className="spin" size={22} />Preparando tu espacio…</div></main>;

  return (
    <main className="onboarding-shell">
      <header className="onboarding-topbar">
        <Brand />
        {step !== "welcome" && step !== "complete" ? <button type="button" onClick={() => void continueLater()} disabled={busy}>Continuar más tarde</button> : null}
      </header>

      {step !== "welcome" ? (
        <div className="onboarding-progress" aria-label={`Paso ${activeStepNumber} de ${STEPS.length - 1}`}>
          <div><span>Paso {activeStepNumber} de {STEPS.length - 1}</span><strong>{STEP_LABELS[step]}</strong></div>
          <i><b style={{ width: `${progress}%` }} /></i>
        </div>
      ) : null}

      <section className={`onboarding-card onboarding-step--${step}`}>
        {step === "welcome" ? (
          <div className="onboarding-welcome">
            <span className="onboarding-eyebrow">Tu espacio, a tu manera</span>
            <h1>Te llevo de la mano.</h1>
            <p>Son unos 5 minutos. Si querés podés saltearlo y completar todo más adelante.</p>
            <p>Igual te recomiendo seguir: cuanto más me cuentes, mejor te voy a poder ayudar.</p>
            <div className="onboarding-actions"><button className="button button--primary" type="button" onClick={() => void moveTo("profile", ["welcome"])} disabled={busy}>Empezar <ArrowRight size={18} /></button><button className="button button--secondary" type="button" onClick={() => void skipOnboarding()} disabled={busy}>Lo hago después</button></div>
          </div>
        ) : null}

        {step === "profile" ? (
          <div>
            <span className="onboarding-eyebrow">Primero, vos</span>
            <h1>Armemos tu perfil de trabajo.</h1>
            <p>Con tu nombre y una idea de lo que hacés alcanza. Todo se puede cambiar después.</p>
            <div className="onboarding-profile-basics">
              <div className="onboarding-profile-photo">
                {avatar?.previewUrl || avatarUrl ? <Image src={avatar?.previewUrl ?? avatarUrl ?? ""} alt="Vista previa de tu foto" width={58} height={58} unoptimized /> : <span aria-hidden="true">{(profileName.trim()[0] || "M").toLocaleUpperCase("es")}</span>}
                <label className="button button--secondary">{preparingLogo ? <LoaderCircle className="spin" size={16} /> : <Upload size={16} />}Foto opcional<input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || preparingLogo} onChange={(event) => void chooseAvatar(event.target.files?.[0])} /></label>
                {avatar || avatarUrl ? <button type="button" onClick={() => { setAvatar(null); setAvatarDirty(true); }}>Quitar</button> : null}
              </div>
              <label className="onboarding-field"><span>¿Cómo querés que te llamemos?</span><input autoFocus autoComplete="name" value={profileName} onChange={(event) => setProfileName(event.target.value)} placeholder="Tu nombre" /></label>
              <label className="onboarding-field"><span>Zona horaria</span><input value={timezone} onChange={(event) => setTimezone(event.target.value)} aria-describedby="timezone-help" /><small id="timezone-help">La usamos para agenda y recordatorios.</small></label>
            </div>
            <h2 className="onboarding-subtitle">¿Qué hacés?</h2>
            <div className="onboarding-choice-grid">
              <button className={profileMode === "voice" ? "is-selected" : ""} type="button" onClick={() => { setProfileMode("voice"); void toggleRecording("profile"); }}><Mic size={22} /><span><strong>{recordingFor === "profile" ? "Terminá cuando quieras" : "Contármelo hablando"}</strong><small>{recordingFor === "profile" ? "Tocá para terminar" : "Lo paso a texto para que lo revises"}</small></span></button>
              <button className={profileMode === "services" ? "is-selected" : ""} type="button" onClick={() => { setProfileMode("services"); setStep("services"); }}><BriefcaseBusiness size={22} /><span><strong>Elegir servicios</strong><small>Marcá lo que ya ofrecés</small></span></button>
              <button className={profileMode === "write" ? "is-selected" : ""} type="button" onClick={() => setProfileMode("write")}><PencilLine size={22} /><span><strong>Escribirlo</strong><small>En tus palabras</small></span></button>
            </div>
            {(profileMode === "write" || profileMode === "voice" || profileText) ? <label className="onboarding-field"><span>Esto es lo que entendí</span><textarea rows={5} value={profileText} onChange={(event) => setProfileText(event.target.value)} placeholder="Ej. Manejo redes, hago estrategia, contenido, guiones y pauta…" /><small>Revisalo tranquila: todavía no guardé nada.</small></label> : null}
            <OnboardingNav onBack={() => setStep("welcome")} onNext={continueProfile} nextDisabled={!profileName.trim() || transcribing || (!profileText.trim() && profileMode !== "services")} busy={busy || transcribing} nextLabel={transcribing ? "Pasando a texto…" : "Continuar"} />
          </div>
        ) : null}

        {step === "services" ? (
          <div>
            <span className="onboarding-eyebrow">Tu catálogo</span>
            <h1>¿Está bien lo que entendí?</h1>
            <p>Elegí, sacá o agregá servicios. Nada se guarda hasta que confirmes.</p>
            <div className="onboarding-service-list">
              {services.map((service) => {
                const selected = selectedServiceIds.includes(service.id);
                return <button className={selected ? "is-selected" : ""} type="button" onClick={() => setSelectedServiceIds((current) => selected ? current.filter((id) => id !== service.id) : [...current, service.id])} aria-pressed={selected} key={service.id}><ServiceIcon service={service} /><span>{service.name}</span><i>{selected ? <Check size={17} /> : null}</i></button>;
              })}
              {customServices.map((name) => <div className="onboarding-custom-service" key={name}><BriefcaseBusiness size={18} /><span>{name}</span><button type="button" onClick={() => setCustomServices((current) => current.filter((item) => item !== name))} aria-label={`Quitar ${name}`}><X size={16} /></button></div>)}
            </div>
            <form className="onboarding-inline-add" onSubmit={(event) => { event.preventDefault(); const name = customService.trim(); if (!name) return; setCustomServices((current) => [...new Set([...current, name])]); setCustomService(""); }}><Plus size={18} /><input value={customService} onChange={(event) => setCustomService(event.target.value)} placeholder="Agregar algo que no está" aria-label="Nuevo servicio" /><button type="submit" disabled={!customService.trim()}>Agregar</button></form>
            <div className="onboarding-safety"><ShieldCheck size={18} /><span>Esto lo podés editar, archivar y reordenar después.</span></div>
            <OnboardingNav onBack={() => setStep("profile")} onNext={() => void confirmServices()} nextDisabled={!selectedServiceIds.length && !customServices.length} busy={busy} nextLabel="Confirmar servicios" />
          </div>
        ) : null}

        {step === "client" ? (
          <div>
            <span className="onboarding-eyebrow">Empecemos con uno</span>
            <h1>Ahora sí, carguemos tu primer cliente.</h1>
            <p>Con nombre + qué hacés para él ya podemos arrancar.</p>
            <div className="onboarding-client-preview"><ClientMark name={client.name || "Cliente"} accent={client.color} logoUrl={clientLogo?.previewUrl ?? createdClient?.logoUrl} large /><span><strong>{client.name || "Tu cliente"}</strong><small>{client.description || "Podés completar la descripción después"}</small></span></div>
            <div className="onboarding-form-grid">
              <label className="onboarding-field"><span>Nombre</span><input autoFocus value={client.name} onChange={(event) => setClient((current) => ({ ...current, name: event.target.value }))} placeholder="Ej. Gavilán" /></label>
              <label className="onboarding-field"><span>Color</span><span className="onboarding-color"><input type="color" value={client.color} onChange={(event) => setClient((current) => ({ ...current, color: event.target.value }))} /><b>{client.color}</b></span></label>
              <div className="onboarding-field onboarding-field--wide onboarding-logo-field">
                <span>Logo o foto <small>opcional</small></span>
                <div className="onboarding-logo-picker">
                  <ClientMark name={client.name || "Cliente"} accent={client.color} logoUrl={clientLogo?.previewUrl ?? createdClient?.logoUrl} large />
                  <span className="onboarding-logo-picker__copy">
                    <strong>{clientLogo ? clientLogo.file.name : createdClient?.logoUrl ? "Imagen guardada" : "Sumá una imagen"}</strong>
                    <small>{clientLogo ? `${Math.max(1, Math.round(clientLogo.file.size / 1024))} KB · lista para subir` : "Desde tu galería, cámara o computadora"}</small>
                  </span>
                  <label className="button button--secondary onboarding-logo-picker__choose">
                    {preparingLogo ? <LoaderCircle className="spin" size={17} /> : <Upload size={17} />}
                    {clientLogo || createdClient?.logoUrl ? "Cambiar" : "Elegir imagen"}
                    <input ref={logoInputRef} type="file" accept="image/jpeg,image/png,image/webp" disabled={preparingLogo || busy} onChange={(event) => void chooseClientLogo(event.target.files?.[0])} />
                  </label>
                  {clientLogo || createdClient?.logoUrl ? <button className="onboarding-logo-picker__remove" type="button" onClick={removeSelectedLogo} disabled={preparingLogo || busy}><X size={16} />Quitar</button> : null}
                </div>
                <small>La recortamos y optimizamos automáticamente para que cargue rápido.</small>
                {clientLogoError ? <span className="onboarding-logo-error" role="alert">{clientLogoError}</span> : null}
              </div>
              <label className="onboarding-field onboarding-field--wide"><span>Qué hacés para este cliente</span><textarea rows={4} value={client.description} onChange={(event) => setClient((current) => ({ ...current, description: event.target.value }))} placeholder="Ej. Estrategia, ideas, guiones y edición" /></label>
            </div>
            <button className="onboarding-voice-inline" type="button" onClick={() => void toggleRecording("client")}><Mic size={18} />{recordingFor === "client" ? "Terminar relato" : "Contármelo hablando"}</button>
            <fieldset className="onboarding-service-checks"><legend>Servicios contratados</legend>{selectedServices.map((service) => <label key={service.id}><input type="checkbox" checked={client.serviceIds.includes(service.id)} onChange={(event) => setClient((current) => ({ ...current, serviceIds: event.target.checked ? [...new Set([...current.serviceIds, service.id])] : current.serviceIds.filter((id) => id !== service.id) }))} /><ServiceIcon service={service} size={16} /><span>{service.name}</span></label>)}</fieldset>
            <OnboardingNav onBack={() => setStep("services")} onNext={() => void createFirstClient()} nextDisabled={!client.name.trim() || !client.serviceIds.length} busy={busy || transcribing} nextLabel="Crear cliente" />
          </div>
        ) : null}

        {step === "brief" ? (
          <div>
            <span className="onboarding-eyebrow">Conocer al cliente</span>
            <h1>Para entenderlo bien, necesito un poco de contexto.</h1>
            <p>Si ya tenés un brief, genial. Si no, te hago unas preguntas rápidas. También podés dejarlo para después.</p>
            <div className="onboarding-choice-grid onboarding-choice-grid--four">
              <label className={briefMode === "upload" ? "is-selected onboarding-file-choice" : "onboarding-file-choice"}><Upload size={21} /><span><strong>Subir brief</strong><small>.pdf, .txt o .md</small></span><input type="file" accept=".pdf,application/pdf,.txt,text/plain,.md,text/markdown" onChange={(event) => { const file = event.target.files?.[0]; if (file) void readTextFile(file, "brief"); }} /></label>
              <button className={briefMode === "voice" ? "is-selected" : ""} type="button" onClick={() => void toggleRecording("brief")}><Mic size={21} /><span><strong>Contármelo hablando</strong><small>{recordingFor === "brief" ? "Tocá para terminar" : "Después lo revisás"}</small></span></button>
              <button className={briefMode === "questions" ? "is-selected" : ""} type="button" onClick={() => setBriefMode("questions")}><FileText size={21} /><span><strong>Preguntas rápidas</strong><small>Completá lo que sepas</small></span></button>
              <button type="button" onClick={() => void saveBrief(true)}><ArrowRight size={21} /><span><strong>Después</strong><small>No bloquea por ahora</small></span></button>
            </div>
            {briefMode && briefMode !== "later" ? <div className="onboarding-form-grid onboarding-review"><p className="onboarding-review__title">¿Lo entendí bien? Podés editar todo.</p><label className="onboarding-field onboarding-field--wide"><span>Qué hace</span><textarea rows={4} value={brief.businessDescription} onChange={(event) => setBrief((current) => ({ ...current, businessDescription: event.target.value }))} /></label><label className="onboarding-field"><span>Objetivo</span><input value={brief.objective} onChange={(event) => setBrief((current) => ({ ...current, objective: event.target.value }))} /></label><label className="onboarding-field"><span>Público</span><input value={brief.audience} onChange={(event) => setBrief((current) => ({ ...current, audience: event.target.value }))} /></label><label className="onboarding-field"><span>Tono</span><input value={brief.tone} onChange={(event) => setBrief((current) => ({ ...current, tone: event.target.value }))} /></label><label className="onboarding-field"><span>Qué evita o no quiere</span><input value={brief.avoidances} onChange={(event) => setBrief((current) => ({ ...current, avoidances: event.target.value }))} /></label></div> : null}
            <OnboardingNav onBack={() => setStep("client")} onNext={() => void saveBrief(false)} nextDisabled={!briefMode || !brief.businessDescription.trim()} busy={busy || transcribing} nextLabel="Confirmar brief" secondaryLabel="Dejar para después" onSecondary={() => void saveBrief(true)} />
          </div>
        ) : null}

        {step === "strategy" ? (
          <div>
            <span className="onboarding-eyebrow">Último paso</span>
            <h1>¿Ya existe una estrategia?</h1>
            <p>Traé lo que tengas. Si todavía no existe, la armamos más adelante.</p>
            <div className="onboarding-choice-grid onboarding-choice-grid--four">
              <label className={strategyMode === "upload" ? "is-selected onboarding-file-choice" : "onboarding-file-choice"}><Upload size={21} /><span><strong>Subir documento</strong><small>.pdf, .txt o .md</small></span><input type="file" accept=".pdf,application/pdf,.txt,text/plain,.md,text/markdown" onChange={(event) => { const file = event.target.files?.[0]; if (file) void readTextFile(file, "strategy"); }} /></label>
              <button className={strategyMode === "paste" ? "is-selected" : ""} type="button" onClick={() => setStrategyMode("paste")}><FileText size={21} /><span><strong>Pegar texto</strong><small>Lo ordenamos después</small></span></button>
              <button className={strategyMode === "voice" ? "is-selected" : ""} type="button" onClick={() => void toggleRecording("strategy")}><Mic size={21} /><span><strong>Contármela hablando</strong><small>{recordingFor === "strategy" ? "Tocá para terminar" : "La pasamos a texto"}</small></span></button>
              <button type="button" onClick={() => void saveStrategy(true)}><ArrowRight size={21} /><span><strong>Crear más adelante</strong><small>No bloquea</small></span></button>
            </div>
            {strategyMode && strategyMode !== "later" ? <div className="onboarding-review"><label className="onboarding-field"><span>Título</span><input value={strategy.title} onChange={(event) => setStrategy((current) => ({ ...current, title: event.target.value }))} /></label><label className="onboarding-field"><span>Contenido</span><textarea rows={9} value={strategy.text} onChange={(event) => setStrategy((current) => ({ ...current, text: event.target.value }))} placeholder="Pegá o escribí lo que ya existe…" /></label></div> : null}
            <OnboardingNav onBack={() => setStep("brief")} onNext={() => void saveStrategy(false)} nextDisabled={!strategyMode || !strategy.text.trim()} busy={busy || transcribing} nextLabel="Guardar estrategia" secondaryLabel="Crear más adelante" onSecondary={() => void saveStrategy(true)} />
          </div>
        ) : null}

        {step === "complete" ? (
          <div className="onboarding-complete">
            <CheckCircle2 size={36} />
            <span className="onboarding-eyebrow">Ya podés empezar</span>
            <h1>Listo. Con esto alcanza.</h1>
            <p>No hace falta completar el 100% ahora. Te voy avisando cuando algo realmente empiece a hacer falta.</p>
            {createdClient ? <div className="onboarding-completeness"><header><ClientMark name={createdClient.name} accent={createdClient.color} logoUrl={createdClient.logoUrl} /><span><strong>{createdClient.name}</strong><small>{setup?.completeness ?? 0}% preparado</small></span><b>{setup?.completeness ?? 0}%</b></header><i><b style={{ width: `${setup?.completeness ?? 0}%` }} /></i>{setup?.sections.map((section) => <section key={section.id}><strong>{section.label}</strong>{section.items.map((item) => <span key={item.id}>{item.complete ? <Check size={15} /> : <i />}{item.label}<small>{!item.complete && item.optional ? "completar después" : ""}</small></span>)}</section>)}</div> : null}
            <button className="button button--primary onboarding-finish" type="button" onClick={() => router.push(createdClient ? `/clients/${createdClient.slug}` : "/day")}>Entrar a Martu OS <ArrowRight size={18} /></button>
          </div>
        ) : null}

        <Feedback message={feedback?.message} tone={feedback?.tone} />
      </section>
    </main>
  );
}

function OnboardingNav({ onBack, onNext, nextDisabled, busy, nextLabel, secondaryLabel, onSecondary }: { onBack: () => void; onNext: () => void; nextDisabled?: boolean; busy?: boolean; nextLabel: string; secondaryLabel?: string; onSecondary?: () => void }) {
  return <footer className="onboarding-nav"><button className="button button--secondary" type="button" onClick={onBack} disabled={busy}><ArrowLeft size={17} />Atrás</button>{secondaryLabel && onSecondary ? <button className="onboarding-nav__skip" type="button" onClick={onSecondary} disabled={busy}>{secondaryLabel}</button> : null}<button className="button button--primary" type="button" onClick={onNext} disabled={busy || nextDisabled}>{busy ? <LoaderCircle className="spin" size={17} /> : null}{nextLabel}<ArrowRight size={17} /></button></footer>;
}
