import "server-only";

import type {
  InstagramConfig,
  InstagramInsightRecord,
  InstagramMediaRecord,
  InstagramProfile,
} from "./types";

type FetchLike = typeof fetch;
type MetaErrorBody = { error?: { code?: number; error_subcode?: number; type?: string } };

export class InstagramApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: number,
    readonly subcode?: number,
  ) {
    super(message);
    this.name = "InstagramApiError";
  }

  get needsReauthorization() {
    return this.code === 190 || this.status === 401;
  }
}

type TokenResponse = { access_token: string; user_id?: string; expires_in?: number };
type Page<T> = { data?: T[]; paging?: { next?: string } };
type RawProfile = {
  id?: string;
  user_id?: string;
  username?: string;
  name?: string;
  account_type?: string;
  profile_picture_url?: string;
  media_count?: number;
  followers_count?: number;
};
type RawMedia = {
  id?: string;
  media_type?: string;
  media_product_type?: string;
  caption?: string;
  permalink?: string;
  media_url?: string;
  thumbnail_url?: string;
  timestamp?: string;
  username?: string;
  like_count?: number;
  comments_count?: number;
};
type RawInsight = {
  name?: string;
  period?: string;
  values?: Array<{ value?: unknown; end_time?: string }>;
  total_value?: { value?: unknown };
};

const MEDIA_FIELDS = [
  "id",
  "caption",
  "media_type",
  "media_product_type",
  "media_url",
  "permalink",
  "thumbnail_url",
  "timestamp",
  "username",
  "like_count",
  "comments_count",
].join(",");

const COMMON_METRICS = ["views", "reach", "likes", "comments", "saved", "shares", "total_interactions"];
const REEL_METRICS = [
  ...COMMON_METRICS,
  "ig_reels_video_view_total_time",
  "ig_reels_avg_watch_time",
  "reels_skip_rate",
];

function cleanNumber(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function safeMetaMessage(status: number, body: MetaErrorBody): string {
  const code = body.error?.code;
  if (code === 190 || status === 401) return "La conexión de Instagram necesita renovarse.";
  if (code === 4 || code === 17 || code === 32 || status === 429) return "Instagram limitó temporalmente las consultas. Probá de nuevo más tarde.";
  if (status >= 500) return "Instagram no respondió correctamente. Probá de nuevo en unos minutos.";
  return "Instagram rechazó la consulta. Revisá la cuenta y los permisos concedidos.";
}

export class InstagramApiClient {
  constructor(
    private readonly config: InstagramConfig,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  ) {}

  authorizationUrl(state: string): string {
    const url = new URL("https://www.instagram.com/oauth/authorize");
    url.searchParams.set("client_id", this.config.appId);
    url.searchParams.set("redirect_uri", this.config.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "instagram_business_basic,instagram_business_manage_insights");
    url.searchParams.set("state", state);
    url.searchParams.set("enable_fb_login", "0");
    url.searchParams.set("force_authentication", "1");
    return url.toString();
  }

  async exchangeCode(code: string): Promise<TokenResponse> {
    const body = new URLSearchParams({
      client_id: this.config.appId,
      client_secret: this.config.appSecret,
      grant_type: "authorization_code",
      redirect_uri: this.config.redirectUri,
      code,
    });
    return this.request<TokenResponse>("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    }, false);
  }

  async exchangeLongLived(shortLivedToken: string): Promise<TokenResponse> {
    const url = new URL("https://graph.instagram.com/access_token");
    url.searchParams.set("grant_type", "ig_exchange_token");
    url.searchParams.set("client_secret", this.config.appSecret);
    url.searchParams.set("access_token", shortLivedToken);
    return this.request<TokenResponse>(url, {}, false);
  }

  async refreshLongLived(accessToken: string): Promise<TokenResponse> {
    const url = new URL("https://graph.instagram.com/refresh_access_token");
    url.searchParams.set("grant_type", "ig_refresh_token");
    url.searchParams.set("access_token", accessToken);
    return this.request<TokenResponse>(url, {}, false);
  }

  async getProfile(accessToken: string): Promise<InstagramProfile> {
    const richFields = "id,user_id,username,name,account_type,profile_picture_url,media_count,followers_count";
    try {
      return this.mapProfile(await this.graph<RawProfile>("me", { fields: richFields }, accessToken));
    } catch (error) {
      if (!(error instanceof InstagramApiError) || error.needsReauthorization) throw error;
      return this.mapProfile(await this.graph<RawProfile>("me", { fields: "id,user_id,username,account_type,media_count" }, accessToken));
    }
  }

  async listMedia(accountId: string, accessToken: string): Promise<InstagramMediaRecord[]> {
    const first = this.graphUrl(`${accountId}/media`, { fields: MEDIA_FIELDS, limit: "100" });
    const items: InstagramMediaRecord[] = [];
    let next: string | undefined = first.toString();
    for (let page = 0; next && page < 20; page += 1) {
      const url: URL = new URL(next);
      if (url.hostname !== "graph.instagram.com") throw new Error("Instagram devolvió una URL de paginación no válida.");
      const result: Page<RawMedia> = await this.request<Page<RawMedia>>(url, { headers: { authorization: `Bearer ${accessToken}` } });
      for (const raw of result.data ?? []) {
        if (!raw.id || !raw.media_type) continue;
        items.push({
          id: raw.id,
          mediaType: raw.media_type,
          mediaProductType: raw.media_product_type,
          caption: raw.caption,
          permalink: raw.permalink,
          mediaUrl: raw.media_url,
          thumbnailUrl: raw.thumbnail_url,
          timestamp: raw.timestamp,
          username: raw.username,
          likeCount: cleanNumber(raw.like_count),
          commentsCount: cleanNumber(raw.comments_count),
        });
      }
      next = result.paging?.next;
    }
    return items;
  }

  async getMediaInsights(media: InstagramMediaRecord, accessToken: string): Promise<InstagramInsightRecord[]> {
    const metrics = media.mediaProductType === "REELS" || media.mediaType === "VIDEO" ? REEL_METRICS : COMMON_METRICS;
    return this.getSupportedInsights(`${media.id}/insights`, metrics, {}, accessToken);
  }

  async getAccountInsights(accountId: string, accessToken: string): Promise<InstagramInsightRecord[]> {
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    const until = new Date().toISOString().slice(0, 10);
    return this.getSupportedInsights(`${accountId}/insights`, ["reach", "views", "total_interactions"], {
      period: "day",
      since,
      until,
    }, accessToken);
  }

  private async getSupportedInsights(
    path: string,
    metrics: string[],
    params: Record<string, string>,
    accessToken: string,
  ): Promise<InstagramInsightRecord[]> {
    try {
      const response = await this.graph<Page<RawInsight>>(path, { ...params, metric: metrics.join(",") }, accessToken);
      return (response.data ?? []).flatMap((item) => {
        if (!item.name) return [];
        if (item.values?.length) return item.values.map((entry) => ({
          name: item.name!,
          period: item.period || params.period || "lifetime",
          value: entry.value ?? null,
          endTime: entry.end_time,
        }));
        return [{
          name: item.name,
          period: item.period || params.period || "lifetime",
          value: item.total_value?.value ?? null,
        }];
      });
    } catch (error) {
      if (!(error instanceof InstagramApiError) || error.needsReauthorization || metrics.length === 1) {
        if (metrics.length === 1 && error instanceof InstagramApiError && !error.needsReauthorization) return [];
        throw error;
      }
      const middle = Math.ceil(metrics.length / 2);
      const [left, right] = await Promise.all([
        this.getSupportedInsights(path, metrics.slice(0, middle), params, accessToken),
        this.getSupportedInsights(path, metrics.slice(middle), params, accessToken),
      ]);
      return [...left, ...right];
    }
  }

  private mapProfile(raw: RawProfile): InstagramProfile {
    const id = raw.user_id || raw.id;
    if (!id || !raw.username) throw new Error("Instagram no devolvió una cuenta profesional válida.");
    return {
      id,
      userId: raw.user_id,
      username: raw.username,
      name: raw.name,
      accountType: raw.account_type,
      profilePictureUrl: raw.profile_picture_url,
      mediaCount: cleanNumber(raw.media_count),
      followersCount: cleanNumber(raw.followers_count),
    };
  }

  private graphUrl(path: string, params: Record<string, string>): URL {
    const url = new URL(`https://graph.instagram.com/${this.config.graphVersion}/${path.replace(/^\//, "")}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return url;
  }

  private graph<T>(path: string, params: Record<string, string>, accessToken: string): Promise<T> {
    return this.request<T>(this.graphUrl(path, params), { headers: { authorization: `Bearer ${accessToken}` } });
  }

  private async request<T>(input: string | URL, init: RequestInit = {}, retry = true): Promise<T> {
    const attempts = retry && (!init.method || init.method === "GET") ? 3 : 1;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12_000);
      try {
        const response = await this.fetchImpl(input, { ...init, signal: controller.signal });
        const body = await response.json().catch(() => ({})) as T & MetaErrorBody;
        if (response.ok) return body;
        const error = new InstagramApiError(
          safeMetaMessage(response.status, body),
          response.status,
          body.error?.code,
          body.error?.error_subcode,
        );
        if (attempt + 1 < attempts && (response.status === 429 || response.status >= 500)) {
          await this.wait(250 * 3 ** attempt);
          continue;
        }
        throw error;
      } catch (error) {
        if (error instanceof InstagramApiError) throw error;
        if (attempt + 1 < attempts) {
          await this.wait(250 * 3 ** attempt);
          continue;
        }
        throw new InstagramApiError("No pude comunicarme con Instagram. Probá de nuevo.", 503);
      } finally {
        clearTimeout(timeout);
      }
    }
    throw new InstagramApiError("No pude comunicarme con Instagram. Probá de nuevo.", 503);
  }
}
