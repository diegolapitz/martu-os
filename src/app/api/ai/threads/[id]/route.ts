import { numericId, v1Error } from "@/server/api/v1-contract";
import { getThreadV1 } from "@/server/data";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const [{ id }, url] = await Promise.all([context.params, Promise.resolve(new URL(request.url))]);
    return Response.json(await getThreadV1(numericId(id, "conversación"), { limit: Number(url.searchParams.get("limit") || 100) }));
  } catch (error) { return v1Error(error, "No pude abrir la conversación."); }
}
