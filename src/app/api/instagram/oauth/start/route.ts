import { cookies } from "next/headers";
import { z } from "zod";

import { jsonError, jsonOk, readJson } from "@/server/agent/http";
import { requireMartuSession } from "@/server/auth/session";
import {
  createInstagramOAuthState,
  getInstagramConfig,
  INSTAGRAM_OAUTH_COOKIE,
  InstagramApiClient,
} from "@/server/instagram";
import { requireSameOrigin } from "@/server/security/same-origin";

export const runtime = "nodejs";

const schema = z.object({
  clientSlug: z.string().trim().min(1).max(80).regex(/^[a-z0-9-]+$/i),
});

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    await requireMartuSession();
    const input = schema.parse(await readJson(request));
    const config = getInstagramConfig();
    const oauth = createInstagramOAuthState(input.clientSlug, config.oauthStateSecret);
    (await cookies()).set(INSTAGRAM_OAUTH_COOKIE, oauth.cookieValue, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/api/instagram/oauth/callback",
      maxAge: 10 * 60,
      priority: "high",
    });
    console.info("[instagram] OAuth started");
    return jsonOk({ authorizationUrl: new InstagramApiClient(config).authorizationUrl(oauth.state) });
  } catch (error) {
    return jsonError(error);
  }
}
