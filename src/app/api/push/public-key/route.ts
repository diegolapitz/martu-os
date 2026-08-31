import { jsonOk } from "@/server/agent/http";
import { getMartuRuntime } from "@/server/agent/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return jsonOk(getMartuRuntime().pushSubscriptions.getPublicConfiguration());
}
