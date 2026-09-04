import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { assertSupabaseAuthConfigured } from "./config";

export async function refreshSupabaseSession(request: NextRequest): Promise<{
  authenticated: boolean;
  response: NextResponse;
}> {
  const { url, key } = assertSupabaseAuthConfigured();
  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });
  const { data, error } = await supabase.auth.getClaims();
  return {
    authenticated: !error && typeof data?.claims?.sub === "string",
    response,
  };
}
