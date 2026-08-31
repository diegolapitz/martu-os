import { z } from "zod";

import { normalizeV1Status, numericId, uiContent, v1Error } from "@/server/api/v1-contract";
import { archiveContentV1, updateContentV1 } from "@/server/data";
import { readJson } from "@/server/agent/http";

export const runtime = "nodejs";

const schema = z.object({
  title: z.string().trim().min(1).max(180).optional(), format: z.string().trim().max(80).optional(), channel: z.string().trim().max(80).optional(),
  status: z.string().trim().max(80).optional(), caption: z.string().max(30_000).optional(), cta: z.string().max(8_000).optional(),
  notes: z.string().max(12_000).optional(), assignee: z.string().trim().max(120).optional(),
  dueAt: z.string().datetime().nullable().optional(), deadline: z.string().datetime().nullable().optional(),
  scheduledAt: z.string().datetime().nullable().optional(), pipelinePosition: z.number().int().min(0).max(100_000).optional(), archived: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, "No hay cambios para guardar.");

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const [{ id }, input] = await Promise.all([context.params, readJson(request).then((body) => schema.parse(body))]);
    const { deadline, ...rest } = input;
    const dueAt = input.dueAt !== undefined ? input.dueAt : deadline;
    const content = await updateContentV1(numericId(id, "contenido"), { ...rest, dueAt, status: normalizeV1Status("content", input.status) });
    return Response.json({ content: uiContent(content) });
  } catch (error) { return v1Error(error, "No pude guardar el contenido."); }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try { const { id } = await context.params; await archiveContentV1(numericId(id, "contenido")); return Response.json({ ok: true }); }
  catch (error) { return v1Error(error, "No pude archivar el contenido."); }
}
