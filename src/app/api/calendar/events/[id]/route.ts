import { z } from "zod";

import { numericId, v1Error } from "@/server/api/v1-contract";
import { archiveCalendarEventV1, updateCalendarEventV1 } from "@/server/data";
import { readJson } from "@/server/agent/http";

export const runtime = "nodejs";

const schema = z.object({
  clientSlug: z.string().trim().min(1).max(80).nullable().optional(), title: z.string().trim().min(1).max(220).optional(),
  description: z.string().max(8_000).nullable().optional(), startsAt: z.string().datetime().optional(), endsAt: z.string().datetime().nullable().optional(),
  allDay: z.boolean().optional(), kind: z.string().trim().min(1).max(80).optional(), status: z.enum(["scheduled", "completed", "cancelled"]).optional(),
  entityType: z.string().trim().max(80).nullable().optional(), entityId: z.string().regex(/^\d+$/).nullable().optional(), targetPath: z.string().max(2_000).nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, "No hay cambios para guardar.");

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const [{ id }, input] = await Promise.all([context.params, readJson(request).then((body) => schema.parse(body))]);
    const event = await updateCalendarEventV1(numericId(id, "evento"), { ...input, description: input.description ?? undefined });
    return Response.json({ event });
  } catch (error) { return v1Error(error, "No pude guardar el evento."); }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try { const { id } = await context.params; await archiveCalendarEventV1(numericId(id, "evento")); return Response.json({ ok: true }); }
  catch (error) { return v1Error(error, "No pude eliminar el evento."); }
}
