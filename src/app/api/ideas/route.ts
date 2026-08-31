import { z } from "zod";

import { normalizeV1Status, uiIdea, v1Error } from "@/server/api/v1-contract";
import { createIdeaV1, listIdeasV1 } from "@/server/data";
import { readJson } from "@/server/agent/http";

export const runtime = "nodejs";

const ideaSchema = z.object({
  clientSlug: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1, "La idea necesita un título.").max(180),
  description: z.string().trim().max(8_000).optional().default(""),
  status: z.string().trim().max(40).optional(),
  origin: z.string().trim().max(80).optional(),
  tags: z.array(z.string().trim().min(1).max(64)).max(12).optional(),
  format: z.string().trim().max(80).optional(),
  capturedAt: z.string().datetime().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  notes: z.string().max(10_000).optional(),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const ideas = await listIdeasV1({ clientSlug: url.searchParams.get("client") ?? undefined, status: url.searchParams.get("status") ?? undefined, search: url.searchParams.get("q") ?? undefined, limit: Number(url.searchParams.get("limit") || 100) });
    return Response.json({ ideas: ideas.map(uiIdea) });
  } catch (error) { return v1Error(error, "No pude cargar las ideas."); }
}

export async function POST(request: Request) {
  try {
    const input = ideaSchema.parse(await readJson(request));
    const idea = await createIdeaV1({ ...input, status: normalizeV1Status("idea", input.status) });
    return Response.json({ idea: uiIdea(idea) }, { status: 201 });
  } catch (error) { return v1Error(error, "No pude guardar la idea."); }
}
