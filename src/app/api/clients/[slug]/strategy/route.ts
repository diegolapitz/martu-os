import { z } from "zod";

import { normalizeV1Status, v1Error } from "@/server/api/v1-contract";
import { saveStrategyV1 } from "@/server/data";
import { readJson } from "@/server/agent/http";

export const runtime = "nodejs";

const textList = z.array(z.string().trim().min(1).max(1_000)).max(60).optional();
const schema = z.object({
  title: z.string().trim().min(1).max(180).optional(),
  status: z.string().trim().max(40).optional(),
  objectives: textList,
  audience: z.string().max(8_000).optional(),
  tone: z.string().max(4_000).optional(),
  positioning: z.string().max(8_000).optional(),
  pillars: textList,
  hypotheses: textList,
  decisions: textList,
  notes: z.string().max(20_000).optional(),
  changeSummary: z.string().max(2_000).optional(),
  createVersion: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, "No hay cambios para guardar.");

export async function PATCH(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const [{ slug }, input] = await Promise.all([context.params, readJson(request).then((body) => schema.parse(body))]);
    const strategy = await saveStrategyV1(decodeURIComponent(slug), { ...input, status: normalizeV1Status("strategy", input.status) });
    return Response.json({ strategy: { ...strategy, status: strategy.status ? String(strategy.status) : undefined } });
  } catch (error) {
    return v1Error(error, "No pude guardar la estrategia.");
  }
}
