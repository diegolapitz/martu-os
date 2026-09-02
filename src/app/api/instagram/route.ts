import { z } from "zod";

import { jsonError, jsonOk } from "@/server/agent/http";
import { requireMartuSession } from "@/server/auth/session";
import { disconnectInstagram, getInstagramConnectionDto } from "@/server/instagram";
import { requireSameOrigin } from "@/server/security/same-origin";

export const runtime = "nodejs";

const clientSchema = z.string().trim().min(1).max(80).regex(/^[a-z0-9-]+$/i);

export async function GET(request: Request) {
  try {
    await requireMartuSession();
    const clientSlug = clientSchema.parse(new URL(request.url).searchParams.get("client"));
    return jsonOk({ instagram: await getInstagramConnectionDto(clientSlug) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    requireSameOrigin(request);
    await requireMartuSession();
    const clientSlug = clientSchema.parse(new URL(request.url).searchParams.get("client"));
    await disconnectInstagram(clientSlug);
    console.info("[instagram] disconnected");
    return jsonOk({ disconnected: true });
  } catch (error) {
    return jsonError(error);
  }
}

