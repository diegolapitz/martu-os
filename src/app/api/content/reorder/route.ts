import { z } from "zod";

import { v1Error } from "@/server/api/v1-contract";
import { readJson } from "@/server/agent/http";
import { reorderContentV1 } from "@/server/data";

export const runtime = "nodejs";

const schema = z.object({
  clientSlug: z.string().trim().min(1).max(80),
  orderedIds: z.array(z.string().regex(/^\d+$/)).min(1).max(250),
});

export async function PATCH(request: Request) {
  try {
    const input = schema.parse(await readJson(request));
    const result = await reorderContentV1(input.clientSlug, input.orderedIds);
    return Response.json(result);
  } catch (error) {
    return v1Error(error, "No pude guardar el nuevo orden.");
  }
}
