export const INSTAGRAM_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_insights",
] as const;

export type InstagramConfig = {
  appId: string;
  appSecret: string;
  redirectUri: string;
  graphVersion: string;
  tokenEncryptionKey: string;
  oauthStateSecret: string;
};

export type InstagramProfile = {
  id: string;
  userId?: string;
  username: string;
  name?: string;
  accountType?: string;
  profilePictureUrl?: string;
  mediaCount?: number;
  followersCount?: number;
};

export type InstagramMediaRecord = {
  id: string;
  mediaType: string;
  mediaProductType?: string;
  caption?: string;
  permalink?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  timestamp?: string;
  username?: string;
  likeCount?: number;
  commentsCount?: number;
};

export type InstagramInsightRecord = {
  name: string;
  period: string;
  value: unknown;
  endTime?: string;
};

export type InstagramConnectionSecret = {
  id: string;
  clientId: string;
  clientSlug: string;
  instagramAccountId: string;
  username: string;
  accountType?: string;
  encryptedAccessToken: string;
  expiresAt?: string;
  connectedAt: string;
  status: string;
};

export type InstagramMediaDto = {
  id: string;
  instagramMediaId: string;
  mediaType: string;
  mediaProductType?: string | null;
  caption?: string | null;
  permalink?: string | null;
  mediaUrl?: string | null;
  thumbnailUrl?: string | null;
  publishedAt?: string | null;
  contentItemId?: string | null;
  contentTitle?: string | null;
  insights: Record<string, unknown>;
};

export type InstagramConnectionDto = {
  configured: boolean;
  connected: boolean;
  id?: string;
  username?: string;
  accountType?: string | null;
  profilePictureUrl?: string | null;
  status?: string;
  connectedAt?: string;
  lastSyncAt?: string | null;
  lastError?: string | null;
  expiresAt?: string | null;
  media: InstagramMediaDto[];
};

