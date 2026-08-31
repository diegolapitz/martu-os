import { NextResponse } from "next/server";
import { z } from "zod";

import { createNote } from "@/server/data";

export const runtime = "nodejs";

const noteSchema = z.object({
  clientSlug: z.string().trim().min(1).max(80),
  text: z.string().trim().min(1, "La nota no puede estar vacía.").max(8_000),
  tags: z.array(z.string().trim().min(1).max(64)).max(12).optional(),
});

export async function POST(request: Request) {
  try {
    const input = noteSchema.parse(await request.json());
    const note = await createNote({ ...input, source: "web" });
    return NextResponse.json({ note }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: error.issues[0]?.message ?? "La nota no es válida.", issues: error.issues },
        { status: 400 },
      );
    }
    const message = error instanceof Error ? error.message : "No pude guardar la nota.";
    return NextResponse.json({ message }, { status: /no existe|no encontr/i.test(message) ? 404 : 500 });
  }
}
