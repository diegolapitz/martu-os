"use client";

import { FormEvent, useState } from "react";
import { ArrowLeft, ArrowRight, Check, KeyRound, Mail, ShieldCheck, UserRound } from "lucide-react";

import { Brand, SunMark } from "@/components/brand";
import type { AuthMode } from "@/server/auth/config";

type View = "login" | "register" | "reset";

export function LoginScreen({ authMode, initialError = "", nextPath = "/day" }: { authMode: AuthMode; initialError?: string; nextPath?: string }) {
  const [view, setView] = useState<View>("login");
  const [error, setError] = useState(initialError);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  function changeView(next: View) {
    setView(next);
    setError("");
    setNotice("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const endpoint = authMode === "legacy"
        ? "/api/session/start"
        : view === "register"
          ? "/api/auth/register"
          : view === "reset"
            ? "/api/auth/reset"
            : "/api/auth/login";
      const body = authMode === "legacy" ? { code: String(payload.code || "") } : payload;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json().catch(() => ({}))) as { message?: string; confirmationRequired?: boolean };
      if (!response.ok) throw new Error(result.message || "No pude continuar.");
      if (view === "reset") {
        setNotice("Si existe una cuenta con ese email, te mandamos un enlace para recuperar el acceso.");
        return;
      }
      if (view === "register" && result.confirmationRequired) {
        setNotice("Ya casi está. Revisá tu email y confirmá la cuenta; después volvés acá y entrás.");
        return;
      }
      window.location.assign(view === "register" ? "/onboarding" : nextPath);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No pude continuar.");
    } finally {
      setBusy(false);
    }
  }

  const title = view === "register" ? "Creá tu espacio en Martu OS." : view === "reset" ? "Recuperemos tu acceso." : "Volvé a tu trabajo.";
  const description = view === "register"
    ? "Te llevo de la mano. En unos minutos vas a tener tu forma de trabajar y tu primer cliente listos."
    : view === "reset"
      ? "Decime con qué email te registraste y te mando un enlace seguro."
      : "Entrá y seguí exactamente donde lo dejaste.";

  return (
    <main className="login-page auth-entry">
      <div className="login-page__brand"><Brand /></div>
      <section className="login-copy auth-entry__panel">
        {view === "reset" ? (
          <button className="auth-entry__back" type="button" onClick={() => changeView("login")}><ArrowLeft size={17} /> Volver</button>
        ) : authMode === "supabase" ? (
          <div className="auth-entry__tabs" role="tablist" aria-label="Acceso a Martu OS">
            <button role="tab" aria-selected={view === "login"} type="button" onClick={() => changeView("login")}>Iniciar sesión</button>
            <button role="tab" aria-selected={view === "register"} type="button" onClick={() => changeView("register")}>Crear cuenta</button>
          </div>
        ) : null}

        <span className="login-copy__eyebrow">{view === "register" ? "Tu espacio personal" : "Martu OS"}</span>
        <h1>{title}</h1>
        <p>{description}</p>

        <form className="login-form auth-entry__form" onSubmit={submit}>
          {authMode === "legacy" ? (
            <label><span>Código de acceso</span><div className="auth-entry__input"><KeyRound size={18} /><input name="code" type="password" autoComplete="current-password" placeholder="Tu código" disabled={busy} /></div></label>
          ) : (
            <>
              {view === "register" ? <label><span>Tu nombre</span><div className="auth-entry__input"><UserRound size={18} /><input name="name" autoComplete="name" placeholder="¿Cómo te llamás?" required minLength={2} disabled={busy} /></div></label> : null}
              <label><span>Email</span><div className="auth-entry__input"><Mail size={18} /><input name="email" type="email" inputMode="email" autoComplete="email" placeholder="vos@ejemplo.com" required disabled={busy} /></div></label>
              {view !== "reset" ? <label><span>Contraseña</span><div className="auth-entry__input"><KeyRound size={18} /><input name="password" type="password" autoComplete={view === "register" ? "new-password" : "current-password"} placeholder={view === "register" ? "Al menos 8 caracteres" : "Tu contraseña"} required minLength={8} disabled={busy} /></div></label> : null}
            </>
          )}
          <button className="button button--primary login-button" type="submit" disabled={busy} data-testid="login-enter">
            {busy ? "Un momento…" : view === "register" ? "Crear mi cuenta" : view === "reset" ? "Mandar enlace" : authMode === "legacy" ? "Entrar a laburar" : "Iniciar sesión"}
            <ArrowRight size={19} />
          </button>
        </form>

        {view === "login" && authMode === "supabase" ? <button className="auth-entry__forgot" type="button" onClick={() => changeView("reset")}>No puedo entrar</button> : null}
        {notice ? <p className="auth-entry__notice" role="status"><Check size={18} />{notice}</p> : null}
        {error ? <p className="login-error" role="alert">{error}</p> : null}
        <div className="login-promise"><ShieldCheck size={23} />Tu espacio y tus clientes quedan separados de cualquier otra cuenta.</div>
      </section>

      <aside className="login-preview auth-entry__guide" aria-hidden="true">
        <div className="auth-entry__guide-mark"><SunMark size={30} /></div>
        <p>Primero te conozco a vos.</p>
        <ol>
          <li><span>1</span><div><strong>Cómo trabajás</strong><small>Perfil y servicios</small></div></li>
          <li><span>2</span><div><strong>Tu primer cliente</strong><small>Con lo mínimo alcanza</small></div></li>
          <li><span>3</span><div><strong>Empezar</strong><small>El resto puede esperar</small></div></li>
        </ol>
        <blockquote>No hace falta que dejes todo perfecto ahora.</blockquote>
      </aside>
    </main>
  );
}
