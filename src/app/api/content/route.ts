import { z } from "zod";

import { normalizeV1Status, uiContent, v1Error } from "@/server/api/v1-contract";
import { createContentV1, listContentV1 } from "@/server/data";
import { readJson } from "@/server/agent/http";

export const runtime = "nodejs";

const schema = z.object({
  clientSlug: z.string().trim().min(1).max(80), ideaId: z.string().regex(/^\d+$/).optional(), scriptId: z.string().regex(/^\d+$/).optional(),
  title: z.string().trim().min(1).max(180), format: z.string().trim().max(80).optional(), channel: z.string().trim().max(80).optional(),
  status: z.string().trim().max(80).optional(), caption: z.string().max(30_000).optional(), cta: z.string().max(8_000).optional(),
  notes: z.string().max(12_000).optional(), assignee: z.string().trim().max(120).optional(),
  dueAt: z.string().datetime().nullable().optional(), deadline: z.string().datetime().nullable().optional(),
  scheduledAt: z.string().datetime().nullable().optional(), pipelinePosition: z.number().int().min(0).max(100_000).optional(),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const content = await listContentV1({ clientSlug: url.searchParams.get("client") ?? undefined, status: url.searchParams.get("status") ?? undefined, search: url.searchParams.get("q") ?? undefined, limit: Number(url.searchParams.get("limit") || 100) });
    return Response.json({ content: content.map(uiContent) });
  } catch (error) { return v1Error(error, "No pude cargar el contenido."); }
}

export async function POST(request: Request) {
  try {
    const input = schema.parse(await readJson(request));
    const { deadline, ...rest } = input;
    const content = await createContentV1({ ...rest, dueAt: input.dueAt ?? deadline, status: normalizeV1Status("content", input.status) });
    return Response.json({ content: uiContent(content) }, { status: 201 });
  } catch (error) { return v1Error(error, "No pude crear el contenido."); }
}
