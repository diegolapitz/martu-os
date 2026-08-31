import { z } from "zod";

import { v1Error } from "@/server/api/v1-contract";
import { createCalendarEventV1, listCalendarEventsV1, listClientChoicesV1 } from "@/server/data";
import { readJson } from "@/server/agent/http";

export const runtime = "nodejs";

const schema = z.object({
  clientSlug: z.string().trim().min(1).max(80).nullable().optional(), title: z.string().trim().min(1).max(220),
  description: z.string().max(8_000).nullable().optional(), startsAt: z.string().datetime(), endsAt: z.string().datetime().nullable().optional(),
  allDay: z.boolean().optional(), kind: z.string().trim().min(1).max(80).optional(), status: z.enum(["scheduled", "completed", "cancelled"]).optional(),
  entityType: z.string().trim().max(80).optional(), entityId: z.string().regex(/^\d+$/).optional(), targetPath: z.string().max(2_000).optional(),
}).refine((value) => !value.endsAt || new Date(value.endsAt) >= new Date(value.startsAt), "La hora de fin no puede ser anterior al inicio.");

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const [events, clients] = await Promise.all([
      listCalendarEventsV1({ from: url.searchParams.get("from") ?? undefined, to: url.searchParams.get("to") ?? undefined, clientSlug: url.searchParams.get("client") ?? undefined, kind: url.searchParams.get("kind") ?? undefined }),
      listClientChoicesV1(),
    ]);
    return Response.json({ events, clients });
  } catch (error) { return v1Error(error, "No pude cargar el calendario."); }
}

export async function POST(request: Request) {
  try {
    const input = schema.parse(await readJson(request));
    const event = await createCalendarEventV1({ ...input, clientSlug: input.clientSlug ?? undefined, description: input.description ?? undefined });
    return Response.json({ event }, { status: 201 });
  } catch (error) { return v1Error(error, "No pude crear el evento."); }
}
