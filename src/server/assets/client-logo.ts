import "server-only";

import { query, transaction, type DatabaseRow } from "@/server/db";

export const CLIENT_LOGO_MAX_BYTES = 750_000;
export const CLIENT_LOGO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

type ClientLogoType = (typeof CLIENT_LOGO_TYPES)[number];
type Row = DatabaseRow;

export class ClientLogoInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClientLogoInputError";
  }
}

function matchesSignature(bytes: Uint8Array, mimeType: ClientLogoType) {
  if (mimeType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === "image/png") {
    return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
      .every((value, index) => bytes[index] === value);
  }
  return bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46
    && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45
    && bytes[10] === 0x42 && bytes[11] === 0x50;
}

export function validateClientLogo(bytes: Uint8Array, mimeType: string): ClientLogoType {
  if (!CLIENT_LOGO_TYPES.includes(mimeType as ClientLogoType)) {
    throw new ClientLogoInputError("Usá una imagen JPG, PNG o WebP.");
  }
  if (bytes.byteLength === 0 || bytes.byteLength > CLIENT_LOGO_MAX_BYTES) {
    throw new ClientLogoInputError("La imagen es demasiado pesada. Elegí otra de hasta 750 KB.");
  }
  if (!matchesSignature(bytes, mimeType as ClientLogoType)) {
    throw new ClientLogoInputError("El archivo no parece ser una imagen válida.");
  }
  return mimeType as ClientLogoType;
}

export async function getClientLogo(userSlug: string, clientSlug: string) {
  const rows = await query<Row>(
    `select cl.mime_type, cl.image_data, cl.updated_at
    from public.client_logos cl
    join public.clients c on c.id = cl.client_id
    join public.users u on u.id = c.user_id
    where u.slug = $1 and c.slug = $2 and c.archived_at is null
    limit 1`,
    [userSlug, clientSlug],
  );
  return rows[0] ?? null;
}

export async function saveClientLogo(
  userSlug: string,
  clientSlug: string,
  bytes: Uint8Array,
  mimeType: string,
) {
  const safeType = validateClientLogo(bytes, mimeType);
  const version = Date.now();
  const logoUrl = `/api/clients/${encodeURIComponent(clientSlug)}/logo?v=${version}`;

  await transaction(async (tx) => {
    const clients = await tx.query<Row>(
      `select c.id from public.clients c
      join public.users u on u.id = c.user_id
      where u.slug = $1 and c.slug = $2 and c.archived_at is null
      limit 1`,
      [userSlug, clientSlug],
    );
    if (!clients[0]) throw new Error("No encontré ese cliente.");

    await tx.query(
      `insert into public.client_logos (client_id, mime_type, image_data, size_bytes, updated_at)
      values ($1,$2,$3,$4,now())
      on conflict (client_id) do update set
        mime_type = excluded.mime_type,
        image_data = excluded.image_data,
        size_bytes = excluded.size_bytes,
        updated_at = now()`,
      [clients[0].id, safeType, bytes, bytes.byteLength],
    );
    await tx.query(
      "update public.clients set logo_url = $2, updated_at = now() where id = $1",
      [clients[0].id, logoUrl],
    );
  });

  return logoUrl;
}

export async function removeClientLogo(userSlug: string, clientSlug: string) {
  await transaction(async (tx) => {
    const clients = await tx.query<Row>(
      `select c.id from public.clients c
      join public.users u on u.id = c.user_id
      where u.slug = $1 and c.slug = $2 and c.archived_at is null
      limit 1`,
      [userSlug, clientSlug],
    );
    if (!clients[0]) throw new Error("No encontré ese cliente.");
    await tx.query("delete from public.client_logos where client_id = $1", [clients[0].id]);
    await tx.query(
      "update public.clients set logo_url = null, updated_at = now() where id = $1",
      [clients[0].id],
    );
  });
}

