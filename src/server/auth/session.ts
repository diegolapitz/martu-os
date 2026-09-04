import "server-only";

import { cookies } from "next/headers";

import {
  MARTU_SESSION_COOKIE,
  MARTU_SESSION_MAX_AGE,
  createSessionToken,
  verifySessionToken,
  type MartuSession,
} from "./token";
import { requireAppUser, AppAuthenticationError } from "./app-user";
import { authMode } from "./config";

export class MartuAuthenticationError extends Error {
  readonly status = 401;

  constructor(message = "Necesitás iniciar sesión.") {
    super(message);
    this.name = "MartuAuthenticationError";
  }
}

export async function readLegacySession(): Promise<MartuSession | null> {
  const value = (await cookies()).get(MARTU_SESSION_COOKIE)?.value;
  return verifySessionToken(value);
}

export async function readMartuSession(): Promise<MartuSession | null> {
  if (authMode() === "legacy") return readLegacySession();
  try {
    const user = await requireAppUser();
    return {
      userId: user.id,
      userSlug: user.slug,
      authUserId: user.authUserId,
      issuedAt: 0,
      expiresAt: Number.MAX_SAFE_INTEGER,
      version: 2,
    };
  } catch (error) {
    if (error instanceof AppAuthenticationError) return null;
    throw error;
  }
}

export async function requireMartuSession(): Promise<MartuSession> {
  const session = await readMartuSession();
  if (!session) throw new MartuAuthenticationError();
  return session;
}

export async function setMartuSessionCookie(): Promise<void> {
  (await cookies()).set(MARTU_SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MARTU_SESSION_MAX_AGE,
    priority: "high",
  });
}

export async function clearMartuSessionCookie(): Promise<void> {
  (await cookies()).delete(MARTU_SESSION_COOKIE);
}
