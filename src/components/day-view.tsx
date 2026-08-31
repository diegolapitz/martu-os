"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  Check,
  ChevronRight,
  Circle,
  Clock3,
  Plus,
} from "lucide-react";
import { ClientMark, SunMark } from "@/components/brand";
import { announceFeedback, Feedback, SectionTitle } from "@/components/ui";
import type { DayData } from "@/components/types";
import { clientAccent, ObjectTypeIcon } from "@/components/visual-grammar";

function formatDay(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const text = new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(parsed);
  return text.slice(0, 1).toUpperCase() + text.slice(1);
}

function openAi() {
  window.dispatchEvent(new Event("martu:open-ai"));
}

export function DayView({ data }: { data: DayData }) {
  const router = useRouter();
  const [capture, setCapture] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(() => new Set());
  const [updating, setUpdating] = useState<Set<string>>(() => new Set());
  const priorities = data.priorities
    .filter((item) => item.id !== data.spotlight?.workId)
    .slice(0, 3);
  const agenda = data.agenda.slice(0, 4);
  const spotlight = data.spotlight;
  const shownWorkTitles = [
    ...priorities.map((item) => item.title),
    ...(spotlight ? [data.supervisorMessage] : []),
  ].map((value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es"));
  const attention = data.clientsNeedingAttention.filter((client) => {
    const detail = `${client.reason} ${client.detail || ""}`
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("es");
    return !shownWorkTitles.some((title) => title.length > 8 && detail.includes(title));
  });
  const actionCount = priorities.length + (spotlight ? 1 : 0);

  async function submitCapture(event: FormEvent) {
    event.preventDefault();
    const message = capture.trim();
    if (!message || saving) return;
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/work", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: message,
          status: "pending",
          priority: "medium",
          bucket: "today",
          kind: "task",
        }),
      });
      if (!response.ok) throw new Error("No pude guardar eso todavía.");
      setCapture("");
      setFeedback("Anotado en Trabajo para hoy.");
      announceFeedback("Anotado en Trabajo para hoy.");
      window.setTimeout(() => router.refresh(), 450);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No pude guardar eso todavía.";
      setFeedback(message);
      announceFeedback(message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function toggleDone(id: string) {
    const willComplete = !done.has(id);
    setDone((current) => {
      const next = new Set(current);
      if (willComplete) next.add(id);
      else next.delete(id);
      return next;
    });
    setUpdating((current) => new Set(current).add(id));
    setFeedback(null);
    try {
      const response = await fetch(`/api/work/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: willComplete ? "completed" : "pending",
        }),
      });
      if (!response.ok) throw new Error("No pude actualizar esa tarea.");
      setFeedback(
        willComplete
          ? "Tarea completada. Bien, una menos."
          : "Tarea reabierta.",
      );
      window.setTimeout(() => router.refresh(), 450);
    } catch (error) {
      setDone((current) => {
        const next = new Set(current);
        if (willComplete) next.delete(id);
        else next.add(id);
        return next;
      });
      setFeedback(
        error instanceof Error
          ? error.message
          : "No pude actualizar esa tarea.",
      );
    } finally {
      setUpdating((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }

  async function moveSpotlightToTomorrow() {
    if (!spotlight || updating.has(spotlight.workId)) return;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    setUpdating((current) => new Set(current).add(spotlight.workId));
    setFeedback(null);
    try {
      const response = await fetch(`/api/work/${spotlight.workId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dueAt: tomorrow.toISOString(), bucket: "next" }),
      });
      if (!response.ok) throw new Error("No pude mover ese trabajo.");
      setFeedback("Listo, quedó para mañana a las 10:00.");
      announceFeedback("Trabajo movido a mañana.");
      window.setTimeout(() => router.refresh(), 450);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No pude mover ese trabajo.";
      setFeedback(message);
      announceFeedback(message, "error");
    } finally {
      setUpdating((current) => {
        const next = new Set(current);
        next.delete(spotlight.workId);
        return next;
      });
    }
  }

  return (
    <div className="day-layout">
      <section className="day-main">
        <header className="page-heading page-heading--day">
          <p>{formatDay(data.date)}</p>
          <h1 data-testid="day-heading">
            {data.greeting || "Buen día, Martu."}
          </h1>
          <span>
            {actionCount
              ? `Hay ${actionCount} ${actionCount === 1 ? "frente" : "frentes"} que conviene sacar hoy.`
              : "El día está despejado para elegir el próximo frente."}
          </span>
        </header>

        <section className="supervisor-callout" aria-labelledby="day-now-title">
          <div className="supervisor-callout__mark">
            <ClientMark name={spotlight?.clientName || "Martu"} accent={clientAccent(spotlight?.clientSlug, spotlight?.clientName)} large />
          </div>
          <div className="supervisor-callout__copy"><span id="day-now-title">Ahora{spotlight?.clientName ? ` · ${spotlight.clientName}` : ""}</span><blockquote>{data.supervisorMessage}</blockquote></div>
          <div className="supervisor-callout__actions">
            <Link
              className="button button--primary button--small"
              href={spotlight?.targetPath || "/work"}
              prefetch={false}
            >
              {spotlight?.actionLabel || "Abrir trabajo"}
            </Link>
            {spotlight ? (
              <button
                className="button button--secondary button--small"
                type="button"
                onClick={() => void moveSpotlightToTomorrow()}
                disabled={updating.has(spotlight.workId)}
              >
                Mover a mañana
              </button>
            ) : null}
          </div>
        </section>

        <section className="priority-section" data-testid="priority-list">
          <SectionTitle>Lo que hay que sacar hoy</SectionTitle>
          <div className="priority-list">
            {priorities.map((priority, index) => {
              const complete = done.has(priority.id);
              const href = priority.targetPath || `/work?item=${priority.id}`;
              return (
                <article
                  className={
                    index === 0 ? "priority-row is-primary" : "priority-row"
                  }
                  key={priority.id}
                >
                  <span className="priority-row__number">{index + 1}</span>
                  <button
                    className={
                      complete ? "check-button is-checked" : "check-button"
                    }
                    type="button"
                    onClick={() => void toggleDone(priority.id)}
                    disabled={updating.has(priority.id)}
                    aria-label={
                      complete
                        ? `Reabrir ${priority.title}`
                        : `Completar ${priority.title}`
                    }
                  >
                    {complete ? (
                      <Check size={19} />
                    ) : (
                      <Circle size={29} strokeWidth={1.3} />
                    )}
                  </button>
                  <div className="priority-row__copy">
                    <strong className={complete ? "is-done" : ""}>
                      <ObjectTypeIcon type={priority.entityType} size={16} />
                      {priority.title}
                    </strong>
                    <div>
                      <span className={/venci|venc|atras/i.test(priority.dueLabel || "") ? "due due--urgent" : "due"}>
                        <CalendarDays size={13} />
                        {priority.dueLabel || "Hoy"}
                      </span>
                      {priority.clientName ? (
                        <span>
                          <ClientMark name={priority.clientName} accent={clientAccent(priority.clientSlug, priority.clientName)} />
                          {priority.clientName}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <Link
                    href={href}
                    prefetch={false}
                    aria-label={`Abrir ${priority.title}`}
                  >
                    <ChevronRight size={20} />
                  </Link>
                </article>
              );
            })}
          </div>
        </section>

        <form className="quick-capture" onSubmit={submitCapture}>
          <Plus size={24} />
          <input
            value={capture}
            onChange={(event) => setCapture(event.target.value)}
            placeholder="Anotá algo…"
            aria-label="Captura rápida"
            data-testid="quick-capture"
          />
          <button
            className="capture-submit"
            type="submit"
            disabled={!capture.trim() || saving}
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </form>
        <Feedback message={feedback} />
      </section>

      <aside className="day-rail">
        <section>
          <SectionTitle icon={<CalendarDays size={18} />}>
            Agenda de hoy
          </SectionTitle>
          <div className="timeline timeline--agenda">
            {agenda.map((item) => (
              <Link
                href={item.targetPath || "/calendar"}
                prefetch={false}
                key={item.id}
              >
                <article
                  className={`timeline-row tone-${item.tone || "neutral"}`}
                >
                  <i />
                  <time>{item.time}</time>
                  <strong>{item.title}</strong>
                  <p>{item.subtitle || item.clientName}</p>
                </article>
              </Link>
            ))}
          </div>
        </section>
        <section className="attention-section">
          <SectionTitle>Bloqueos y decisiones</SectionTitle>
          <div className="attention-list">
            {attention.map((client) => (
              <Link
                href={client.targetPath || `/clients/${client.slug}`}
                className="attention-row"
                prefetch={false}
                key={client.id}
              >
                <ClientMark name={client.name} accent={clientAccent(client.slug, client.name)} />
                <div>
                  <strong>{client.name}</strong>
                  <span>{client.reason}</span>
                  <small>{client.detail}</small>
                </div>
                <ChevronRight size={18} />
              </Link>
            ))}
          </div>
          <Link className="text-link" href="/clients" prefetch={false}>
            Ver todos los clientes <ChevronRight size={15} />
          </Link>
        </section>
        <button
          className="quiet-ai"
          type="button"
          onClick={openAi}
          data-testid="ai-open"
        >
          <SunMark size={20} />
          <span>Abrir Supervisora</span>
          <Clock3 size={15} />
        </button>
      </aside>
    </div>
  );
}
