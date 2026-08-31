import { jsonError, jsonOk } from "@/server/agent/http";
import { getMartuRuntime } from "@/server/agent/runtime";
import { authorizeCron } from "@/server/proactivity/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const authorization = authorizeCron(request);
  if (!authorization.ok) return jsonOk({ error: "unauthorized", message: authorization.message }, { status: authorization.status });
  try {
    const result = await getMartuRuntime().proactivity.tick(new Date());
    return jsonOk({ ok: true, ranAt: new Date().toISOString(), ...result });
  } catch (error) {
    return jsonError(error);
  }
}
