import { z } from "zod";

import { numericId, v1Error } from "@/server/api/v1-contract";
import { updateOpenLoopV1 } from "@/server/data";
import { readJson } from "@/server/agent/http";

export const runtime = "nodejs";

const schema = z.object({ status: z.enum(["open", "planned", "resolved", "archived"]).optional(), title: z.string().trim().min(1).max(220).optional(), body: z.string().max(10_000).optional(), nextEligibleAt: z.string().datetime().nullable().optional() }).refine((value) => Object.keys(value).length > 0, "No hay cambios para guardar.");

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try { const [{ id }, input] = await Promise.all([context.params, readJson(request).then((body) => schema.parse(body))]); return Response.json({ loop: await updateOpenLoopV1(numericId(id, "pendiente"), input) }); }
  catch (error) { return v1Error(error, "No pude actualizar el pendiente."); }
}
