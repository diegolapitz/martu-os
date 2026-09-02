import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { InstagramApiClient } from "./meta-client";
import type { InstagramConfig } from "./types";

const config: InstagramConfig = {
  appId: "app-id",
  appSecret: "app-secret",
  redirectUri: "https://martu-os.test/api/instagram/oauth/callback",
  graphVersion: "v26.0",
  tokenEncryptionKey: Buffer.alloc(32, 1).toString("base64"),
  oauthStateSecret: "state-secret",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("Instagram API client", () => {
  it("builds Business Login with only the read-only scopes", () => {
    const url = new URL(new InstagramApiClient(config).authorizationUrl("csrf-state"));
    expect(url.origin + url.pathname).toBe("https://www.instagram.com/oauth/authorize");
    expect(url.searchParams.get("scope")).toBe("instagram_business_basic,instagram_business_manage_insights");
    expect(url.searchParams.get("state")).toBe("csrf-state");
  });

  it("exchanges the callback code without exposing secrets in output", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(json({ access_token: "short-token", user_id: "42" }));
    const result = await new InstagramApiClient(config, fetchMock).exchangeCode("callback-code");
    expect(result).toEqual({ access_token: "short-token", user_id: "42" });
    const init = fetchMock.mock.calls[0]?.[1];
    expect(String(init?.body)).toContain("code=callback-code");
    expect(String(init?.body)).toContain("client_secret=app-secret");
  });

  it("paginates media and normalizes missing fields", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ data: [{ id: "m1", media_type: "VIDEO", media_product_type: "REELS" }], paging: { next: "https://graph.instagram.com/v26.0/page-2" } }))
      .mockResolvedValueOnce(json({ data: [{ id: "m2", media_type: "IMAGE", caption: "Post" }] }));
    const media = await new InstagramApiClient(config, fetchMock).listMedia("ig-1", "secret-token");
    expect(media.map((item) => item.id)).toEqual(["m1", "m2"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("authorization")).toBe("Bearer secret-token");
  });

  it("keeps supported insights when a metric is unavailable", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const metric = new URL(String(input)).searchParams.get("metric") || "";
      if (metric.includes(",") || metric === "shares") return json({ error: { code: 100 } }, 400);
      return json({ data: [{ name: metric, period: "lifetime", values: [{ value: metric === "views" ? 120 : 1 }] }] });
    });
    const insights = await new InstagramApiClient(config, fetchMock).getMediaInsights({ id: "m1", mediaType: "IMAGE" }, "token");
    expect(insights.find((item) => item.name === "views")?.value).toBe(120);
    expect(insights.some((item) => item.name === "shares")).toBe(false);
  });

  it("retries transient errors but does not retry an expired token", async () => {
    const wait = vi.fn(async () => undefined);
    const transient = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ error: { code: 4 } }, 500))
      .mockResolvedValueOnce(json({ id: "ig", username: "fixture", account_type: "BUSINESS" }));
    await expect(new InstagramApiClient(config, transient, wait).getProfile("token")).resolves.toMatchObject({ id: "ig" });
    expect(wait).toHaveBeenCalledOnce();

    const expired = vi.fn<typeof fetch>().mockResolvedValue(json({ error: { code: 190 } }, 401));
    await expect(new InstagramApiClient(config, expired, wait).getProfile("expired")).rejects.toMatchObject({
      code: 190,
      needsReauthorization: true,
    });
    expect(expired).toHaveBeenCalledOnce();
  });
});
