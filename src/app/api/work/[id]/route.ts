import { z } from "zod";

import { normalizeV1Status, numericId, v1Error } from "@/server/api/v1-contract";
import { domainDto, getWorkV1, updateWorkV1 } from "@/server/data";
import { readJson } from "@/server/agent/http";

export const runtime = "nodejs";

const schema = z.object({
  clientSlug: z.string().trim().min(1).max(80).nullable().optional(),
  title: z.string().trim().min(1).max(220).optional(), description: z.string().max(8_000).optional(), status: z.string().trim().max(40).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(), dueAt: z.string().datetime().nullable().optional(),
  startsAt: z.string().datetime().nullable().optional(), bucket: z.enum(["today", "next", "waiting", "someday", "inbox"]).optional(),
  workKind: z.string().trim().max(80).optional(), kind: z.string().trim().max(80).optional(), waitingUntil: z.string().datetime().nullable().optional(),
  sortOrder: z.number().int().min(0).max(1_000_000).optional(), entityType: z.string().trim().max(80).nullable().optional(),
  entityId: z.string().regex(/^\d+$/).nullable().optional(), archived: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, "No hay cambios para guardar.");

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try { const { id } = await context.params; return Response.json({ item: domainDto(await getWorkV1(numericId(id, "trabajo"))) }); }
  catch (error) { return v1Error(error, "No pude cargar el trabajo."); }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const [{ id }, input] = await Promise.all([context.params, readJson(request).then((body) => schema.parse(body))]);
    const { kind, ...rest } = input;
    const item = await updateWorkV1(numericId(id, "trabajo"), { ...rest, workKind: input.workKind ?? kind, status: normalizeV1Status("work", input.status) });
    return Response.json({ item, work: item });
  } catch (error) { return v1Error(error, "No pude actualizar el trabajo."); }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try { const { id } = await context.params; await updateWorkV1(numericId(id, "trabajo"), { archived: true }); return Response.json({ ok: true }); }
  catch (error) { return v1Error(error, "No pude archivar el trabajo."); }
}
