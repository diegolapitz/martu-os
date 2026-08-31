import { z } from "zod";

import { jsonError, jsonOk, readJson } from "@/server/agent/http";
import { getMartuRuntime } from "@/server/agent/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const subscription = await getMartuRuntime().pushSubscriptions.subscribe(await readJson(request, 16 * 1024), request.headers.get("user-agent"));
    return jsonOk({ ok: true, subscriptionId: subscription.id }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const body = z.object({ endpoint: z.string().url() }).parse(await readJson(request, 16 * 1024));
    const removed = await getMartuRuntime().pushSubscriptions.unsubscribe(body.endpoint);
    return jsonOk({ ok: true, removed });
  } catch (error) {
    return jsonError(error);
  }
}
