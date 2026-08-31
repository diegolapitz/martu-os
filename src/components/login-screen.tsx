"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Circle, Plus, Sparkles } from "lucide-react";
import { Brand, SunMark } from "@/components/brand";

const demoRows = ["Cerrar guion de Gavilán", "Editar reel de Luma", "Aprobar historias"];

export function LoginScreen() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [isPending, startTransition] = useTransition();
  const busy = submitting || isPending;

  async function enter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/session/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() || undefined }),
      });
      const payload = await response.json().catch(() => ({})) as { message?: string };
      if (!response.ok) throw new Error(payload.message || "No pude iniciar la sesión.");
      const requested = new URLSearchParams(window.location.search).get("next");
      let destination = requested?.startsWith("/") && !requested.startsWith("//") ? requested : "/day";
      if (!requested) {
        const onboardingResponse = await fetch("/api/onboarding");
        if (onboardingResponse.ok) {
          const onboardingPayload = await onboardingResponse.json() as { onboarding?: { status?: string } };
          if (!["completed", "skipped"].includes(onboardingPayload.onboarding?.status || "")) destination = "/onboarding";
        }
      }
      startTransition(() => router.push(destination));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No pude iniciar la sesión.");
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <div className="login-page__brand"><Brand /></div>
      <section className="login-copy">
        <span className="login-copy__eyebrow">Tu operación, en un solo lugar</span>
        <h1>Entrá a Martu OS.</h1>
        <p>Clientes, trabajo, calendario y una supervisora que conserva el contexto.</p>
        <form className="login-form" onSubmit={enter}>
          <label><span>Código de acceso</span><input type="password" autoComplete="current-password" value={code} onChange={(event) => setCode(event.target.value)} placeholder="Tu código" disabled={busy} /></label>
          <button
            className="button button--primary login-button"
            type="submit"
            disabled={busy}
            data-testid="login-enter"
          >
            {busy ? "Entrando…" : "Entrar a laburar"}
            <ArrowRight size={19} />
          </button>
        </form>
        <div className="login-promise"><SunMark size={27} />Los compromisos importantes no se pierden.</div>
        {error ? <p className="login-error" role="alert">{error}</p> : null}
      </section>

      <aside className="login-preview" aria-hidden="true">
        <div className="login-orbit"><span /></div>
        <div className="login-preview__sun"><SunMark size={31} /></div>
        <div className="login-preview__sheet">
          {demoRows.map((row, index) => (
            <div className={index === 0 ? "login-preview__row is-active" : "login-preview__row"} key={row}>
              <span>{index + 1}</span>
              {index === 0 ? <CheckCircle2 size={20} /> : <Circle size={20} />}
              <div><b>{row}</b><small>vence {index === 0 ? "mañana" : "esta semana"}</small></div>
              <ArrowRight size={14} />
            </div>
          ))}
          <div className="login-preview__capture"><Plus size={18} /><span>Anotá algo…</span><Sparkles size={16} /><b>Supervisora</b></div>
        </div>
        <blockquote>Hoy hay tres<br />cosas que yo<br />no patearía.</blockquote>
      </aside>
    </main>
  );
}
