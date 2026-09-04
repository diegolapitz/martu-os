export type AuthMode = "supabase" | "legacy";

export function supabaseUrl(): string | null {
  const configured = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (configured) return configured.replace(/\/$/u, "");
  const ref = process.env.SUPABASE_PROJECT_REF?.trim();
  return ref ? `https://${ref}.supabase.co` : null;
}

export function supabasePublishableKey(): string | null {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    null
  );
}

export function isSupabaseAuthConfigured(): boolean {
  return Boolean(supabaseUrl() && supabasePublishableKey());
}

export function authMode(): AuthMode {
  if (isSupabaseAuthConfigured()) return "supabase";
  if (
    process.env.NODE_ENV !== "production" ||
    process.env.MARTU_ALLOW_LEGACY_AUTH === "true"
  ) {
    return "legacy";
  }
  throw new Error(
    "Supabase Auth es obligatorio en producción. Configurá NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
  );
}

export function assertSupabaseAuthConfigured(): {
  url: string;
  key: string;
} {
  const url = supabaseUrl();
  const key = supabasePublishableKey();
  if (!url || !key) {
    throw new Error(
      "Supabase Auth todavía no está configurado. Agregá NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }
  return { url, key };
}
