import { timingSafeEqual } from "node:crypto";

export type CronAuthorization =
  | { ok: true }
  | { ok: false; status: 401 | 503; message: string };

export function authorizeCron(request: Request, configuredSecret = process.env.CRON_SECRET): CronAuthorization {
  const secret = configuredSecret?.trim();
  if (!secret) return { ok: false, status: 503, message: "CRON_SECRET no está configurado." };
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return { ok: false, status: 401, message: "Falta el token del scheduler." };
  const provided = authorization.slice("Bearer ".length).trim();
  const expectedBuffer = Buffer.from(secret);
  const providedBuffer = Buffer.from(provided);
  if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) {
    return { ok: false, status: 401, message: "Token del scheduler inválido." };
  }
  return { ok: true };
}
