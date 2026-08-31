import { z } from "zod";

import { normalizeV1Status, numericId, uiIdea, v1Error } from "@/server/api/v1-contract";
import { archiveIdeaV1, updateIdeaV1 } from "@/server/data";
import { readJson } from "@/server/agent/http";

export const runtime = "nodejs";

const schema = z.object({
  title: z.string().trim().min(1).max(180).optional(), description: z.string().max(8_000).optional(),
  status: z.string().trim().max(40).optional(), origin: z.string().trim().max(80).optional(),
  tags: z.array(z.string().trim().min(1).max(64)).max(20).optional(), format: z.string().trim().max(80).optional(),
  capturedAt: z.string().datetime().optional(), dueAt: z.string().datetime().nullable().optional(),
  notes: z.string().max(10_000).optional(), archived: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, "No hay cambios para guardar.");

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const [{ id }, input] = await Promise.all([context.params, readJson(request).then((body) => schema.parse(body))]);
    const idea = await updateIdeaV1(numericId(id, "idea"), { ...input, status: normalizeV1Status("idea", input.status) });
    return Response.json({ idea: uiIdea(idea) });
  } catch (error) { return v1Error(error, "No pude guardar la idea."); }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    await archiveIdeaV1(numericId(id, "idea"));
    return Response.json({ ok: true });
  } catch (error) { return v1Error(error, "No pude archivar la idea."); }
}
