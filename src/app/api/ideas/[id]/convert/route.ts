import { z } from "zod";

import { numericId, uiContent, uiScript, v1Error } from "@/server/api/v1-contract";
import { convertIdeaV1 } from "@/server/data";
import { readJson } from "@/server/agent/http";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const [{ id }, body] = await Promise.all([context.params, readJson(request)]);
    const { target } = z.object({ target: z.enum(["script", "content"]).optional().default("script") }).parse(body);
    const result = await convertIdeaV1(numericId(id, "idea"), target);
    return target === "script"
      ? Response.json({ target, script: uiScript(result.item) }, { status: 201 })
      : Response.json({ target, content: uiContent(result.item) }, { status: 201 });
  } catch (error) { return v1Error(error, "No pude convertir la idea."); }
}
