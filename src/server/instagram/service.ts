import "server-only";

import { decryptInstagramToken, encryptInstagramToken } from "./crypto";
import { InstagramApiClient, InstagramApiError } from "./meta-client";
import {
  acquireInstagramSync,
  getInstagramConnectionSecret,
  markInstagramSyncFailed,
  saveInstagramSync,
  upsertInstagramConnection,
} from "./repository";
import { INSTAGRAM_SCOPES, type InstagramConfig, type InstagramConnectionSecret } from "./types";

type Repository = {
  upsertConnection: typeof upsertInstagramConnection;
  getConnection: typeof getInstagramConnectionSecret;
  acquireSync: typeof acquireInstagramSync;
  saveSync: typeof saveInstagramSync;
  markFailed: typeof markInstagramSyncFailed;
};

const defaultRepository: Repository = {
  upsertConnection: upsertInstagramConnection,
  getConnection: getInstagramConnectionSecret,
  acquireSync: acquireInstagramSync,
  saveSync: saveInstagramSync,
  markFailed: markInstagramSyncFailed,
};

function professional(accountType?: string): boolean {
  const normalized = accountType?.toUpperCase().replace(/[^A-Z]/g, "_");
  return normalized === "BUSINESS" || normalized === "CREATOR" || normalized === "MEDIA_CREATOR";
}

function expiresAt(seconds?: number): string | undefined {
  return seconds && seconds > 0 ? new Date(Date.now() + seconds * 1000).toISOString() : undefined;
}

function shouldRefresh(connection: InstagramConnectionSecret): boolean {
  if (!connection.expiresAt) return false;
  const remaining = new Date(connection.expiresAt).getTime() - Date.now();
  const age = Date.now() - new Date(connection.connectedAt).getTime();
  return remaining < 7 * 86_400_000 && remaining > 0 && age > 86_400_000;
}

export class InstagramSyncService {
  constructor(
    private readonly config: InstagramConfig,
    private readonly api = new InstagramApiClient(config),
    private readonly repository: Repository = defaultRepository,
  ) {}

  async connectFromAuthorizationCode(clientSlug: string, code: string) {
    console.info("[instagram] OAuth callback received");
    const shortLived = await this.api.exchangeCode(code);
    console.info("[instagram] token exchange success");
    const longLived = await this.api.exchangeLongLived(shortLived.access_token);
    console.info("[instagram] long-lived token exchange success");
    const profile = await this.api.getProfile(longLived.access_token);
    if (!professional(profile.accountType)) {
      throw new Error("Esta cuenta no es compatible. Instagram Insights requiere una cuenta profesional Creator o Business.");
    }
    const connection = await this.repository.upsertConnection({
      clientSlug,
      profile,
      encryptedAccessToken: encryptInstagramToken(longLived.access_token, this.config.tokenEncryptionKey),
      expiresAt: expiresAt(longLived.expires_in),
      scopes: INSTAGRAM_SCOPES,
    });
    await this.syncConnection(connection);
    console.info("[instagram] OAuth callback success");
    return connection;
  }

  async syncClient(clientSlug: string) {
    const connection = await this.repository.getConnection(clientSlug);
    if (!connection || connection.status === "disconnected" || !connection.encryptedAccessToken) {
      throw new Error("Instagram no está conectado para este cliente.");
    }
    return this.syncConnection(connection);
  }

  private async syncConnection(connection: InstagramConnectionSecret) {
    await this.repository.acquireSync(connection.id);
    const startedAt = Date.now();
    console.info("[instagram] sync started");
    try {
      let accessToken = decryptInstagramToken(connection.encryptedAccessToken, this.config.tokenEncryptionKey);
      let refreshedEnvelope: string | undefined;
      let refreshedExpiry: string | undefined;
      if (shouldRefresh(connection)) {
        const refreshed = await this.api.refreshLongLived(accessToken);
        accessToken = refreshed.access_token;
        refreshedEnvelope = encryptInstagramToken(accessToken, this.config.tokenEncryptionKey);
        refreshedExpiry = expiresAt(refreshed.expires_in);
      }
      const [profile, media, accountInsights] = await Promise.all([
        this.api.getProfile(accessToken),
        this.api.listMedia(connection.instagramAccountId, accessToken),
        this.api.getAccountInsights(connection.instagramAccountId, accessToken).catch((error) => {
          if (error instanceof InstagramApiError && !error.needsReauthorization) return [];
          throw error;
        }),
      ]);
      const enriched: Array<{ item: (typeof media)[number]; insights: Awaited<ReturnType<InstagramApiClient["getMediaInsights"]>> }> = [];
      for (let offset = 0; offset < media.length; offset += 4) {
        const batch = media.slice(offset, offset + 4);
        const insights = await Promise.all(batch.map((item) => this.api.getMediaInsights(item, accessToken)));
        batch.forEach((item, index) => enriched.push({ item, insights: insights[index] ?? [] }));
      }
      const result = await this.repository.saveSync({
        connection,
        profile,
        media: enriched,
        accountInsights,
        encryptedAccessToken: refreshedEnvelope,
        expiresAt: refreshedExpiry,
      });
      console.info("[instagram] sync success", {
        mediaCount: result.mediaCount,
        insightsCount: result.insightsCount,
        durationMs: Date.now() - startedAt,
      });
      return result;
    } catch (error) {
      const apiError = error instanceof InstagramApiError ? error : null;
      const message = apiError?.message || "No pude actualizar Instagram. Probá de nuevo.";
      await this.repository.markFailed(connection.id, message, Boolean(apiError?.needsReauthorization));
      console.error("[instagram] sync failure", {
        category: apiError?.needsReauthorization ? "reauthorization" : "sync_error",
        status: apiError?.status,
        code: apiError?.code,
        durationMs: Date.now() - startedAt,
      });
      throw new Error(message);
    }
  }
}

