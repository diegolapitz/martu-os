import { z } from "zod";

import { numericId, v1Error } from "@/server/api/v1-contract";
import { readJson } from "@/server/agent/http";
import {
  archiveManagedMemory,
  correctManagedMemory,
} from "@/server/data/memory-domain";

export const runtime = "nodejs";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("correct"),
    scope: z.enum(["global", "client"]).optional(),
    clientSlug: z.string().trim().min(1).max(120).nullable().optional(),
    category: z.string().trim().min(1).max(80).optional(),
    fact: z.string().trim().min(1).max(4_000).optional(),
    importance: z.number().int().min(1).max(5).optional(),
    memoryKind: z.string().trim().min(1).max(80).optional(),
  }),
  z.object({ action: z.enum(["archive", "forget"]) }),
]);

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const [{ id }, input] = await Promise.all([
      context.params,
      readJson(request).then((body) => schema.parse(body)),
    ]);
    const memoryId = numericId(id, "memoria");
    const memory =
      input.action === "correct"
        ? await correctManagedMemory(memoryId, input)
        : await archiveManagedMemory(memoryId, input.action);
    return Response.json({ memory });
  } catch (error) {
    return v1Error(error, "No pude actualizar la memoria.");
  }
}
