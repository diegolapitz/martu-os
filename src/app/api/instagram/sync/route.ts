import { z } from "zod";

import { jsonError, jsonOk, readJson } from "@/server/agent/http";
import { requireMartuSession } from "@/server/auth/session";
import {
  getInstagramConfig,
  InstagramSyncInProgressError,
  InstagramSyncService,
} from "@/server/instagram";
import { requireSameOrigin } from "@/server/security/same-origin";

export const runtime = "nodejs";

const schema = z.object({ clientSlug: z.string().trim().min(1).max(80).regex(/^[a-z0-9-]+$/i) });

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    await requireMartuSession();
    const input = schema.parse(await readJson(request));
    return jsonOk({ sync: await new InstagramSyncService(getInstagramConfig()).syncClient(input.clientSlug) });
  } catch (error) {
    if (error instanceof InstagramSyncInProgressError) {
      return jsonError(error, 409);
    }
    return jsonError(error);
  }
}
