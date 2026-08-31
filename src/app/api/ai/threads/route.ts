import { v1Error } from "@/server/api/v1-contract";
import { listThreadsV1 } from "@/server/data";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const threads = await listThreadsV1({ clientSlug: url.searchParams.get("client") ?? undefined, limit: Number(url.searchParams.get("limit") || 30) });
    return Response.json({ threads });
  } catch (error) { return v1Error(error, "No pude cargar las conversaciones."); }
}
