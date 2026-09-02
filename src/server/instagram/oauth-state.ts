import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type InstagramOAuthState = {
  nonce: string;
  clientSlug: string;
  issuedAt: number;
};

export const INSTAGRAM_OAUTH_COOKIE = "martu_instagram_oauth";

function signature(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createInstagramOAuthState(clientSlug: string, secret: string): {
  state: string;
  cookieValue: string;
} {
  const state = randomBytes(24).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    nonce: state,
    clientSlug,
    issuedAt: Date.now(),
  } satisfies InstagramOAuthState)).toString("base64url");
  return { state, cookieValue: `${payload}.${signature(payload, secret)}` };
}

export function verifyInstagramOAuthState(
  state: string,
  cookieValue: string | undefined,
  secret: string,
  now = Date.now(),
): InstagramOAuthState {
  const [payload, providedSignature] = cookieValue?.split(".") ?? [];
  if (!payload || !providedSignature || !state) throw new Error("La autorización de Instagram venció. Volvé a conectar la cuenta.");
  const expected = Buffer.from(signature(payload, secret));
  const provided = Buffer.from(providedSignature);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    throw new Error("No pude validar la autorización de Instagram. Volvé a intentarlo.");
  }
  let parsed: InstagramOAuthState;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as InstagramOAuthState;
  } catch {
    throw new Error("No pude validar la autorización de Instagram. Volvé a intentarlo.");
  }
  if (parsed.nonce !== state || !/^[a-z0-9-]{1,80}$/i.test(parsed.clientSlug)) {
    throw new Error("No pude validar la autorización de Instagram. Volvé a intentarlo.");
  }
  if (!Number.isFinite(parsed.issuedAt) || now - parsed.issuedAt > 10 * 60_000 || parsed.issuedAt > now + 30_000) {
    throw new Error("La autorización de Instagram venció. Volvé a conectar la cuenta.");
  }
  return parsed;
}
