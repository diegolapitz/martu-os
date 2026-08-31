import { z } from "zod";

import { readJson } from "@/server/agent/http";
import { v1Error } from "@/server/api/v1-contract";
import { createInsightV1, listInsightsV1 } from "@/server/data";

export const runtime = "nodejs";

const insightKind = z.enum([
  "observation",
  "pattern",
  "hypothesis",
  "recommendation",
]);
const insightSurface = z.enum(["metrics", "ads"]);
const referenceId = z.string().regex(/^\d+$/).nullable().optional();
const evidence = z
  .record(z.string(), z.unknown())
  .refine(
    (value) => JSON.stringify(value).length <= 20_000,
    "La evidencia es demasiado extensa.",
  );

const createSchema = z.object({
  clientSlug: z.string().trim().min(1).max(80),
  kind: insightKind,
  statement: z.string().trim().min(1, "El insight necesita una lectura.").max(4_000),
  evidence: evidence.optional().default({}),
  confidence: z.number().min(0).max(1).nullable().optional(),
  contentItemId: referenceId,
  publicationId: referenceId,
  campaignId: referenceId,
  creativeId: referenceId,
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const params = z
      .object({
        clientSlug: z.string().trim().min(1).max(80),
        surface: insightSurface.optional(),
        includeArchived: z.enum(["true", "false"]).optional(),
        limit: z.coerce.number().int().min(1).max(200).optional(),
      })
      .parse({
        clientSlug: url.searchParams.get("client") ?? "",
        surface: url.searchParams.get("surface") ?? undefined,
        includeArchived: url.searchParams.get("archived") ?? undefined,
        limit: url.searchParams.get("limit") ?? undefined,
      });
    const insights = await listInsightsV1({
      clientSlug: params.clientSlug,
      surface: params.surface,
      includeArchived: params.includeArchived === "true",
      limit: params.limit,
    });
    return Response.json({ insights });
  } catch (error) {
    return v1Error(error, "No pude cargar los insights.");
  }
}

export async function POST(request: Request) {
  try {
    const input = createSchema.parse(await readJson(request));
    const insight = await createInsightV1(input);
    return Response.json({ insight }, { status: 201 });
  } catch (error) {
    return v1Error(error, "No pude guardar el insight.");
  }
}
