import { numericId, uiContent, v1Error } from "@/server/api/v1-contract";
import { duplicateContentV1 } from "@/server/data";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try { const { id } = await context.params; return Response.json({ content: uiContent(await duplicateContentV1(numericId(id, "contenido"))) }, { status: 201 }); }
  catch (error) { return v1Error(error, "No pude duplicar el contenido."); }
}
