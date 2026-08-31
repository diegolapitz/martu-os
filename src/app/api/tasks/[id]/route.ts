import { NextResponse } from "next/server";
import { z } from "zod";

import { updateTask } from "@/server/data";

export const runtime = "nodejs";

const taskSchema = z.object({ status: z.enum(["pending", "completed"]) });

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const [{ id }, input] = await Promise.all([context.params, request.json().then((body) => taskSchema.parse(body))]);
    if (!/^\d+$/.test(id)) {
      return NextResponse.json({ message: "Identificador de tarea inválido." }, { status: 400 });
    }
    const task = await updateTask({ taskId: id, status: input.status });
    return NextResponse.json({ task });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: "Estado de tarea inválido.", issues: error.issues }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "No pude actualizar la tarea.";
    return NextResponse.json({ message }, { status: /no encontr/i.test(message) ? 404 : 500 });
  }
}
