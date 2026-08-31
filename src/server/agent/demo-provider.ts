import { parseDemoIntent } from "./intents";
import type { AgentModelInput, AgentModelProvider, AgentModelResult } from "./ports";
import type { AgentActionReceipt, ToolCall } from "./types";

export class DemoAgentProvider implements AgentModelProvider {
  readonly mode = "demo" as const;

  async generate(input: AgentModelInput): Promise<AgentModelResult> {
    const intent = parseDemoIntent(input.request.message, {
      clients: input.context.clients,
      currentClientSlug: input.context.currentClient?.slug ?? input.request.clientSlug,
      lastReferencedEntity: input.context.lastReferencedEntity,
      now: input.request.now,
    });
    const actions: AgentActionReceipt[] = [];
    const execute = async (name: ToolCall["name"], args: Record<string, unknown>) => {
      if (!input.plan.allowedTools.includes(name)) throw new Error("Esa acción no está habilitada para este pedido.");
      const receipt = await input.executeTool(
        { callId: `demo-${crypto.randomUUID()}`, name, arguments: args },
        input.mutationContext,
      );
      actions.push(receipt);
      return receipt;
    };

    switch (intent.type) {
      case "reschedule": {
        const action = await execute("change_deadline", {
          targetType: intent.entityType,
          targetId: input.context.lastReferencedEntity?.id ?? null,
          clientSlug: intent.clientSlug ?? null,
          ordinal: intent.ordinal ?? null,
          query: intent.query ?? null,
          dueAt: intent.dueAt,
        });
        return result(`${action.summary} Si te arrepentís, lo podés deshacer.`, "supervisor", actions);
      }
      case "commitment": {
        const action = await execute("create_commitment", {
          clientSlug: intent.clientSlug ?? null,
          intent: intent.intent,
          targetType: intent.entityType,
          targetId: null,
          ordinal: intent.ordinal ?? null,
          query: intent.intent,
          dueAt: intent.dueAt,
          remindAt: intent.remindAt ?? null,
        });
        const clientName = input.context.clients.find((client) => client.slug === intent.clientSlug)?.name;
        const subject = action.entity?.title || (clientName ? `eso de ${clientName}` : "eso");
        return result(
          `Listo. Registré que vas a cerrar “${subject}” y te voy a avisar si sigue abierto cuando llegue el momento.`,
          "supervisor",
          actions,
        );
      }
      case "complete": {
        const action = await execute("complete_task", {
          targetType: intent.entityType,
          clientSlug: intent.clientSlug ?? null,
          ordinal: intent.ordinal ?? null,
          query: intent.query ?? null,
          targetId: null,
        });
        return result(`${action.summary} Bien, una menos.`, "supervisor", actions);
      }
      case "create_note": {
        const action = await execute("create_note", {
          clientSlug: intent.clientSlug ?? null,
          body: intent.body,
          tags: null,
        });
        return result(action.summary, "supervisor", actions);
      }
      case "create_idea": {
        const action = await execute("create_idea", {
          clientSlug: intent.clientSlug ?? null,
          title: intent.title,
          description: intent.description ?? null,
          tags: null,
        });
        return result(action.summary, "creative", actions);
      }
      case "create_task": {
        const action = await execute("create_task", {
          clientSlug: intent.clientSlug ?? null,
          title: intent.title,
          description: null,
          dueAt: intent.dueAt ?? null,
          priority: "medium",
        });
        return result(action.summary, "supervisor", actions);
      }
      case "save_memory": {
        const action = await execute("save_memory", {
          clientSlug: intent.clientSlug ?? null,
          scope: intent.scope,
          category: intent.category,
          content: intent.content,
          importance: 0.8,
        });
        return result(action.summary, "supervisor", actions);
      }
      case "reduce_insistence": {
        await execute("update_communication_profile", {
          insistenceLevel: 0.2,
          preferenceKey: "reduced_from_chat",
          preferenceValue: true,
        });
        return result("Listo. Bajo la insistencia y dejo de empujarte con este tono.", "supervisor", actions);
      }
      case "pending":
        return result(pendingReply(input, intent.clientSlug), "supervisor", actions);
      case "memory_question":
        return result(memoryReply(input, intent.clientSlug, intent.topic), "strategist", actions);
      case "metrics_question":
        return result(metricsReply(input, intent.clientSlug), "analyst", actions);
      case "ads_question":
        return result(adsReply(input, intent.clientSlug), "analyst", actions);
      case "smalltalk":
        return result(defaultReply(input), "supervisor", actions);
    }
  }
}

function result(
  message: string,
  capability: AgentModelResult["capability"],
  actions: AgentActionReceipt[],
): AgentModelResult {
  return { message, capability, actions };
}

function scopedClientName(input: AgentModelInput, slug?: string): string | undefined {
  return input.context.clients.find((client) => client.slug === slug)?.name ?? input.context.currentClient?.name;
}

function pendingReply(input: AgentModelInput, slug?: string): string {
  const effectiveSlug = slug ?? input.context.currentClient?.slug;
  const scopedTasks = input.context.tasks
    .filter((item) => !effectiveSlug || item.clientSlug === effectiveSlug)
    .filter((item) => !["done", "completed", "published", "delivered", "aprobado", "entregado"].includes(String(item.status).toLocaleLowerCase("es-AR")));
  const scopedScripts = input.context.scripts
    .filter((item) => !effectiveSlug || item.clientSlug === effectiveSlug)
    .filter((item) => !["done", "completed", "approved", "archived", "aprobado", "entregado"].includes(String(item.status).toLocaleLowerCase("es-AR")));
  const items = (scopedTasks.length ? scopedTasks : scopedScripts)
    .sort((a, b) => (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999"))
    .slice(0, 4);
  const client = scopedClientName(input, effectiveSlug);
  if (!items.length) return client ? `No veo pendientes abiertos de ${client}.` : "No veo pendientes abiertos ahora mismo.";
  const list = items.map((item, index) => `${index + 1}. ${item.title}${item.dueAt ? `, ${shortDate(item.dueAt)}` : ""}`).join("\n");
  return `${client ? `Con ${client}` : "Ahora"}, yo pondría el foco acá:\n${list}`;
}

function memoryReply(input: AgentModelInput, slug: string | undefined, topic: string): string {
  const normalizedTopic = topic.toLocaleLowerCase("es-AR");
  const client = input.context.clients.find((item) => item.slug === slug) ?? input.context.currentClient;
  const isVideoDecision = /cort|duracion|video|reel|formato/.test(normalizedTopic);
  const relevant = input.context.memories
    .filter((memory) => !client || !memory.clientId || memory.clientId === client.id)
    .filter((memory) => {
      const content = memory.content.toLocaleLowerCase("es-AR");
      return normalizedTopic.split(/\s+/).some((word) => word.length > 4 && content.includes(word)) ||
        (/cort|duracion|video/.test(normalizedTopic) && /cort|duracion|retencion|institucional/.test(content));
    })
    .map((memory) => {
      const content = memory.content.toLocaleLowerCase("es-AR");
      const clientScore = client && memory.clientId === client.id ? 20 : 0;
      const domainScore = isVideoDecision && /video|reel|vertical|retencion|institucional|formato/.test(content) ? 12 : 0;
      const tokenScore = normalizedTopic.split(/\s+/).filter((word) => word.length > 4 && content.includes(word)).length;
      return { memory, score: clientScore + domainScore + tokenScore + memory.importance };
    })
    .sort((a, b) => b.score - a.score)
    .map(({ memory }) => memory);
  if (relevant[0]) return `Lo habíamos decidido por esto: ${relevant[0].content}`;
  if (client?.slug === "gavilan") {
    return "La decisión registrada fue probar piezas más cortas y entrar antes al punto: los reels institucionales largos perdían atención, mientras que los hooks concretos de escapadas sostenían mejor la retención. Es una hipótesis de trabajo, no causalidad demostrada.";
  }
  return "No tengo una decisión guardada que alcance para responderte sin inventar. Si me das una pista, la buscamos o la anotamos bien.";
}

function metricsReply(input: AgentModelInput, slug?: string): string {
  const client = scopedClientName(input, slug) ?? "este cliente";
  const sample = input.context.metrics.find((metric) => !slug || metric.clientSlug === slug) ?? input.context.metrics[0];
  if (!sample) return `No tengo métricas cargadas para ${client}. No te voy a fabricar una conclusión.`;
  const compact = compactMetrics(sample);
  return `Mi hipótesis para ${client}: repetí el patrón del contenido con mejor arranque, pero cambiando una sola variable, el hook, para poder comparar. La señal disponible (${compact}) orienta el experimento; no demuestra por sí sola qué causó el resultado.`;
}

function adsReply(input: AgentModelInput, slug?: string): string {
  const client = scopedClientName(input, slug) ?? "este cliente";
  const campaign = input.context.campaigns.find((item) => !slug || item.clientSlug === slug) ?? input.context.campaigns[0];
  if (!campaign) return `No hay campañas demo cargadas para ${client}; y Meta sigue sin conectar, así que no voy a fingir datos.`;
  const compact = compactCampaign(campaign);
  return `Para ${client}, haría una prueba controlada: conservaría el anuncio que sostiene el mejor resultado, duplicaría sólo el ángulo creativo y no tocaría presupuesto y audiencia al mismo tiempo. Datos demo que estoy mirando: ${compact}. Antes de mover plata real, habría que validar en Meta.`;
}

function compactMetrics(sample: Record<string, unknown>): string {
  const fields: Array<[string, string, string]> = [
    ["reach", "alcance", ""], ["views", "reproducciones", ""],
    ["retention_rate", "retención", "%"], ["saves", "guardados", ""],
    ["shares", "compartidos", ""], ["inquiries", "consultas", ""],
  ];
  const values = fields.flatMap(([key, label, suffix]) => typeof sample[key] === "number" ? [`${label}: ${formatNumber(Number(sample[key]), key === "retention_rate" ? 100 : 1)}${suffix}`] : []);
  const title = typeof sample.title === "string" ? `“${sample.title}”` : "el contenido destacado";
  return [title, ...values.slice(0, 3)].join(" · ");
}

function compactCampaign(campaign: Record<string, unknown>): string {
  const name = typeof campaign.name === "string" ? `“${campaign.name}”` : "campaña activa";
  const values: string[] = [];
  if (typeof campaign.spend === "number") values.push(`inversión: $ ${formatNumber(campaign.spend)}`);
  if (typeof campaign.ctr === "number") values.push(`CTR: ${formatNumber(campaign.ctr, 100)}%`);
  if (typeof campaign.cpa === "number") values.push(`CPA: $ ${formatNumber(campaign.cpa)}`);
  if (typeof campaign.roas === "number") values.push(`ROAS: ${formatNumber(campaign.roas)}x`);
  return [name, ...values.slice(0, 3)].join(" · ");
}

function formatNumber(value: number, multiplier = 1): string {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(value * multiplier);
}

function defaultReply(input: AgentModelInput): string {
  const currentViewReply = replyForCurrentView(input);
  if (currentViewReply) return currentViewReply;
  const urgent = input.context.tasks
    .filter((item) => item.status !== "done")
    .sort((a, b) => (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999"))[0];
  if (urgent) return `Te leo. Y ya que estoy haciendo de jefa: “${urgent.title}” es lo próximo que no patearía. ¿Querés que lo resolvamos o lo reprogramo conscientemente?`;
  return "Te leo, Martu. Decime qué querés ordenar, pensar o mover y lo hacemos.";
}

function replyForCurrentView(input: AgentModelInput): string | undefined {
  const message = input.request.message
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-AR");
  if (!/\b(?:esto|eso|aca|aqui|esta idea|este guion|este contenido|lo que estoy viendo|como sigo)\b/.test(message)) return undefined;
  const view = input.context.currentView;
  const item = input.context.currentViewItem;
  const title = item?.title ?? view?.entityTitle;
  if (!title || !view?.entityType) return undefined;
  if (view.entityType === "idea") {
    const startingPoint = item?.body?.trim()
      ? ` Ya tenés esta base: ${item.body.trim().slice(0, 180)}.`
      : "";
    return `Sobre “${title}”: la bajaría a una primera pieza concreta. Elegí una escena, definí el hook y cerrá qué querés que haga quien la vea.${startingPoint}`;
  }
  if (view.entityType === "script") {
    return `Sobre “${title}”: revisaría primero si el hook promete algo claro y después haría que cada bloque empuje esa misma idea hasta el cierre.`;
  }
  if (view.entityType === "content") {
    return `Sobre “${title}”: definiría la próxima decisión pendiente de la pieza y movería sólo eso, sin abrir trabajo paralelo.`;
  }
  return `Sobre “${title}”: decime qué parte te está trabando y seguimos desde ese punto concreto.`;
}

function shortDate(value: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    weekday: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
