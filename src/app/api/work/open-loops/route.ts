import { v1Error } from "@/server/api/v1-contract";
import { listOpenLoopsV1 } from "@/server/data";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const loops = await listOpenLoopsV1({ status: url.searchParams.get("status") ?? undefined, clientSlug: url.searchParams.get("client") ?? undefined, limit: Number(url.searchParams.get("limit") || 50) });
    return Response.json({ loops });
  } catch (error) { return v1Error(error, "No pude cargar los pendientes."); }
}
