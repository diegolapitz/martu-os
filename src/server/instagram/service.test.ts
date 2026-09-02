import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { InstagramApiClient, InstagramApiError } from "./meta-client";
import { InstagramSyncService } from "./service";
import { mediaFixtures, professionalProfileFixture } from "./fixtures";
import type { InstagramConfig, InstagramConnectionSecret } from "./types";

const config: InstagramConfig = {
  appId: "app-id",
  appSecret: "app-secret",
  redirectUri: "https://martu-os.test/api/instagram/oauth/callback",
  graphVersion: "v26.0",
  tokenEncryptionKey: Buffer.alloc(32, 3).toString("base64"),
  oauthStateSecret: "state-secret",
};

function setup(overrides: Partial<Record<keyof InstagramApiClient, unknown>> = {}) {
  const api = {
    exchangeCode: vi.fn(async () => ({ access_token: "short", user_id: professionalProfileFixture.id })),
    exchangeLongLived: vi.fn(async () => ({ access_token: "long-lived-secret", expires_in: 5_184_000 })),
    refreshLongLived: vi.fn(async () => ({ access_token: "refreshed", expires_in: 5_184_000 })),
    getProfile: vi.fn(async () => professionalProfileFixture),
    listMedia: vi.fn(async () => mediaFixtures),
    getAccountInsights: vi.fn(async () => [{ name: "reach", period: "day", value: 200 }]),
    getMediaInsights: vi.fn(async () => [{ name: "views", period: "lifetime", value: 100 }]),
    ...overrides,
  };
  let connection: InstagramConnectionSecret | null = null;
  const savedExternalIds = new Set<string>();
  const repository = {
    upsertConnection: vi.fn(async (input: { clientSlug: string; profile: typeof professionalProfileFixture; encryptedAccessToken: string; expiresAt?: string }) => {
      connection = {
        id: "1",
        clientId: "10",
        clientSlug: input.clientSlug,
        instagramAccountId: input.profile.id,
        username: input.profile.username,
        accountType: input.profile.accountType,
        encryptedAccessToken: input.encryptedAccessToken,
        expiresAt: input.expiresAt,
        connectedAt: new Date().toISOString(),
        status: "connected",
      };
      return connection;
    }),
    getConnection: vi.fn(async () => connection),
    acquireSync: vi.fn(async () => undefined),
    saveSync: vi.fn(async (input: { media: Array<{ item: { id: string }; insights: unknown[] }> }) => {
      input.media.forEach(({ item }) => savedExternalIds.add(item.id));
      return { mediaCount: savedExternalIds.size, insightsCount: input.media.reduce((sum, item) => sum + item.insights.length, 0) };
    }),
    markFailed: vi.fn(async () => undefined),
  };
  const service = new InstagramSyncService(
    config,
    api as unknown as InstagramApiClient,
    repository as never,
  );
  return { service, api, repository, savedExternalIds, getConnection: () => connection };
}

describe("Instagram OAuth callback and sync service", () => {
  it("exchanges the code, encrypts the token and runs the first sync", async () => {
    const context = setup();
    await context.service.connectFromAuthorizationCode("gavilan", "callback-code");
    expect(context.api.exchangeCode).toHaveBeenCalledWith("callback-code");
    expect(context.repository.upsertConnection).toHaveBeenCalledOnce();
    expect(context.getConnection()?.encryptedAccessToken).not.toContain("long-lived-secret");
    expect(context.savedExternalIds).toEqual(new Set(mediaFixtures.map((item) => item.id)));
  });

  it("rejects a non-professional account without saving a connection", async () => {
    const context = setup({ getProfile: vi.fn(async () => ({ ...professionalProfileFixture, accountType: "PERSONAL" })) });
    await expect(context.service.connectFromAuthorizationCode("gavilan", "code")).rejects.toThrow("Creator o Business");
    expect(context.repository.upsertConnection).not.toHaveBeenCalled();
  });

  it("keeps repeated synchronization idempotent by external media id", async () => {
    const context = setup();
    await context.service.connectFromAuthorizationCode("gavilan", "code");
    await context.service.syncClient("gavilan");
    expect(context.savedExternalIds.size).toBe(mediaFixtures.length);
    expect(context.repository.saveSync).toHaveBeenCalledTimes(2);
  });

  it("marks expired tokens as needing reauthorization", async () => {
    const context = setup({
      listMedia: vi.fn(async () => { throw new InstagramApiError("La conexión de Instagram necesita renovarse.", 401, 190); }),
    });
    await expect(context.service.connectFromAuthorizationCode("gavilan", "code")).rejects.toThrow("renovarse");
    expect(context.repository.markFailed).toHaveBeenCalledWith("1", expect.any(String), true);
  });
});
