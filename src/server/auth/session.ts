import "server-only";

import { cookies } from "next/headers";

import {
  MARTU_SESSION_COOKIE,
  MARTU_SESSION_MAX_AGE,
  createSessionToken,
  verifySessionToken,
  type MartuSession,
} from "./token";

export class MartuAuthenticationError extends Error {
  readonly status = 401;

  constructor(message = "Necesitás iniciar sesión.") {
    super(message);
    this.name = "MartuAuthenticationError";
  }
}

export async function readMartuSession(): Promise<MartuSession | null> {
  const value = (await cookies()).get(MARTU_SESSION_COOKIE)?.value;
  return verifySessionToken(value);
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
