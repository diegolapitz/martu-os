import { numericId, uiIdea, v1Error } from "@/server/api/v1-contract";
import { duplicateIdeaV1 } from "@/server/data";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return Response.json({ idea: uiIdea(await duplicateIdeaV1(numericId(id, "idea"))) }, { status: 201 });
  } catch (error) { return v1Error(error, "No pude duplicar la idea."); }
}
