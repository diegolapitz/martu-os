import { z } from "zod";

import { normalizeV1Status, uiClient, v1Error } from "@/server/api/v1-contract";
import { updateClientV1 } from "@/server/data";
import { readJson } from "@/server/agent/http";

export const runtime = "nodejs";

const schema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(2_000).optional(),
  summary: z.string().trim().max(4_000).optional(),
  status: z.string().trim().max(40).optional(),
  accent: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  logoUrl: z.string().url().max(2_000).nullable().optional(),
  serviceSlugs: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
}).refine((value) => Object.keys(value).length > 0, "No hay cambios para guardar.");

export async function PATCH(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const [{ slug }, input] = await Promise.all([context.params, readJson(request).then((body) => schema.parse(body))]);
    const client = await updateClientV1(decodeURIComponent(slug), { ...input, status: normalizeV1Status("client", input.status) });
    return Response.json({ client: uiClient(client) });
  } catch (error) {
    return v1Error(error, "No pude actualizar el cliente.");
  }
}
