import { z } from "zod";

import { normalizeV1Status, numericId, uiScript, v1Error } from "@/server/api/v1-contract";
import { archiveScriptV1, updateScriptV1 } from "@/server/data";
import { readJson } from "@/server/agent/http";

export const runtime = "nodejs";

const schema = z.object({
  title: z.string().trim().min(1).max(180).optional(), format: z.string().trim().max(80).optional(),
  objective: z.string().max(4_000).optional(), hook: z.string().max(8_000).optional(), body: z.string().max(40_000).optional(),
  cta: z.string().max(8_000).optional(), status: z.string().trim().max(40).optional(), notes: z.string().max(12_000).optional(),
  dueAt: z.string().datetime().nullable().optional(), deadline: z.string().datetime().nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, "No hay cambios para guardar.");

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const [{ id }, input] = await Promise.all([context.params, readJson(request).then((body) => schema.parse(body))]);
    const { deadline, ...rest } = input;
    const dueAt = input.dueAt !== undefined ? input.dueAt : deadline;
    const script = await updateScriptV1(numericId(id, "guion"), { ...rest, dueAt, status: normalizeV1Status("script", input.status) });
    return Response.json({ script: uiScript(script) });
  } catch (error) { return v1Error(error, "No pude guardar el guion."); }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try { const { id } = await context.params; await archiveScriptV1(numericId(id, "guion")); return Response.json({ ok: true }); }
  catch (error) { return v1Error(error, "No pude archivar el guion."); }
}
