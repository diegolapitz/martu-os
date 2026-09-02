import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { closeDatabase } from "@/server/db/client";
import { query } from "@/server/db";

import { mediaFixtures, professionalProfileFixture } from "./fixtures";
import {
  getInstagramConnectionDto,
  linkInstagramMedia,
  saveInstagramSync,
  upsertInstagramConnection,
} from "./repository";

const testDataDir = `.data/vitest-instagram-${process.pid}-${Date.now()}`;

beforeAll(async () => {
  process.env.DB_MODE = "pglite";
  process.env.PGLITE_DATA_DIR = testDataDir;
  process.env.INSTAGRAM_APP_ID = "test-app";
  process.env.INSTAGRAM_APP_SECRET = "test-secret";
  process.env.INSTAGRAM_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 4).toString("base64");
  process.env.INSTAGRAM_OAUTH_STATE_SECRET = "test-state";
  await query("select 1");
}, 30_000);

afterAll(async () => {
  await closeDatabase();
});

describe("Instagram persistence", () => {
  it("upserts media and flexible insights without duplicates", async () => {
    const connection = await upsertInstagramConnection({
      clientSlug: "gavilan",
      profile: professionalProfileFixture,
      encryptedAccessToken: "v1.fixture.encrypted.token",
      expiresAt: "2026-10-01T00:00:00.000Z",
      scopes: ["instagram_business_basic", "instagram_business_manage_insights"],
    });
    const sync = {
      connection,
      profile: professionalProfileFixture,
      media: mediaFixtures.map((item) => ({ item, insights: [{ name: "views", period: "lifetime", value: item.id.endsWith("1") ? 100 : 50 }] })),
      accountInsights: [{ name: "reach", period: "day", value: 120, endTime: "2026-09-01T00:00:00.000Z" }],
    };
    await saveInstagramSync(sync);
    await saveInstagramSync(sync);
    const counts = await query<{ media_count: string; insight_count: string }>(
      `select (select count(*) from public.instagram_media where connection_id = $1)::text as media_count,
        (select count(*) from public.instagram_media_insights imi join public.instagram_media im on im.id = imi.media_id where im.connection_id = $1)::text as insight_count`,
      [connection.id],
    );
    expect(counts[0]).toMatchObject({ media_count: "2", insight_count: "4" });
    const dto = await getInstagramConnectionDto("gavilan");
    expect(dto.connected).toBe(true);
    expect(dto.media).toHaveLength(2);
    expect(dto.media[0]?.insights.views).toBeDefined();
  }, 20_000);

  it("links only content belonging to the same client", async () => {
    const dto = await getInstagramConnectionDto("gavilan");
    const content = await query<{ id: string }>("select id::text as id from public.content_items where client_id = (select id from public.clients where slug = 'gavilan') limit 1");
    await expect(linkInstagramMedia({ clientSlug: "gavilan", mediaId: dto.media[0]!.id, contentItemId: content[0]!.id })).resolves.toBeUndefined();
    await expect(linkInstagramMedia({ clientSlug: "gavilan", mediaId: dto.media[0]!.id, contentItemId: "999999999" })).rejects.toThrow("no pertenece");
  });
});
