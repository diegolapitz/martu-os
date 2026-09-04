"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, KeyRound } from "lucide-react";

import { Brand } from "@/components/brand";

export function UpdatePasswordScreen() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    const confirmation = String(form.get("confirmation") || "");
    if (password !== confirmation) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/update-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const payload = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) throw new Error(payload.message || "No pude actualizar la contraseña.");
      router.push("/");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No pude actualizar la contraseña.");
      setBusy(false);
    }
  }

  return (
    <main className="login-page auth-entry auth-entry--single">
      <div className="login-page__brand"><Brand /></div>
      <section className="login-copy auth-entry__panel">
        <span className="login-copy__eyebrow">Acceso</span>
        <h1>Elegí una contraseña nueva.</h1>
        <p>Usá al menos 8 caracteres. Después vas a volver a tu espacio.</p>
        <form className="login-form auth-entry__form" onSubmit={submit}>
          <label><span>Nueva contraseña</span><div className="auth-entry__input"><KeyRound size={18} /><input name="password" type="password" autoComplete="new-password" minLength={8} required disabled={busy} /></div></label>
          <label><span>Repetir contraseña</span><div className="auth-entry__input"><KeyRound size={18} /><input name="confirmation" type="password" autoComplete="new-password" minLength={8} required disabled={busy} /></div></label>
          <button className="button button--primary login-button" type="submit" disabled={busy}>{busy ? "Guardando…" : "Guardar contraseña"}<ArrowRight size={19} /></button>
        </form>
        {error ? <p className="login-error" role="alert">{error}</p> : null}
      </section>
    </main>
  );
}
