import "server-only";

export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (origin && origin !== new URL(request.url).origin) throw new Error("Origen de solicitud no válido.");
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) {
    throw new Error("Origen de solicitud no válido.");
  }
}

