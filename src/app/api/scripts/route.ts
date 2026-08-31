import { z } from "zod";

import { normalizeV1Status, uiScript, v1Error } from "@/server/api/v1-contract";
import { createScriptV1, listScriptsV1 } from "@/server/data";
import { readJson } from "@/server/agent/http";

export const runtime = "nodejs";

const schema = z.object({
  clientSlug: z.string().trim().min(1).max(80), ideaId: z.string().regex(/^\d+$/).optional(),
  title: z.string().trim().min(1).max(180), format: z.string().trim().max(80).optional(),
  objective: z.string().max(4_000).optional(), hook: z.string().max(8_000).optional(),
  body: z.string().max(40_000).optional(), cta: z.string().max(8_000).optional(),
  status: z.string().trim().max(40).optional(), notes: z.string().max(12_000).optional(),
  dueAt: z.string().datetime().nullable().optional(), deadline: z.string().datetime().nullable().optional(),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const scripts = await listScriptsV1({ clientSlug: url.searchParams.get("client") ?? undefined, status: url.searchParams.get("status") ?? undefined, search: url.searchParams.get("q") ?? undefined, limit: Number(url.searchParams.get("limit") || 100) });
    return Response.json({ scripts: scripts.map(uiScript) });
  } catch (error) { return v1Error(error, "No pude cargar los guiones."); }
}

export async function POST(request: Request) {
  try {
    const input = schema.parse(await readJson(request));
    const { deadline, ...rest } = input;
    const script = await createScriptV1({ ...rest, dueAt: input.dueAt ?? deadline, status: normalizeV1Status("script", input.status) });
    return Response.json({ script: uiScript(script) }, { status: 201 });
  } catch (error) { return v1Error(error, "No pude crear el guion."); }
}
