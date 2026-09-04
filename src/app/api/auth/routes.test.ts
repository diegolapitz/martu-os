import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/supabase", () => ({
  createSupabaseServerClient: vi.fn(async () => ({ auth })),
}));

import { POST as login } from "./login/route";
import { POST as register } from "./register/route";
import { POST as reset } from "./reset/route";

describe("Supabase Auth routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.signInWithPassword.mockResolvedValue({ error: null });
    auth.signUp.mockResolvedValue({ data: { session: null }, error: null });
    auth.resetPasswordForEmail.mockResolvedValue({ error: null });
  });

  it("starts a password session with the validated credentials", async () => {
    const response = await login(jsonRequest("/api/auth/login", {
      email: "alpha@example.com",
      password: "segura-123",
    }));
    expect(response.status).toBe(200);
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: "alpha@example.com",
      password: "segura-123",
    });
  });

  it("creates an account with profile metadata and an onboarding callback", async () => {
    const response = await register(jsonRequest("/api/auth/register", {
      name: "Ana",
      email: "ana@example.com",
      password: "segura-123",
    }));
    expect(response.status).toBe(200);
    expect(auth.signUp).toHaveBeenCalledWith(expect.objectContaining({
      email: "ana@example.com",
      options: expect.objectContaining({
        data: { name: "Ana", preferred_name: "Ana" },
        emailRedirectTo: "http://localhost/auth/callback?next=/onboarding",
      }),
    }));
    await expect(response.json()).resolves.toMatchObject({ confirmationRequired: true });
  });

  it("uses a generic password recovery response", async () => {
    const response = await reset(jsonRequest("/api/auth/reset", {
      email: "ana@example.com",
    }));
    expect(response.status).toBe(200);
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith(
      "ana@example.com",
      { redirectTo: "http://localhost/auth/callback?next=/auth/update-password" },
    );
  });
});

function jsonRequest(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
