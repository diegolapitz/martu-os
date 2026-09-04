import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const MARTU_SESSION_COOKIE = "martu_session";
export const MARTU_SESSION_MAX_AGE = 60 * 60 * 24 * 30;

export interface MartuSession {
  userId?: string;
  userSlug: string;
  authUserId?: string | null;
  issuedAt: number;
  expiresAt: number;
  version: 1 | 2;
}

function production() {
  return process.env.NODE_ENV === "production";
}

export function sessionSecret(): string {
  const configured = process.env.MARTU_SESSION_SECRET?.trim();
  if (configured) return configured;
  if (production()) throw new Error("MARTU_SESSION_SECRET is required in production.");
  return "martu-os-local-development-session-secret-only";
}

function encode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signature(encodedPayload: string) {
  return createHmac("sha256", sessionSecret()).update(encodedPayload).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createSessionToken(now = new Date()): string {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const payload: MartuSession = {
    userSlug: "martu",
    issuedAt,
    expiresAt: issuedAt + MARTU_SESSION_MAX_AGE,
    version: 1,
  };
  const encoded = encode(JSON.stringify(payload));
  return `${encoded}.${signature(encoded)}`;
}

export function verifySessionToken(token: string | undefined, now = new Date()): MartuSession | null {
  if (!token) return null;
  try {
    const [encoded, provided, extra] = token.split(".");
    if (!encoded || !provided || extra || !safeEqual(signature(encoded), provided)) return null;
    const payload = JSON.parse(decode(encoded)) as Partial<MartuSession>;
    const current = Math.floor(now.getTime() / 1000);
    if (!payload.userSlug || payload.version !== 1) return null;
    if (!Number.isInteger(payload.issuedAt) || !Number.isInteger(payload.expiresAt)) return null;
    if (Number(payload.issuedAt) > current + 60 || Number(payload.expiresAt) <= current) return null;
    return payload as MartuSession;
  } catch {
    return null;
  }
}

export function accessCodeConfigured() {
  return Boolean(process.env.MARTU_ACCESS_CODE?.trim());
}

export function assertAccessConfiguration() {
  if (production() && !accessCodeConfigured()) {
    throw new Error("MARTU_ACCESS_CODE is required in production.");
  }
  sessionSecret();
}

export function verifyAccessCode(value: string | undefined): boolean {
  const expected = process.env.MARTU_ACCESS_CODE?.trim();
  if (!expected) return !production();
  if (!value) return false;
  const expectedHash = createHash("sha256").update(expected).digest();
  const providedHash = createHash("sha256").update(value).digest();
  return timingSafeEqual(expectedHash, providedHash);
}
