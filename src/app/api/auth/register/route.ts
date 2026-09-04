import { NextResponse } from "next/server";

import { authErrorMessage, registrationSchema } from "@/server/auth/forms";
import { createSupabaseServerClient } from "@/server/auth/supabase";

export async function POST(request: Request) {
  try {
    const input = registrationSchema.parse(await request.json());
    const supabase = await createSupabaseServerClient();
    const origin = new URL(request.url).origin;
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: { name: input.name, preferred_name: input.name },
        emailRedirectTo: `${origin}/auth/callback?next=/onboarding`,
      },
    });
    if (error) throw error;
    return NextResponse.json({
      ok: true,
      confirmationRequired: !data.session,
    });
  } catch (error) {
    const validation =
      error && typeof error === "object" && "issues" in error
        ? String((error as { issues?: Array<{ message?: string }> }).issues?.[0]?.message || "Revisá los datos.")
        : null;
    return NextResponse.json(
      { message: validation || authErrorMessage(error, "No pude crear la cuenta.") },
      { status: 400 },
    );
  }
}
