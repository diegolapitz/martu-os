import type { AgentContext, AgentToolName, AgentTurnPlan, ToolCall } from "./types";

const EXISTING_TARGET_TOOLS = new Set<AgentToolName>(["complete_task", "change_deadline", "update_content_status"]);

export class AgentToolPolicyError extends Error {
  constructor(message = "Esa acción no está habilitada para este pedido.") {
    super(message);
    this.name = "AgentToolPolicyError";
  }
}

export interface ServiceScopeDecision {
  allowed: boolean;
  message?: string;
}

export function evaluateServiceScope(plan: AgentTurnPlan, context: AgentContext): ServiceScopeDecision {
  if (!plan.requiredServices?.length) return { allowed: true };
  const client = context.currentClient;
  if (!client) {
    return { allowed: false, message: `¿De qué cliente querés revisar ${plan.serviceLabel ?? "eso"}?` };
  }
  const active = new Set(client.services ?? []);
  if (plan.requiredServices.some((service) => active.has(service))) return { allowed: true };
  if (plan.serviceLabel === "pauta") {
    return { allowed: false, message: `A ${client.name} no le manejás pauta, así que no tengo ROAS para ese cliente.` };
  }
  if (plan.serviceLabel === "métricas") {
    return { allowed: false, message: `A ${client.name} no le llevás métricas, así que no tengo ese análisis para mostrarte.` };
  }
  return { allowed: false, message: `${client.name} no tiene contratado ${plan.serviceLabel ?? "ese servicio"}.` };
}

export function authorizeToolCall(plan: AgentTurnPlan, context: AgentContext, call: ToolCall): ToolCall {
  if (!plan.allowedTools.includes(call.name)) throw new AgentToolPolicyError();
  const scope = evaluateServiceScope(plan, context);
  if (!scope.allowed) throw new AgentToolPolicyError(scope.message);

  const args = { ...call.arguments };
  if (plan.clientSlug) {
    if (typeof args.clientSlug === "string" && args.clientSlug !== plan.clientSlug) {
      throw new AgentToolPolicyError("La acción apuntaba a otro cliente y fue bloqueada.");
    }
    args.clientSlug = plan.clientSlug;
  }

  if (plan.entity && EXISTING_TARGET_TOOLS.has(call.name)) {
    if (typeof args.targetId === "string" && args.targetId !== plan.entity.id) {
      throw new AgentToolPolicyError("La acción apuntaba a otro elemento y fue bloqueada.");
    }
    args.targetId = plan.entity.id;
    if (["task", "script", "content", "commitment"].includes(plan.entity.type)) {
      if (typeof args.targetType === "string" && args.targetType !== plan.entity.type) {
        throw new AgentToolPolicyError("El tipo de elemento no coincide con el contexto abierto.");
      }
      args.targetType = plan.entity.type;
    }
  }

  return { ...call, arguments: args };
}

export function safeToolError(error: unknown): string {
  if (error instanceof AgentToolPolicyError) return error.message;
  const message = error instanceof Error ? error.message : "La acción falló.";
  if (/no encontr[eé].*inequ[ií]voco|falta indicar qu[eé] elemento/i.test(message)) {
    return "No encontré un único elemento para cambiar. Decime cuál.";
  }
  return "No pude completar ese cambio. No se modificó nada.";
}
