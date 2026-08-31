import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { MARTU_SESSION_COOKIE, verifySessionToken } from "@/server/auth/token";

const publicPaths = new Set([
  "/",
  "/api/session/start",
  "/api/scheduler/tick",
  "/api/push/public-key",
  "/api/push/test",
]);

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const session = verifySessionToken(request.cookies.get(MARTU_SESSION_COOKIE)?.value);

  if (path === "/" && session) {
    return NextResponse.redirect(new URL("/day", request.url));
  }
  if (publicPaths.has(path)) return NextResponse.next();
  if (session) return NextResponse.next();

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
