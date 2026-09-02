import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  CLIENT_LOGO_MAX_BYTES,
  ClientLogoInputError,
  validateClientLogo,
} from "./client-logo";

describe("validateClientLogo", () => {
  it("accepts supported image signatures", () => {
    expect(validateClientLogo(new Uint8Array([0xff, 0xd8, 0xff, 0x00]), "image/jpeg"))
      .toBe("image/jpeg");
    expect(validateClientLogo(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png"))
      .toBe("image/png");
    expect(validateClientLogo(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]), "image/webp"))
      .toBe("image/webp");
  });

  it("rejects a spoofed or unsupported file", () => {
    expect(() => validateClientLogo(new Uint8Array([1, 2, 3]), "image/png"))
      .toThrow(ClientLogoInputError);
    expect(() => validateClientLogo(new Uint8Array([1, 2, 3]), "image/gif"))
      .toThrow("JPG, PNG o WebP");
  });

  it("enforces the server-side size limit", () => {
    const oversized = new Uint8Array(CLIENT_LOGO_MAX_BYTES + 1);
    oversized.set([0xff, 0xd8, 0xff]);
    expect(() => validateClientLogo(oversized, "image/jpeg"))
      .toThrow("demasiado pesada");
  });
});
