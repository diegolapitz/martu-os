import { z } from "zod";

import { normalizeV1Status, v1Error } from "@/server/api/v1-contract";
import { createWorkV1, listClientChoicesV1, listWorkV1 } from "@/server/data";
import { readJson } from "@/server/agent/http";

export const runtime = "nodejs";

const schema = z.object({
  clientSlug: z.string().trim().min(1).max(80).nullable().optional(), title: z.string().trim().min(1).max(220),
  description: z.string().max(8_000).optional(), status: z.string().trim().max(40).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(), dueAt: z.string().datetime().nullable().optional(),
  startsAt: z.string().datetime().nullable().optional(), bucket: z.enum(["today", "next", "waiting", "someday", "inbox"]).optional(),
  workKind: z.string().trim().max(80).optional(), kind: z.string().trim().max(80).optional(), waitingUntil: z.string().datetime().nullable().optional(),
  sortOrder: z.number().int().min(0).max(1_000_000).optional(), entityType: z.string().trim().max(80).optional(), entityId: z.string().regex(/^\d+$/).optional(),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const [items, clients] = await Promise.all([
      listWorkV1({ clientSlug: url.searchParams.get("client") ?? undefined, status: url.searchParams.get("status") ?? undefined, bucket: url.searchParams.get("bucket") ?? undefined, kind: url.searchParams.get("kind") ?? undefined, search: url.searchParams.get("q") ?? undefined, limit: Number(url.searchParams.get("limit") || 200) }),
      listClientChoicesV1(),
    ]);
    return Response.json({ items, work: items, clients });
  } catch (error) { return v1Error(error, "No pude cargar el trabajo."); }
}

export async function POST(request: Request) {
  try {
    const input = schema.parse(await readJson(request));
    const { kind, ...rest } = input;
    const item = await createWorkV1({ ...rest, clientSlug: input.clientSlug ?? undefined, workKind: input.workKind ?? kind, status: normalizeV1Status("work", input.status) });
    return Response.json({ item, work: item }, { status: 201 });
  } catch (error) { return v1Error(error, "No pude crear el trabajo."); }
}
