import { z } from "zod";

import { jsonError, jsonOk, readJson } from "@/server/agent/http";
import { requireMartuSession } from "@/server/auth/session";
import { linkInstagramMedia } from "@/server/instagram";
import { requireSameOrigin } from "@/server/security/same-origin";

export const runtime = "nodejs";

const schema = z.object({
  clientSlug: z.string().trim().min(1).max(80).regex(/^[a-z0-9-]+$/i),
  contentItemId: z.string().regex(/^\d+$/).nullable(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    await requireMartuSession();
    const [{ id }, input] = await Promise.all([context.params, readJson(request).then((body) => schema.parse(body))]);
    if (!/^\d+$/.test(id)) throw new Error("Publicación de Instagram inválida.");
    await linkInstagramMedia({ clientSlug: input.clientSlug, mediaId: id, contentItemId: input.contentItemId });
    return jsonOk({ linked: true });
  } catch (error) {
    return jsonError(error);
  }
}

