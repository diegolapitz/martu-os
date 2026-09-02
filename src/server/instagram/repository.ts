import { query, transaction, type DbExecutor } from "@/server/db";
import type {
  InstagramConnectionDto,
  InstagramConnectionSecret,
  InstagramInsightRecord,
  InstagramMediaRecord,
  InstagramProfile,
} from "./types";

type Row = Record<string, unknown>;

function isConfigured(): boolean {
  return ["INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET", "INSTAGRAM_TOKEN_ENCRYPTION_KEY", "INSTAGRAM_OAUTH_STATE_SECRET"]
    .every((name) => Boolean(process.env[name]?.trim()));
}

function string(value: unknown): string {
  return String(value ?? "");
}

function optional(value: unknown): string | undefined {
  return value == null || String(value) === "" ? undefined : String(value);
}

function iso(value: unknown): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function jsonValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return value; }
}

function mapSecret(row: Row): InstagramConnectionSecret {
  return {
    id: string(row.id),
    clientId: string(row.client_id),
    clientSlug: string(row.client_slug),
    instagramAccountId: string(row.instagram_account_id),
    username: string(row.username),
    accountType: optional(row.account_type),
    encryptedAccessToken: string(row.encrypted_access_token),
    expiresAt: iso(row.expires_at),
    connectedAt: iso(row.connected_at) || new Date(0).toISOString(),
    status: string(row.status),
  };
}

export class InstagramSyncInProgressError extends Error {
  readonly status = 409;
  constructor() {
    super("Ya hay una sincronización de Instagram en curso para este cliente.");
    this.name = "InstagramSyncInProgressError";
  }
}

export async function upsertInstagramConnection(input: {
  clientSlug: string;
  profile: InstagramProfile;
  encryptedAccessToken: string;
  expiresAt?: string;
  scopes: readonly string[];
}): Promise<InstagramConnectionSecret> {
  const rows = await query<Row>(
    `insert into public.instagram_connections
      (client_id, instagram_account_id, username, account_type, profile_picture_url,
       encrypted_access_token, expires_at, scopes, status, connected_at, last_error)
     select c.id, $2, $3, $4, $5, $6, $7, $8, 'connected', now(), null
     from public.clients c join public.users u on u.id = c.user_id
     where c.slug = $1 and u.slug = 'martu' and c.archived_at is null
     on conflict (client_id) do update set
       instagram_account_id = excluded.instagram_account_id,
       username = excluded.username,
       account_type = excluded.account_type,
       profile_picture_url = excluded.profile_picture_url,
       encrypted_access_token = excluded.encrypted_access_token,
       expires_at = excluded.expires_at,
       scopes = excluded.scopes,
       status = 'connected',
       connected_at = now(),
       sync_started_at = null,
       last_error = null
     returning *`,
    [input.clientSlug, input.profile.id, input.profile.username, input.profile.accountType ?? null,
      input.profile.profilePictureUrl ?? null, input.encryptedAccessToken, input.expiresAt ?? null, [...input.scopes]],
  );
  if (!rows[0]) throw new Error("No encontré el cliente al que querés conectar Instagram.");
  return { ...mapSecret(rows[0]), clientSlug: input.clientSlug };
}

export async function getInstagramConnectionSecret(clientSlug: string): Promise<InstagramConnectionSecret | null> {
  const rows = await query<Row>(
    `select ic.*, c.slug as client_slug from public.instagram_connections ic
     join public.clients c on c.id = ic.client_id join public.users u on u.id = c.user_id
     where c.slug = $1 and u.slug = 'martu' limit 1`,
    [clientSlug],
  );
  return rows[0] ? mapSecret(rows[0]) : null;
}

export async function acquireInstagramSync(connectionId: string): Promise<void> {
  const rows = await query<Row>(
    `update public.instagram_connections set status = 'syncing', sync_started_at = now(), last_error = null
     where id = $1 and encrypted_access_token <> '' and status <> 'disconnected'
       and (status <> 'syncing' or sync_started_at < now() - interval '10 minutes')
     returning id`,
    [connectionId],
  );
  if (!rows[0]) throw new InstagramSyncInProgressError();
}

async function upsertMedia(
  tx: DbExecutor,
  connection: InstagramConnectionSecret,
  media: InstagramMediaRecord,
): Promise<string> {
  const rows = await tx.query<Row>(
    `insert into public.instagram_media
      (connection_id, content_item_id, instagram_media_id, media_type, media_product_type,
       caption, permalink, media_url, thumbnail_url, published_at, metadata)
     values ($1,
       (select p.content_item_id from public.publications p
        where p.client_id = $2 and lower(p.platform) = 'instagram' and p.external_id = $3 limit 1),
       $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
     on conflict (connection_id, instagram_media_id) do update set
       media_type = excluded.media_type,
       media_product_type = excluded.media_product_type,
       caption = excluded.caption,
       permalink = excluded.permalink,
       media_url = excluded.media_url,
       thumbnail_url = excluded.thumbnail_url,
       published_at = excluded.published_at,
       metadata = excluded.metadata,
       content_item_id = coalesce(public.instagram_media.content_item_id, excluded.content_item_id),
       last_synced_at = now()
     returning id`,
    [connection.id, connection.clientId, media.id, media.mediaType, media.mediaProductType ?? null,
      media.caption ?? null, media.permalink ?? null, media.mediaUrl ?? null, media.thumbnailUrl ?? null,
      media.timestamp ?? null, JSON.stringify({ username: media.username, likeCount: media.likeCount, commentsCount: media.commentsCount })],
  );
  return string(rows[0]?.id);
}

export async function saveInstagramSync(input: {
  connection: InstagramConnectionSecret;
  profile: InstagramProfile;
  media: Array<{ item: InstagramMediaRecord; insights: InstagramInsightRecord[] }>;
  accountInsights: InstagramInsightRecord[];
  encryptedAccessToken?: string;
  expiresAt?: string;
}): Promise<{ mediaCount: number; insightsCount: number }> {
  return transaction(async (tx) => {
    let insightsCount = 0;
    for (const { item, insights } of input.media) {
      const mediaId = await upsertMedia(tx, input.connection, item);
      const fallback: InstagramInsightRecord[] = [];
      if (item.likeCount != null) {
        fallback.push({ name: "likes", period: "lifetime", value: item.likeCount });
      }
      if (item.commentsCount != null) {
        fallback.push({ name: "comments", period: "lifetime", value: item.commentsCount });
      }
      const unique = new Map([...fallback, ...insights].map((insight) => [`${insight.name}:${insight.period}`, insight]));
      for (const insight of unique.values()) {
        await tx.query(
          `insert into public.instagram_media_insights (media_id, metric_name, metric_value, period, fetched_at)
           values ($1, $2, $3::jsonb, $4, now())
           on conflict (media_id, metric_name, period) do update set metric_value = excluded.metric_value, fetched_at = now()`,
          [mediaId, insight.name, JSON.stringify(insight.value ?? null), insight.period || "lifetime"],
        );
        insightsCount += 1;
      }
    }
    await tx.query("delete from public.instagram_account_insights where connection_id = $1", [input.connection.id]);
    for (const insight of input.accountInsights) {
      await tx.query(
        `insert into public.instagram_account_insights
          (connection_id, metric_name, metric_value, period, end_time, fetched_at)
         values ($1, $2, $3::jsonb, $4, $5, now())`,
        [input.connection.id, insight.name, JSON.stringify(insight.value ?? null), insight.period, insight.endTime ?? null],
      );
      insightsCount += 1;
    }
    await tx.query(
      `update public.instagram_connections set
        username = $2, account_type = $3, profile_picture_url = $4,
        encrypted_access_token = coalesce($5, encrypted_access_token),
        expires_at = coalesce($6, expires_at), status = 'connected', last_sync_at = now(),
        sync_started_at = null, last_error = null where id = $1`,
      [input.connection.id, input.profile.username, input.profile.accountType ?? null,
        input.profile.profilePictureUrl ?? null, input.encryptedAccessToken ?? null, input.expiresAt ?? null],
    );
    return { mediaCount: input.media.length, insightsCount };
  });
}

export async function markInstagramSyncFailed(connectionId: string, message: string, needsReauth: boolean): Promise<void> {
  await query(
    `update public.instagram_connections set status = $2, sync_started_at = null, last_error = $3 where id = $1`,
    [connectionId, needsReauth ? "needs_reauth" : "error", message.slice(0, 500)],
  );
}

export async function disconnectInstagram(clientSlug: string): Promise<void> {
  const rows = await query<Row>(
    `update public.instagram_connections ic set status = 'disconnected', encrypted_access_token = '',
       expires_at = null, sync_started_at = null, last_error = null
     from public.clients c join public.users u on u.id = c.user_id
     where ic.client_id = c.id and c.slug = $1 and u.slug = 'martu' returning ic.id`,
    [clientSlug],
  );
  if (!rows[0]) throw new Error("No encontré una conexión de Instagram para este cliente.");
}

export async function linkInstagramMedia(input: {
  clientSlug: string;
  mediaId: string;
  contentItemId: string | null;
}): Promise<void> {
  const rows = await query<Row>(
    `update public.instagram_media im set content_item_id = $3
     from public.instagram_connections ic join public.clients c on c.id = ic.client_id
     join public.users u on u.id = c.user_id
     where im.connection_id = ic.id and c.slug = $1 and u.slug = 'martu' and im.id = $2
       and ($3::bigint is null or exists (
         select 1 from public.content_items ci where ci.id = $3 and ci.client_id = c.id and ci.archived_at is null
       )) returning im.id`,
    [input.clientSlug, input.mediaId, input.contentItemId],
  );
  if (!rows[0]) throw new Error("No encontré esa publicación o el contenido no pertenece al cliente.");
}

export async function getInstagramConnectionDto(clientSlug: string): Promise<InstagramConnectionDto> {
  const connectionRows = await query<Row>(
    `select ic.id, ic.username, ic.account_type, ic.profile_picture_url, ic.status,
       ic.connected_at, ic.last_sync_at, ic.last_error, ic.expires_at
     from public.instagram_connections ic join public.clients c on c.id = ic.client_id
     join public.users u on u.id = c.user_id
     where c.slug = $1 and u.slug = 'martu' limit 1`,
    [clientSlug],
  );
  const connection = connectionRows[0];
  if (!connection) return { configured: isConfigured(), connected: false, media: [] };
  const mediaRows = await query<Row>(
    `select im.*, ci.title as content_title from public.instagram_media im
     left join public.content_items ci on ci.id = im.content_item_id
     where im.connection_id = $1 order by im.published_at desc nulls last limit 100`,
    [connection.id],
  );
  const insightRows = mediaRows.length ? await query<Row>(
    `select imi.media_id, imi.metric_name, imi.metric_value from public.instagram_media_insights imi
     join public.instagram_media im on im.id = imi.media_id
     where im.connection_id = $1 order by imi.fetched_at desc`,
    [connection.id],
  ) : [];
  const byMedia = new Map<string, Record<string, unknown>>();
  for (const row of insightRows) {
    const key = string(row.media_id);
    const metrics = byMedia.get(key) ?? {};
    if (!(string(row.metric_name) in metrics)) metrics[string(row.metric_name)] = jsonValue(row.metric_value);
    byMedia.set(key, metrics);
  }
  const status = string(connection.status);
  return {
    configured: isConfigured(),
    connected: status !== "disconnected" && status !== "needs_reauth",
    id: string(connection.id),
    username: string(connection.username),
    accountType: optional(connection.account_type) ?? null,
    profilePictureUrl: optional(connection.profile_picture_url) ?? null,
    status,
    connectedAt: iso(connection.connected_at),
    lastSyncAt: iso(connection.last_sync_at) ?? null,
    lastError: optional(connection.last_error) ?? null,
    expiresAt: iso(connection.expires_at) ?? null,
    media: mediaRows.map((row) => ({
      id: string(row.id),
      instagramMediaId: string(row.instagram_media_id),
      mediaType: string(row.media_type),
      mediaProductType: optional(row.media_product_type) ?? null,
      caption: optional(row.caption) ?? null,
      permalink: optional(row.permalink) ?? null,
      mediaUrl: optional(row.media_url) ?? null,
      thumbnailUrl: optional(row.thumbnail_url) ?? null,
      publishedAt: iso(row.published_at) ?? null,
      contentItemId: optional(row.content_item_id) ?? null,
      contentTitle: optional(row.content_title) ?? null,
      insights: byMedia.get(string(row.id)) ?? {},
    })),
  };
}
