import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

import { cookies } from "next/headers";

import { query, type DbExecutor } from "@/server/db";

import { authMode } from "./config";
import { createSupabaseServerClient } from "./supabase";
import { MARTU_SESSION_COOKIE, verifySessionToken } from "./token";

type Executor = Pick<DbExecutor, "query">;

export type AppUser = {
  id: string;
  slug: string;
  name: string;
  preferredName: string;
  email: string | null;
  timezone: string;
  authUserId: string | null;
  avatarUrl: string | null;
  description: string;
};

type UserRow = Record<string, unknown>;
type AuthIdentity = {
  id: string;
  email: string | null;
  name: string;
};

const appUserScope = new AsyncLocalStorage<string>();

const DEFAULT_SERVICES = [
  ["strategy", "Estrategia", "compass"],
  ["community-management", "Community Management", "messages-square"],
  ["content-creation", "Creación de contenido", "clapperboard"],
  ["ideas-planning", "Ideas / planificación", "lightbulb"],
  ["scripts", "Guiones", "scroll-text"],
  ["recording", "Grabación", "video"],
  ["editing", "Edición", "scissors"],
  ["publishing", "Publicación", "send"],
  ["stories", "Historias", "circle-play"],
  ["metrics-reporting", "Métricas / reporting", "chart-no-axes-combined"],
  ["meta-ads", "Meta Ads", "badge-dollar-sign"],
  ["google-ads", "Google Ads", "search"],
  ["meetings-account-management", "Reuniones / account management", "handshake"],
] as const;

export async function requireAppUser(
  executor: Executor = { query },
): Promise<AppUser> {
  const scopedId = appUserScope.getStore();
  if (scopedId) {
    const rows = await executor.query<UserRow>(
      "select * from public.users where id = $1 limit 1",
      [scopedId],
    );
    if (!rows[0]) throw new Error("El usuario de prueba no existe.");
    return userDto(rows[0]);
  }

  if (authMode() === "legacy") {
    const legacy =
      process.env.NODE_ENV === "test"
        ? undefined
        : verifySessionToken(
            (await cookies()).get(MARTU_SESSION_COOKIE)?.value,
          );
    if (!legacy && process.env.NODE_ENV !== "test") {
      throw new AppAuthenticationError();
    }
    const slug = legacy?.userSlug ?? "martu";
    const rows = await executor.query<UserRow>(
      "select * from public.users where slug = $1 limit 1",
      [slug],
    );
    if (!rows[0]) throw new AppAuthenticationError();
    return userDto(rows[0]);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const subject = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  if (error || !subject) throw new AppAuthenticationError();
  const claims = (data?.claims ?? {}) as Record<string, unknown>;
  const metadata = objectValue(claims.user_metadata);
  return ensureAppUser(
    executor,
    {
      id: subject,
      email: typeof claims.email === "string" ? claims.email : null,
      name:
        stringValue(metadata.name) ||
        stringValue(metadata.full_name) ||
        emailName(typeof claims.email === "string" ? claims.email : null),
    },
  );
}

export async function requireAppUserId(executor?: Executor): Promise<string> {
  return (await requireAppUser(executor)).id;
}

export async function requireAppUserSlug(executor?: Executor): Promise<string> {
  return (await requireAppUser(executor)).slug;
}

export async function updateAppUserProfile(input: {
  name?: string;
  timezone?: string;
  description?: string;
}): Promise<AppUser> {
  const userId = await requireAppUserId();
  const rows = await query<UserRow>(
    `update public.users set
      name = coalesce($2, name),
      preferred_name = coalesce($2, preferred_name),
      timezone = coalesce($3, timezone),
      profile_description = coalesce($4, profile_description),
      updated_at = now()
    where id = $1 returning *`,
    [userId, input.name ?? null, input.timezone ?? null, input.description ?? null],
  );
  if (!rows[0]) throw new Error("No pude actualizar tu perfil.");
  return userDto(rows[0]);
}

export async function runAsTestUser<T>(
  userId: string,
  work: () => Promise<T>,
): Promise<T> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("La suplantación de usuario está deshabilitada en producción.");
  }
  return appUserScope.run(userId, work);
}

/** Binds an already-authorized server job to the single alpha workspace. */
export async function runAsSystemUser<T>(
  userId: string,
  work: () => Promise<T>,
): Promise<T> {
  return appUserScope.run(userId, work);
}

export class AppAuthenticationError extends Error {
  readonly status = 401;

  constructor(message = "Necesitás iniciar sesión.") {
    super(message);
    this.name = "AppAuthenticationError";
  }
}

async function ensureAppUser(
  executor: Executor,
  identity: AuthIdentity,
): Promise<AppUser> {
  const existing = await executor.query<UserRow>(
    "select * from public.users where auth_user_id = $1 limit 1",
    [identity.id],
  );
  if (existing[0]) return userDto(existing[0]);

  const base = slugify(identity.name || emailName(identity.email));
  const slug = `${base}-${identity.id.replace(/-/gu, "").slice(0, 8)}`;
  const rows = await executor.query<UserRow>(
    `insert into public.users
      (auth_user_id, slug, name, preferred_name, email, timezone, profile_description)
     values ($1,$2,$3,$3,$4,'America/Argentina/Buenos_Aires','')
     on conflict (auth_user_id) do update set email = coalesce(excluded.email, public.users.email)
     returning *`,
    [identity.id, slug, identity.name || "Freelancer", identity.email],
  );
  const user = rows[0];
  if (!user) throw new Error("No pude preparar tu espacio personal.");

  await executor.query(
    `insert into public.onboarding_states (user_id)
     values ($1) on conflict (user_id) do nothing`,
    [user.id],
  );
  await executor.query(
    `insert into public.communication_profiles (user_id)
     values ($1) on conflict (user_id) do nothing`,
    [user.id],
  );
  for (const [index, [serviceSlug, name, icon]] of DEFAULT_SERVICES.entries()) {
    await executor.query(
      `insert into public.services
        (user_id, slug, name, short_name, sort_order, is_custom, icon)
       values ($1,$2,$3,$3,$4,false,$5)
       on conflict (user_id, slug) do nothing`,
      [user.id, serviceSlug, name, (index + 1) * 10, icon],
    );
  }
  return userDto(user);
}

function userDto(row: UserRow): AppUser {
  const name = String(row.name ?? "Freelancer");
  return {
    id: String(row.id),
    slug: String(row.slug),
    name,
    preferredName: String(row.preferred_name ?? name),
    email: row.email == null ? null : String(row.email),
    timezone: String(row.timezone ?? "America/Argentina/Buenos_Aires"),
    authUserId: row.auth_user_id == null ? null : String(row.auth_user_id),
    avatarUrl: row.avatar_url == null ? null : String(row.avatar_url),
    description: String(row.profile_description ?? ""),
  };
}

function emailName(email: string | null): string {
  const local = email?.split("@")[0]?.replace(/[._-]+/gu, " ").trim();
  return local ? local.replace(/\b\p{L}/gu, (letter) => letter.toUpperCase()) : "Freelancer";
}

function slugify(value: string): string {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/gu, "")
      .toLocaleLowerCase("es-AR")
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-+|-+$/gu, "")
      .slice(0, 48) || "freelancer"
  );
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
