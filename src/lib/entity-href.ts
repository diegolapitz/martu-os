export type EntityLinkInput = {
  clientSlug?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  fallback?: string;
};

const sectionByType: Record<string, string> = {
  idea: "ideas",
  script: "guiones",
  content: "contenido",
  content_item: "contenido",
  publication: "publicacion",
  metric: "metricas",
  metrics: "metricas",
  insight: "metricas",
  campaign: "pauta",
  ad_campaign: "pauta",
  creative: "pauta",
  meeting: "notas",
  note: "notas",
  file: "archivos",
  task: "calendario",
  commitment: "calendario",
  calendar_event: "calendario",
};

function normalizeType(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("es")
    .replace(/[\s-]+/g, "_");
}

export function entityHref({
  clientSlug,
  entityType,
  entityId,
  fallback = "/work",
}: EntityLinkInput) {
  const type = normalizeType(entityType);
  if (type === "task" && entityId)
    return `/work?item=${encodeURIComponent(entityId)}`;
  if (!clientSlug) return fallback;

  const section = sectionByType[type];
  if (!section) return `/clients/${encodeURIComponent(clientSlug)}`;

  const base = `/clients/${encodeURIComponent(clientSlug)}/${section}`;
  return entityId ? `${base}/${encodeURIComponent(entityId)}` : base;
}

export function clientSectionHref(
  clientSlug: string,
  section = "resumen",
  entityId?: string | null,
) {
  const base =
    section === "resumen"
      ? `/clients/${encodeURIComponent(clientSlug)}`
      : `/clients/${encodeURIComponent(clientSlug)}/${encodeURIComponent(section)}`;
  return entityId ? `${base}/${encodeURIComponent(entityId)}` : base;
}
