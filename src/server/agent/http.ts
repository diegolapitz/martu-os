import { ZodError } from "zod";

export function jsonOk<T>(data: T, init?: ResponseInit): Response {
  return Response.json(data, { ...init, headers: { "cache-control": "no-store", ...init?.headers } });
}

export function jsonError(error: unknown, fallbackStatus = 500): Response {
  if (error instanceof ZodError) {
    return jsonOk({ error: "invalid_request", message: "Hay datos inválidos.", details: error.issues }, { status: 400 });
  }
  const message = error instanceof Error ? error.message : "Error inesperado.";
  const status = /no puede estar vac[ií]o|falta indicar|no encontr[eé]|inv[aá]lid|demasiado grande|JSON v[aá]lido/i.test(message)
    ? 400
    : /OPENAI_API_KEY|configurar|DATABASE_URL|VAPID/i.test(message)
      ? 503
      : fallbackStatus;
  return jsonOk({ error: status >= 500 ? "server_error" : "invalid_request", message }, { status });
}

export async function readJson(request: Request, maxBytes = 64 * 1024): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > maxBytes) throw new Error("El pedido es demasiado grande.");
  const text = await request.text();
  if (!text.trim()) return {};
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new Error("El pedido es demasiado grande.");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("El cuerpo debe ser JSON válido.");
  }
}
