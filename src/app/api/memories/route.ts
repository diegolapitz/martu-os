import { z } from "zod";

import { v1Error } from "@/server/api/v1-contract";
import { readJson } from "@/server/agent/http";
import { listClientChoicesV1 } from "@/server/data";
import {
  createManagedMemory,
  listManagedMemories,
} from "@/server/data/memory-domain";

export const runtime = "nodejs";

const createSchema = z
  .object({
    scope: z.enum(["global", "client"]),
    clientSlug: z.string().trim().min(1).max(120).nullable().optional(),
    category: z.string().trim().min(1).max(80),
    fact: z.string().trim().min(1).max(4_000),
    importance: z.number().int().min(1).max(5).optional(),
    memoryKind: z.string().trim().min(1).max(80).optional(),
  })
  .refine(
    (value) => value.scope === "global" || Boolean(value.clientSlug),
    "La memoria de cliente necesita un cliente.",
  );

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const scope = z
      .enum(["all", "global", "client"])
      .catch("all")
      .parse(url.searchParams.get("scope") ?? "all");
    const limit = Number(url.searchParams.get("limit") || 100);
    const [memories, clients] = await Promise.all([
      listManagedMemories({
        scope,
        clientSlug: url.searchParams.get("client") ?? undefined,
        includeGlobal: url.searchParams.get("includeGlobal") === "true",
        limit: Number.isFinite(limit) ? limit : 100,
      }),
      listClientChoicesV1(),
    ]);
    return Response.json(
      { memories, clients },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return v1Error(error, "No pude cargar las memorias.");
  }
}

export async function POST(request: Request) {
  try {
    const input = createSchema.parse(await readJson(request));
    return Response.json(
      { memory: await createManagedMemory(input) },
      { status: 201 },
    );
  } catch (error) {
    return v1Error(error, "No pude guardar la memoria.");
  }
}
