import "server-only";

import { requireAppUserId } from "@/server/auth";
import { query, transaction, type DatabaseRow } from "@/server/db";

import {
  CLIENT_LOGO_MAX_BYTES,
  ClientLogoInputError,
  validateClientLogo,
} from "./client-logo";

type Row = DatabaseRow;

export { CLIENT_LOGO_MAX_BYTES, ClientLogoInputError as UserAvatarInputError };

export async function getUserAvatar() {
  const userId = await requireAppUserId();
  const rows = await query<Row>(
    "select mime_type, image_data, updated_at from public.user_avatars where user_id = $1 limit 1",
    [userId],
  );
  return rows[0] ?? null;
}

export async function saveUserAvatar(
  bytes: Uint8Array,
  mimeType: string,
): Promise<string> {
  const safeType = validateClientLogo(bytes, mimeType);
  const userId = await requireAppUserId();
  const avatarUrl = `/api/profile/avatar?v=${Date.now()}`;
  await transaction(async (tx) => {
    await tx.query(
      `insert into public.user_avatars
        (user_id, mime_type, image_data, size_bytes, updated_at)
       values ($1,$2,$3,$4,now())
       on conflict (user_id) do update set
         mime_type = excluded.mime_type,
         image_data = excluded.image_data,
         size_bytes = excluded.size_bytes,
         updated_at = now()`,
      [userId, safeType, bytes, bytes.byteLength],
    );
    await tx.query(
      "update public.users set avatar_url = $2, updated_at = now() where id = $1",
      [userId, avatarUrl],
    );
  });
  return avatarUrl;
}

export async function removeUserAvatar(): Promise<void> {
  const userId = await requireAppUserId();
  await transaction(async (tx) => {
    await tx.query("delete from public.user_avatars where user_id = $1", [userId]);
    await tx.query(
      "update public.users set avatar_url = null, updated_at = now() where id = $1",
      [userId],
    );
  });
}
