import { z } from "zod";

import { jsonError, jsonOk, readJson } from "@/server/agent/http";
import { getMartuRuntime } from "@/server/agent/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  undoToken: z.string().min(1),
  clientSlug: z.string().min(1).optional(),
  threadId: z.union([z.string(), z.number()]).transform(String).optional(),
});

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await readJson(request));
    const action = await getMartuRuntime().nudgeActions.execute({ action: "undo", ...body });
    return jsonOk({ ok: true, mode: process.env.OPENAI_API_KEY ? "real" : "demo", message: action.summary, action });
  } catch (error) {
    return jsonError(error);
  }
}
