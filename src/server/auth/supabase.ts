import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { assertSupabaseAuthConfigured } from "./config";

export async function createSupabaseServerClient() {
  const { url, key } = assertSupabaseAuthConfigured();
  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot write cookies. Proxy refreshes them before
          // render; Route Handlers and Server Actions can still persist changes.
        }
      },
    },
  });
}
