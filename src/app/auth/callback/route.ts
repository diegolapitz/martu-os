import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseServerClient } from "@/server/auth/supabase";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const requested = request.nextUrl.searchParams.get("next");
  const destination =
    requested?.startsWith("/") && !requested.startsWith("//")
      ? requested
      : "/onboarding";
  if (!code) {
    return NextResponse.redirect(new URL("/?authError=missing-code", request.url));
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/?authError=expired-link", request.url));
  }
  return NextResponse.redirect(new URL(destination, request.url));
}
