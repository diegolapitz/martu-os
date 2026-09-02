import "server-only";

import type { InstagramConfig } from "./types";

const DEFAULT_GRAPH_VERSION = "v26.0";

function value(name: string): string {
  const result = process.env[name]?.trim();
  if (!result) throw new Error(`Falta configurar ${name} para conectar Instagram.`);
  return result;
}

export function isInstagramConfigured(): boolean {
  return [
    "INSTAGRAM_APP_ID",
    "INSTAGRAM_APP_SECRET",
    "INSTAGRAM_TOKEN_ENCRYPTION_KEY",
    "INSTAGRAM_OAUTH_STATE_SECRET",
  ].every((name) => Boolean(process.env[name]?.trim()));
}

export function getInstagramRedirectUri(): string {
  const explicit = process.env.INSTAGRAM_REDIRECT_URI?.trim();
  if (explicit) return explicit;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";
  return new URL("/api/instagram/oauth/callback", appUrl).toString();
}

export function getInstagramConfig(): InstagramConfig {
  const graphVersion = process.env.INSTAGRAM_GRAPH_VERSION?.trim() || DEFAULT_GRAPH_VERSION;
  if (!/^v\d+\.\d+$/.test(graphVersion)) {
    throw new Error("INSTAGRAM_GRAPH_VERSION debe tener formato v26.0.");
  }
  return {
    appId: value("INSTAGRAM_APP_ID"),
    appSecret: value("INSTAGRAM_APP_SECRET"),
    redirectUri: getInstagramRedirectUri(),
    graphVersion,
    tokenEncryptionKey: value("INSTAGRAM_TOKEN_ENCRYPTION_KEY"),
    oauthStateSecret: value("INSTAGRAM_OAUTH_STATE_SECRET"),
  };
}

