import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createInstagramOAuthState, verifyInstagramOAuthState } from "./oauth-state";

describe("Instagram OAuth callback state", () => {
  it("binds the callback to the client that started the flow", () => {
    const now = Date.now();
    const created = createInstagramOAuthState("gavilan", "state-secret-for-tests");
    expect(verifyInstagramOAuthState(created.state, created.cookieValue, "state-secret-for-tests", now)).toMatchObject({
      nonce: created.state,
      clientSlug: "gavilan",
    });
  });

  it("rejects mismatched, tampered and expired callbacks", () => {
    const created = createInstagramOAuthState("gavilan", "state-secret-for-tests");
    expect(() => verifyInstagramOAuthState("other", created.cookieValue, "state-secret-for-tests")).toThrow("validar");
    expect(() => verifyInstagramOAuthState(created.state, `${created.cookieValue}x`, "state-secret-for-tests")).toThrow("validar");
    expect(() => verifyInstagramOAuthState(created.state, created.cookieValue, "state-secret-for-tests", Date.now() + 11 * 60_000)).toThrow("venció");
  });
});
