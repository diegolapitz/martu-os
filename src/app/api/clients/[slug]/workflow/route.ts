import { z } from "zod";

import { v1Error } from "@/server/api/v1-contract";
import { saveWorkflowStatesV1 } from "@/server/data";
import { readJson } from "@/server/agent/http";

export const runtime = "nodejs";

const schema = z.object({ states: z.array(z.object({
  slug: z.string().trim().max(80).optional(), label: z.string().trim().min(1).max(80),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(), terminalKind: z.enum(["delivered", "published", "cancelled"]).nullable().optional(),
})).min(1).max(30) }).superRefine((value, context) => {
  const labels = value.states.map((item) => item.label.toLocaleLowerCase("es"));
  if (new Set(labels).size !== labels.length) context.addIssue({ code: "custom", message: "No puede haber estados repetidos.", path: ["states"] });
});

export async function PATCH(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const [{ slug }, input] = await Promise.all([context.params, readJson(request).then((body) => schema.parse(body))]);
    return Response.json({ states: await saveWorkflowStatesV1(decodeURIComponent(slug), input) });
  } catch (error) { return v1Error(error, "No pude guardar el flujo."); }
}
