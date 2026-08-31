import { describe, expect, it } from "vitest";

import { authorizeCron } from "./cron-auth";

describe("authorizeCron", () => {
  it("requires the secret even in development", () => {
    const request = new Request("http://localhost/api/scheduler/tick");
    expect(authorizeCron(request, undefined)).toMatchObject({ ok: false, status: 503 });
  });

  it("accepts only the matching bearer token", () => {
    const request = new Request("http://localhost/api/scheduler/tick", { headers: { authorization: "Bearer secret-123" } });
    expect(authorizeCron(request, "secret-123")).toEqual({ ok: true });
    expect(authorizeCron(request, "another-secret")).toMatchObject({ ok: false, status: 401 });
  });
});
