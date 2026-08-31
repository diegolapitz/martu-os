import { numericId, uiScript, v1Error } from "@/server/api/v1-contract";
import { duplicateScriptV1 } from "@/server/data";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try { const { id } = await context.params; return Response.json({ script: uiScript(await duplicateScriptV1(numericId(id, "guion"))) }, { status: 201 }); }
  catch (error) { return v1Error(error, "No pude duplicar el guion."); }
}
