import { z } from "zod";

import { readJson } from "@/server/agent/http";
import { numericId, v1Error } from "@/server/api/v1-contract";
import { archiveInsightV1, updateInsightV1 } from "@/server/data";

export const runtime = "nodejs";

const referenceId = z.string().regex(/^\d+$/).nullable().optional();
const schema = z
  .object({
    kind: z
      .enum(["observation", "pattern", "hypothesis", "recommendation"])
      .optional(),
    statement: z.string().trim().min(1).max(4_000).optional(),
    evidence: z
      .record(z.string(), z.unknown())
      .refine(
        (value) => JSON.stringify(value).length <= 20_000,
        "La evidencia es demasiado extensa.",
      )
      .optional(),
    confidence: z.number().min(0).max(1).nullable().optional(),
    contentItemId: referenceId,
    publicationId: referenceId,
    campaignId: referenceId,
    creativeId: referenceId,
  })
  .refine((value) => Object.keys(value).length > 0, "No hay cambios para guardar.");

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const [{ id }, input] = await Promise.all([
      context.params,
      readJson(request).then((body) => schema.parse(body)),
    ]);
    const insight = await updateInsightV1(
      numericId(id, "insight"),
      input,
    );
    return Response.json({ insight });
  } catch (error) {
    return v1Error(error, "No pude guardar el insight.");
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    await archiveInsightV1(numericId(id, "insight"));
    return Response.json({ ok: true });
  } catch (error) {
    return v1Error(error, "No pude archivar el insight.");
  }
}
