import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { MARTU_SESSION_COOKIE, verifySessionToken } from "@/server/auth/token";
import { authMode } from "@/server/auth/config";
import { refreshSupabaseSession } from "@/server/auth/proxy-session";

const publicPaths = new Set([
  "/",
  "/api/session/start",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/reset",
  "/auth/callback",
  "/auth/update-password",
  "/api/scheduler/tick",
  "/api/push/public-key",
  "/api/push/test",
]);

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const supabaseAuth = authMode() === "supabase";
  const refreshed = supabaseAuth
    ? await refreshSupabaseSession(request)
    : null;
  const authenticated = refreshed
    ? refreshed.authenticated
    : Boolean(
        verifySessionToken(request.cookies.get(MARTU_SESSION_COOKIE)?.value),
      );

  if (publicPaths.has(path) || path.startsWith("/api/auth/")) {
    return refreshed?.response ?? NextResponse.next();
  }
  if (authenticated) return refreshed?.response ?? NextResponse.next();

  if (path.startsWith("/api/")) {
    return NextResponse.json({ message: "Necesitás iniciar sesión." }, { status: 401 });
  }

  const login = new URL("/", request.url);
  login.searchParams.set("next", `${path}${request.nextUrl.search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)"],
};
