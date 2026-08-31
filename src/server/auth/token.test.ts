import { afterEach, describe, expect, it } from "vitest";

import { createSessionToken, verifyAccessCode, verifySessionToken } from "./token";

const originalSecret = process.env.MARTU_SESSION_SECRET;
const originalCode = process.env.MARTU_ACCESS_CODE;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.MARTU_SESSION_SECRET;
  else process.env.MARTU_SESSION_SECRET = originalSecret;
  if (originalCode === undefined) delete process.env.MARTU_ACCESS_CODE;
  else process.env.MARTU_ACCESS_CODE = originalCode;
});

describe("Martu signed session", () => {
  it("accepts a valid token and rejects tampering or expiration", () => {
    process.env.MARTU_SESSION_SECRET = "test-secret-that-is-long-enough";
    const issued = new Date("2026-08-30T10:00:00.000Z");
    const token = createSessionToken(issued);
    expect(verifySessionToken(token, new Date("2026-08-30T10:01:00.000Z"))?.userSlug).toBe("martu");
    expect(verifySessionToken(`${token}x`, new Date("2026-08-30T10:01:00.000Z"))).toBeNull();
    expect(verifySessionToken(token, new Date("2026-10-01T10:00:00.000Z"))).toBeNull();
  });

  it("compares an optional access code without exposing it", () => {
    process.env.MARTU_ACCESS_CODE = "capo-123";
    expect(verifyAccessCode("capo-123")).toBe(true);
    expect(verifyAccessCode("otro")).toBe(false);
    expect(verifyAccessCode(undefined)).toBe(false);
  });
});
