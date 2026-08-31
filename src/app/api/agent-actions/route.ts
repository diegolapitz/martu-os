import { jsonError, jsonOk, readJson } from "@/server/agent/http";
import { getMartuRuntime } from "@/server/agent/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const action = await getMartuRuntime().nudgeActions.execute(await readJson(request));
    return jsonOk({ ok: true, mode: process.env.OPENAI_API_KEY ? "real" : "demo", message: action.summary, action, undoToken: action.undoToken });
  } catch (error) {
    return jsonError(error);
  }
}
