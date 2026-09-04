import { NextResponse } from "next/server";

import { isSupabaseAuthConfigured } from "@/server/auth/config";
import { clearMartuSessionCookie } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/auth/supabase";

export async function POST() {
  if (isSupabaseAuthConfigured()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut({ scope: "local" });
  } else {
    await clearMartuSessionCookie();
  }
  return NextResponse.json({ ok: true });
}
