import { z } from "zod";

import { jsonError, jsonOk } from "@/server/agent/http";
import { getMartuRuntime } from "@/server/agent/runtime";
import { transcribeAudio } from "@/server/agent/transcription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const entitySchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  type: z.enum(["task", "script", "content", "commitment", "note", "idea", "open_loop", "meeting"]),
  title: z.string().trim().min(1).max(300),
  clientId: z.union([z.string(), z.number()]).transform(String).nullable().optional(),
  clientSlug: z.string().trim().min(1).max(100).nullable().optional(),
});

const currentViewSchema = z.object({
  pathname: z.string().trim().min(1).max(500),
  section: z.string().trim().max(100).nullable().optional(),
  clientId: z.union([z.string(), z.number()]).transform(String).nullable().optional(),
  clientSlug: z.string().trim().min(1).max(100).nullable().optional(),
  clientName: z.string().trim().min(1).max(200).nullable().optional(),
  entityType: entitySchema.shape.type.nullable().optional(),
  entityId: z.union([z.string(), z.number()]).transform(String).nullable().optional(),
  entityTitle: z.string().trim().min(1).max(300).nullable().optional(),
});

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const audio = form.get("audio") ?? form.get("file");
    if (!(audio instanceof File)) throw new Error("Falta el archivo de audio.");
    const transcription = await transcribeAudio(audio);
    const shouldProcess = String(form.get("process") ?? "false") === "true";
    if (!shouldProcess) return jsonOk({ ...transcription, message: transcription.text });
    const runtime = getMartuRuntime();
    const nudgeId = value(form.get("nudgeId"));
    const nudge = nudgeId ? await runtime.nudges.getNudge(nudgeId) : undefined;
    if (nudgeId && !nudge) throw new Error("No encontré la notificación que querías resolver.");
    const contextEntity = jsonField(form, "contextEntity", entitySchema);
    const currentView = jsonField(form, "currentView", currentViewSchema);
    const clientSlug = nudge?.clientSlug ?? value(form.get("clientSlug"));
    const contextScope = form.get("contextScope") === "global"
      ? "global" as const
      : form.get("contextScope") === "client" || clientSlug
        ? "client" as const
        : "global" as const;
    const reply = await runtime.agent.run({
      message: transcription.text,
      clientSlug,
      pathname: value(form.get("pathname")),
      threadId: value(form.get("threadId")),
      createNewThread: form.get("createNewThread") === "true",
      contextScope,
      contextEntity: contextEntity ? {
        ...contextEntity,
        clientId: contextEntity.clientId ?? undefined,
        clientSlug: contextEntity.clientSlug ?? undefined,
      } : undefined,
      currentView: currentView ? {
        ...currentView,
        section: currentView.section ?? undefined,
        clientId: currentView.clientId ?? undefined,
        clientSlug: currentView.clientSlug ?? undefined,
        clientName: currentView.clientName ?? undefined,
        entityType: currentView.entityType ?? undefined,
        entityId: currentView.entityId ?? undefined,
        entityTitle: currentView.entityTitle ?? undefined,
      } : undefined,
      source: "audio",
      metadata: {
        transcriptionModel: transcription.model,
        ...(nudge ? {
          notificationContext: {
            nudgeId: nudge.id,
            entityId: nudge.entityId,
            entityType: nudge.entityType,
            title: nudge.title,
            clientSlug: nudge.clientSlug,
          },
        } : {}),
      },
    });
    return jsonOk({ text: transcription.text, transcription, reply, mode: reply.mode, message: reply.message, action: reply.action, undoToken: reply.undoToken });
  } catch (error) {
    return jsonError(error);
  }
}

function value(entry: FormDataEntryValue | null): string | undefined {
  return typeof entry === "string" && entry.trim() ? entry.trim() : undefined;
}

function jsonField<T>(form: FormData, name: string, schema: z.ZodType<T>): T | undefined {
  const raw = value(form.get(name));
  if (!raw) return undefined;
  try {
    return schema.parse(JSON.parse(raw));
  } catch {
    throw new Error(`El campo ${name} no es válido.`);
  }
}
