import type { NudgeComposer } from "./ports";
import type {
  ComposedNudge,
  PersistedNudge,
  ProactivitySnapshot,
} from "./types";
import {
  humanizeNotificationCopy,
  humanizeWorkflowStatus,
} from "./copy";

export class NaturalNudgeComposer implements NudgeComposer {
  async compose(
    nudge: PersistedNudge,
    snapshot: ProactivitySnapshot,
  ): Promise<ComposedNudge> {
    const client = String(nudge.facts.clientName ?? "").trim();
    const title = String(nudge.facts.title ?? nudge.title);
    const body = humanizeNotificationCopy(
      composeBody(nudge, snapshot, client, title),
    );
    return {
      title: nudge.kind === "morning_briefing" ? "Buen día, Martu" : "Martu OS",
      body,
      deepLink: nudge.deepLink,
      tag: nudge.dedupeKey,
      data: {
        nudgeId: nudge.id,
        kind: nudge.kind,
        clientSlug: nudge.clientSlug,
        entityType: nudge.entityType,
        entityId: nudge.entityId,
        deepLink: nudge.deepLink,
        quickActions: nudge.quickActions,
      },
    };
  }
}

function composeBody(
  nudge: PersistedNudge,
  snapshot: ProactivitySnapshot,
  client: string,
  title: string,
): string {
  const withClient = client ? ` de ${client}` : "";
  switch (String(nudge.kind)) {
    case "commitment_due":
      return `Martu, dijiste que hoy cerrabas “${title}”${withClient} y sigue abierto. ¿Qué hacemos?`;
    case "reminder_due":
      return `Te lo recuerdo como pediste: “${title}”${withClient}.`;
    case "task_overdue":
      return `“${title}”${withClient} ya venció y sigue abierto. ¿Lo cerrás, lo pasamos o lo sacamos del medio?`;
    case "task_due_soon":
      return `“${title}”${withClient} vence pronto. Yo no lo patearía sin decidirlo.`;
    case "task_stale":
      return `“${title}”${withClient} lleva varios días quieto. ¿Sigue siendo real o lo limpiamos?`;
    case "content_stalled":
      return `“${title}”${withClient} quedó ${humanizeWorkflowStatus(nudge.facts.status)}. ¿Qué lo está frenando?`;
    case "meeting_action_open":
      return `Quedó un compromiso de reunión sin cerrar${withClient}: “${title}”.`;
    case "missing_brief":
      return `${client} todavía no tiene el brief completo. No te frena hoy, pero no lo dejemos invisible.`;
    case "missing_strategy":
      return `${client} tiene estrategia dentro del servicio y falta completar la base. Lo agendamos cuando haya aire.`;
    case "metric_opportunity":
      return `${client}: apareció una señal para probar. ${String(nudge.facts.evidence ?? title)} Es una hipótesis, no causalidad.`;
    case "open_loop_resurface":
      return `Quedó abierto “${title}”${withClient}. No tiene fecha inventada: lo traigo de vuelta porque sigue siendo relevante. ¿Lo retomamos o lo archivamos?`;
    case "morning_briefing": {
      const overdue = Number(nudge.facts.overdue ?? 0);
      return overdue > 0
        ? `Hoy hay ${overdue} cosa${overdue === 1 ? "" : "s"} vencida${overdue === 1 ? "" : "s"}. Arranquemos por lo que más cuesta patear.`
        : "Hoy hay pocas cosas que de verdad importan. Te marqué primero lo que no patearía.";
    }
    case "midday_check": {
      const open = Number(nudge.facts.openTasks ?? snapshot.tasks.length);
      return open > 0
        ? `Chequeo sin ceremonia: quedan ${open} frentes abiertos. ¿Cuál cerramos antes de seguir agregando?`
        : "Chequeo de mitad de día: no veo pendientes abiertos. Milagro administrativo.";
    }
    case "end_of_day":
      return "Antes de cortar: ¿qué quedó realmente hecho y qué estamos pasando conscientemente a mañana?";
    default:
      // Keep seeded/legacy nudges deliverable while their kind is migrated. Their
      // stored copy is intentional product content, so it is a better fallback
      // than dropping the whole scheduler tick.
      return nudge.message?.trim() || `${title}${withClient}.`;
  }
}
