import { NextResponse } from "next/server";

import { authErrorMessage, passwordSchema } from "@/server/auth/forms";
import { createSupabaseServerClient } from "@/server/auth/supabase";

export async function POST(request: Request) {
  try {
    const input = passwordSchema.parse(await request.json());
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.updateUser({ password: input.password });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: authErrorMessage(error, "No pude actualizar la contraseña.") },
      { status: 400 },
    );
  }
}
