import { z } from "zod";

import type { AgentToolExecutor } from "@/server/agent/ports";
import type { AgentActionReceipt } from "@/server/agent/types";

import type { PersistedNudge } from "./types";

export const nudgeActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("do_now"), nudgeId: z.string().min(1) }),
  z.object({ action: z.literal("complete"), nudgeId: z.string().min(1) }),
  z.object({ action: z.literal("reschedule"), nudgeId: z.string().min(1), dueAt: z.string().datetime({ offset: true }) }),
  z.object({ action: z.literal("snooze"), nudgeId: z.string().min(1), until: z.string().datetime({ offset: true }) }),
  z.object({ action: z.literal("dismiss"), nudgeId: z.string().min(1) }),
  z.object({ action: z.literal("reduce_insistence"), nudgeId: z.string().min(1) }),
  z.object({ action: z.literal("undo"), undoToken: z.string().min(1), threadId: z.string().optional(), clientSlug: z.string().optional() }),
]);

export type NudgeActionInput = z.infer<typeof nudgeActionSchema>;

export interface NudgeActionGateway {
  getNudge(id: string): Promise<PersistedNudge | undefined>;
  markActed(id: string, metadata?: Record<string, unknown>): Promise<void>;
  dismiss(id: string, reason?: string): Promise<void>;
  snooze(id: string, until: Date): Promise<void>;
}

export class NudgeActionService {
  constructor(
    private readonly gateway: NudgeActionGateway,
    private readonly agentTools: AgentToolExecutor,
  ) {}

  async execute(raw: unknown): Promise<AgentActionReceipt> {
    const input = nudgeActionSchema.parse(raw);
    const now = new Date();
    if (input.action === "undo") {
      const undone = await this.agentTools.undo(input.undoToken, {
        threadId: input.threadId ?? "system",
        clientSlug: input.clientSlug,
        source: "web",
        now,
      });
      if (!undone) throw new Error("Ese cambio ya no se puede deshacer.");
      return undone;
    }

    const nudge = await this.gateway.getNudge(input.nudgeId);
    if (!nudge) throw new Error("No encontré esa notificación.");
    const context = {
      threadId: "system",
      clientSlug: nudge.clientSlug ?? undefined,
      source: "system" as const,
      now,
    };

    if (input.action === "do_now") {
      await this.gateway.markActed(nudge.id, { action: "do_now" });
      return { type: "nudge_do_now", summary: `Dale. Abrí “${nudge.title}” y no te la vuelvo a duplicar ahora.` };
    }
    if (input.action === "dismiss") {
      await this.gateway.dismiss(nudge.id, "user_dismissed");
      return { type: "nudge_dismiss", summary: "Listo, descarté este aviso." };
    }
    if (input.action === "snooze") {
      await this.gateway.snooze(nudge.id, new Date(input.until));
      return { type: "nudge_snooze", summary: "Listo, te lo vuelvo a traer más tarde." };
    }
    if (input.action === "reduce_insistence") {
      const receipt = await this.agentTools.execute({
        callId: `nudge-${nudge.id}`,
        name: "update_communication_profile",
        arguments: { insistenceLevel: 0.2, preferenceKey: "reduced_from_nudge", preferenceValue: true },
      }, context);
      await this.gateway.dismiss(nudge.id, "reduced_insistence");
      return receipt;
    }
    if (input.action === "reschedule") {
      const receipt = await this.agentTools.execute({
        callId: `nudge-${nudge.id}`,
        name: "change_deadline",
        arguments: {
          targetType: targetType(nudge),
          targetId: nudge.entityId ?? null,
          clientSlug: nudge.clientSlug ?? null,
          ordinal: null,
          query: nudge.title,
          dueAt: input.dueAt,
        },
      }, context);
      await this.gateway.markActed(nudge.id, { action: "reschedule", dueAt: input.dueAt });
      return receipt;
    }

    const receipt = await this.agentTools.execute({
      callId: `nudge-${nudge.id}`,
      name: "complete_task",
      arguments: {
        targetType: targetType(nudge),
        targetId: nudge.entityId ?? null,
        clientSlug: nudge.clientSlug ?? null,
        ordinal: null,
        query: nudge.title,
      },
    }, context);
    await this.gateway.markActed(nudge.id, { action: "complete" });
    return receipt;
  }
}

function targetType(nudge: PersistedNudge): "task" | "script" | "content" | "commitment" {
  if (["task", "script", "content", "commitment"].includes(String(nudge.entityType))) {
    return nudge.entityType as "task" | "script" | "content" | "commitment";
  }
  if (nudge.kind === "commitment_due") return "commitment";
  if (nudge.kind === "content_stalled") return "content";
  return "task";
}
