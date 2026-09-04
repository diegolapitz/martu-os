import { NextResponse } from "next/server";

import { authErrorMessage, resetSchema } from "@/server/auth/forms";
import { createSupabaseServerClient } from "@/server/auth/supabase";

export async function POST(request: Request) {
  try {
    const input = resetSchema.parse(await request.json());
    const supabase = await createSupabaseServerClient();
    const origin = new URL(request.url).origin;
    const { error } = await supabase.auth.resetPasswordForEmail(input.email, {
      redirectTo: `${origin}/auth/callback?next=/auth/update-password`,
    });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    const validation =
      error && typeof error === "object" && "issues" in error
        ? String((error as { issues?: Array<{ message?: string }> }).issues?.[0]?.message || "Revisá el email.")
        : null;
    return NextResponse.json(
      { message: validation || authErrorMessage(error, "No pude enviar el email.") },
      { status: validation ? 400 : 429 },
    );
  }
}
