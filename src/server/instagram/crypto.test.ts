import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { decryptInstagramToken, encryptInstagramToken } from "./crypto";

const key = Buffer.alloc(32, 7).toString("base64");

describe("Instagram token encryption", () => {
  it("encrypts with a random authenticated envelope and decrypts server-side", () => {
    const first = encryptInstagramToken("IG-secret-token", key);
    const second = encryptInstagramToken("IG-secret-token", key);
    expect(first).not.toContain("IG-secret-token");
    expect(first).not.toBe(second);
    expect(decryptInstagramToken(first, key)).toBe("IG-secret-token");
  });

  it("rejects tampering and invalid keys", () => {
    const encrypted = encryptInstagramToken("IG-secret-token", key);
    const parts = encrypted.split(".");
    parts[3] = `${parts[3]!.slice(0, -1)}${parts[3]!.endsWith("A") ? "B" : "A"}`;
    expect(() => decryptInstagramToken(parts.join("."), key)).toThrow("descifrar");
    expect(() => encryptInstagramToken("token", "too-short")).toThrow("32 bytes");
  });
});
