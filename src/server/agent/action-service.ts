import { z } from "zod";

import type { AgentMutationGateway, AgentToolExecutor, ResolvedEntity } from "./ports";
import type { AgentActionReceipt, AgentToolName, ToolCall } from "./types";

const nullableString = z.string().trim().min(1).nullable().optional();
const nullableNumber = z.coerce.number().int().positive().nullable().optional();

const schemas = {
  create_task: z.object({
    clientSlug: nullableString,
    title: z.string().trim().min(1),
    description: nullableString,
    dueAt: nullableString,
    priority: z.enum(["low", "medium", "high", "urgent"]).nullable().optional(),
  }),
  complete_task: z.object({
    targetType: z.enum(["task", "script", "content", "commitment"]),
    targetId: nullableString,
    clientSlug: nullableString,
    ordinal: nullableNumber,
    query: nullableString,
  }),
  change_deadline: z.object({
    targetType: z.enum(["task", "script", "content", "commitment"]),
    targetId: nullableString,
    clientSlug: nullableString,
    ordinal: nullableNumber,
    query: nullableString,
    dueAt: z.string().datetime({ offset: true }),
  }),
  create_note: z.object({
    clientSlug: nullableString,
    body: z.string().trim().min(1),
    tags: z.array(z.string()).nullable().optional(),
  }),
  create_idea: z.object({
    clientSlug: nullableString,
    title: z.string().trim().min(1),
    description: nullableString,
    tags: z.array(z.string()).nullable().optional(),
  }),
  create_open_loop: z.object({
    clientSlug: nullableString,
    title: z.string().trim().min(1),
    body: nullableString,
    kind: z.enum(["idea", "hypothesis", "topic", "later"]).nullable().optional(),
    salience: z.coerce.number().int().min(1).max(5).nullable().optional(),
  }),
  create_script_draft: z.object({
    clientSlug: nullableString,
    title: z.string().trim().min(1),
    format: nullableString,
    objective: nullableString,
    hook: nullableString,
    body: nullableString,
    cta: nullableString,
  }),
  update_content_status: z.object({
    targetId: nullableString,
    clientSlug: nullableString,
    ordinal: nullableNumber,
    query: nullableString,
    status: z.string().trim().min(1),
  }),
  create_commitment: z.object({
    clientSlug: nullableString,
    intent: z.string().trim().min(1),
    targetType: z.enum(["task", "script", "content"]).nullable().optional(),
    targetId: nullableString,
    ordinal: nullableNumber,
    query: nullableString,
    dueAt: z.string().datetime({ offset: true }),
    remindAt: nullableString,
  }),
  save_memory: z.object({
    clientSlug: nullableString,
    scope: z.enum(["global", "client"]),
    category: z.string().trim().min(1),
    content: z.string().trim().min(1),
    importance: z.coerce.number().min(0).max(1).nullable().optional(),
  }),
  update_communication_profile: z.object({
    insistenceLevel: z.coerce.number().min(0).max(1).nullable().optional(),
    quietHoursStart: nullableString,
    quietHoursEnd: nullableString,
    preferredLength: z.enum(["short", "medium", "long"]).nullable().optional(),
    preferenceKey: nullableString,
    preferenceValue: z.unknown().optional(),
  }),
} satisfies Record<AgentToolName, z.ZodType>;

export class AgentActionService implements AgentToolExecutor {
  constructor(private readonly gateway: AgentMutationGateway) {}

  async execute(call: ToolCall, context: Parameters<AgentToolExecutor["execute"]>[1]): Promise<AgentActionReceipt> {
    const parsed = schemas[call.name].parse(call.arguments) as Record<string, unknown>;
    switch (call.name) {
      case "create_task":
        return this.createTask(parsed, context);
      case "complete_task":
        return this.complete(parsed, context);
      case "change_deadline":
        return this.changeDeadline(parsed, context);
      case "create_note":
        return this.createNote(parsed, context);
      case "create_idea":
        return this.createIdea(parsed, context);
      case "create_open_loop":
        return this.createOpenLoop(parsed, context);
      case "create_script_draft":
        return this.createScript(parsed, context);
      case "update_content_status":
        return this.updateContentStatus(parsed, context);
      case "create_commitment":
        return this.createCommitment(parsed, context);
      case "save_memory":
        return this.saveMemory(parsed, context);
      case "update_communication_profile":
        return this.updateProfile(parsed, context);
    }
  }

  undo(token: string, context: Parameters<AgentToolExecutor["undo"]>[1]) {
    return this.gateway.undo(token, context);
  }

  private clientSlug(args: Record<string, unknown>, fallback?: string): string | undefined {
    return (typeof args.clientSlug === "string" ? args.clientSlug : undefined) ?? fallback;
  }

  private async resolveTarget(
    args: Record<string, unknown>,
    fallbackClientSlug: string | undefined,
    defaultType?: "task" | "script" | "content" | "commitment",
  ): Promise<ResolvedEntity> {
    const type = (args.targetType as "task" | "script" | "content" | "commitment" | undefined) ?? defaultType;
    if (!type) throw new Error("Falta indicar qué elemento querés modificar.");
    const target = await this.gateway.findEntity({
      type,
      id: typeof args.targetId === "string" ? args.targetId : undefined,
      clientSlug: this.clientSlug(args, fallbackClientSlug),
      ordinal: typeof args.ordinal === "number" ? args.ordinal : undefined,
      query: typeof args.query === "string" ? args.query : undefined,
    });
    if (!target) throw new Error("No encontré un elemento inequívoco para modificar.");
    return target;
  }

  private async createTask(args: Record<string, unknown>, context: Parameters<AgentToolExecutor["execute"]>[1]) {
    const entity = await this.gateway.createTask({
      ...args,
      clientSlug: this.clientSlug(args, context.clientSlug),
      source: context.source,
    });
    return receipt("create_task", `Creé la tarea “${entity.title}”.`, entity);
  }

  private async complete(args: Record<string, unknown>, context: Parameters<AgentToolExecutor["execute"]>[1]) {
    const before = await this.resolveTarget(args, context.clientSlug);
    const entity = await this.gateway.completeEntity(before);
    const undoToken = await this.gateway.storeUndo({
      type: "complete",
      entity,
      before: { status: before.status },
      after: { status: entity.status },
      context,
    });
    return receipt("complete_task", `Marqué “${entity.title}” como resuelto.`, entity, undoToken);
  }

  private async changeDeadline(args: Record<string, unknown>, context: Parameters<AgentToolExecutor["execute"]>[1]) {
    const before = await this.resolveTarget(args, context.clientSlug);
    const dueAt = String(args.dueAt);
    const entity = await this.gateway.rescheduleEntity(before, dueAt);
    const undoToken = await this.gateway.storeUndo({
      type: "reschedule",
      entity,
      before: { dueAt: before.dueAt },
      after: { dueAt: entity.dueAt ?? dueAt },
      context,
    });
    return receipt("change_deadline", `Pasé “${entity.title}” al ${formatDate(dueAt)}.`, entity, undoToken);
  }

  private async createNote(args: Record<string, unknown>, context: Parameters<AgentToolExecutor["execute"]>[1]) {
    const entity = await this.gateway.createNote({ ...args, clientSlug: this.clientSlug(args, context.clientSlug), source: context.source });
    return receipt("create_note", "Guardé la nota privada.", entity);
  }

  private async createIdea(args: Record<string, unknown>, context: Parameters<AgentToolExecutor["execute"]>[1]) {
    const entity = await this.gateway.createIdea({ ...args, clientSlug: this.clientSlug(args, context.clientSlug), source: context.source });
    return receipt("create_idea", `Guardé la idea “${entity.title}”.`, entity);
  }

  private async createOpenLoop(args: Record<string, unknown>, context: Parameters<AgentToolExecutor["execute"]>[1]) {
    const entity = await this.gateway.createOpenLoop({ ...args, clientSlug: this.clientSlug(args, context.clientSlug), source: context.source });
    return receipt("create_open_loop", `Guardé el hilo abierto “${entity.title}”.`, entity);
  }

  private async createScript(args: Record<string, unknown>, context: Parameters<AgentToolExecutor["execute"]>[1]) {
    const entity = await this.gateway.createScript({ ...args, clientSlug: this.clientSlug(args, context.clientSlug), source: context.source });
    return receipt("create_script_draft", `Creé el borrador “${entity.title}”.`, entity);
  }

  private async updateContentStatus(args: Record<string, unknown>, context: Parameters<AgentToolExecutor["execute"]>[1]) {
    const before = await this.resolveTarget(args, context.clientSlug, "content");
    const status = String(args.status);
    const entity = await this.gateway.updateContentStatus(before, status);
    const undoToken = await this.gateway.storeUndo({
      type: "content_status",
      entity,
      before: { status: before.status },
      after: { status },
      context,
    });
    return receipt("update_content_status", `Moví “${entity.title}” a ${status}.`, entity, undoToken);
  }

  private async createCommitment(args: Record<string, unknown>, context: Parameters<AgentToolExecutor["execute"]>[1]) {
    const clientSlug = this.clientSlug(args, context.clientSlug);
    let target: ResolvedEntity | undefined;
    if (args.targetType) {
      target = await this.gateway.findEntity({
        type: args.targetType as "task" | "script" | "content",
        id: typeof args.targetId === "string" ? args.targetId : undefined,
        clientSlug,
        ordinal: typeof args.ordinal === "number" ? args.ordinal : undefined,
        query: typeof args.query === "string" ? args.query : String(args.intent),
      });
    }
    const commitment = await this.gateway.createCommitment({
      ...args,
      clientSlug,
      targetType: target?.type ?? args.targetType ?? null,
      targetId: target?.id ?? args.targetId ?? null,
      source: context.source === "web" ? "chat" : context.source,
    });
    const remindAt = typeof args.remindAt === "string" ? args.remindAt : String(args.dueAt);
    await this.gateway.createReminder({
      clientSlug,
      commitmentId: commitment.id,
      remindAt,
      source: context.source === "web" ? "chat" : context.source,
      title: target?.title ?? commitment.title,
    });
    return receipt(
      "create_commitment",
      `Registré el compromiso “${commitment.title}” para el ${formatDate(String(args.dueAt))}.`,
      commitment,
    );
  }

  private async saveMemory(args: Record<string, unknown>, context: Parameters<AgentToolExecutor["execute"]>[1]) {
    const memory = await this.gateway.saveMemory({ ...args, clientSlug: this.clientSlug(args, context.clientSlug), source: context.source });
    return { type: "save_memory", summary: "Guardé esa decisión para tenerla presente.", data: { memoryId: memory.id } };
  }

  private async updateProfile(args: Record<string, unknown>, context: Parameters<AgentToolExecutor["execute"]>[1]) {
    await this.gateway.updateCommunicationProfile({ ...args, source: context.source });
    return { type: "update_communication_profile", summary: "Ajusté cómo y cuándo te aviso." };
  }
}

function receipt(
  type: string,
  summary: string,
  entity: ResolvedEntity,
  undoToken?: string,
): AgentActionReceipt {
  return { type, summary, entity, undoToken };
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    weekday: "long",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value)).replace(/\.$/, "");
}
