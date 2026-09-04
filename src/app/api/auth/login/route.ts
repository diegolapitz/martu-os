import { NextResponse } from "next/server";

import {
  authErrorMessage,
  credentialsSchema,
} from "@/server/auth/forms";
import { createSupabaseServerClient } from "@/server/auth/supabase";

export async function POST(request: Request) {
  try {
    const input = credentialsSchema.parse(await request.json());
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword(input);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    const validation =
      error && typeof error === "object" && "issues" in error
        ? String((error as { issues?: Array<{ message?: string }> }).issues?.[0]?.message || "Revisá los datos.")
        : null;
    return NextResponse.json(
      { message: validation || authErrorMessage(error, "No pude iniciar la sesión.") },
      { status: validation ? 400 : 401 },
    );
  }
}
