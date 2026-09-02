import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requireMartuSession } from "@/server/auth/session";
import {
  getInstagramConfig,
  INSTAGRAM_OAUTH_COOKIE,
  InstagramSyncService,
  verifyInstagramOAuthState,
} from "@/server/instagram";
export const runtime = "nodejs";

function clientUrl(request: Request, slug: string, status: string, message?: string) {
  const url = new URL(`/clients/${encodeURIComponent(slug)}/metricas`, request.url);
  url.searchParams.set("instagram", status);
  if (message) url.searchParams.set("message", message.slice(0, 180));
  return url;
}

function clearOAuthCookie(response: NextResponse) {
  response.cookies.set(INSTAGRAM_OAUTH_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/instagram/oauth/callback",
    maxAge: 0,
  });
}

export async function GET(request: NextRequest) {
  let clientSlug = "gavilan";
  try {
    await requireMartuSession();
    const config = getInstagramConfig();
    const url = new URL(request.url);
    const state = url.searchParams.get("state") || "";
    const verified = verifyInstagramOAuthState(
      state,
      request.cookies.get(INSTAGRAM_OAUTH_COOKIE)?.value,
      config.oauthStateSecret,
    );
    clientSlug = verified.clientSlug;
    if (url.searchParams.get("error")) {
      const response = NextResponse.redirect(clientUrl(request, clientSlug, "cancelled"));
      clearOAuthCookie(response);
      return response;
    }
    const code = (url.searchParams.get("code") || "").replace(/#_$/, "");
    if (!code) throw new Error("Instagram no devolvió el código de autorización.");
    await new InstagramSyncService(config).connectFromAuthorizationCode(clientSlug, code);
    const response = NextResponse.redirect(clientUrl(request, clientSlug, "connected"));
    clearOAuthCookie(response);
    return response;
  } catch (error) {
    console.error("[instagram] OAuth callback failure");
    const message = error instanceof Error ? error.message : "No pude conectar Instagram.";
    const response = NextResponse.redirect(clientUrl(request, clientSlug, "error", message));
    clearOAuthCookie(response);
    return response;
  }
}
