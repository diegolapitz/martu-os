import { z } from "zod";

import { jsonError, jsonOk, readJson } from "@/server/agent/http";
import { getMartuRuntime } from "@/server/agent/runtime";
import { updateNudgesLifecycleV1 } from "@/server/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const statusSchema = z.enum(["pending", "delivered", "read", "acted", "dismissed"]);

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const limit = Number(url.searchParams.get("limit") ?? "30");
    const nudges = await getMartuRuntime().nudges.listForCenter({
      status: status ? statusSchema.parse(status) : undefined,
      limit: Number.isFinite(limit) ? limit : 30,
    });
    return jsonOk({ nudges, unread: nudges.filter((nudge) => nudge.status === "delivered").length });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = z.object({
      id: z.union([z.string(), z.number()]).transform(String).optional(),
      status: z.literal("read").optional(),
      action: z.enum(["read", "resolve", "dismiss", "snooze", "reduce_insistence"]).optional(),
      snoozedUntil: z.string().datetime().optional(),
      reason: z.string().trim().max(500).optional(),
      all: z.boolean().optional(),
    }).refine((value) => Boolean(value.action || value.status), "Falta indicar la acción.").parse(await readJson(request));
    const action = body.action ?? "read";
    const result = await updateNudgesLifecycleV1({ id: body.id, action, snoozedUntil: body.snoozedUntil, reason: body.reason, all: body.all });
    return jsonOk({ ok: true, ...result });
  } catch (error) {
    return jsonError(error);
  }
}
