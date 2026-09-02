import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function decodeKey(encoded: string): Buffer {
  const trimmed = encoded.trim();
  const key = /^[0-9a-f]{64}$/i.test(trimmed)
    ? Buffer.from(trimmed, "hex")
    : Buffer.from(trimmed, "base64");
  if (key.length !== 32) {
    throw new Error("INSTAGRAM_TOKEN_ENCRYPTION_KEY debe contener exactamente 32 bytes en base64 o hex.");
  }
  return key;
}

export function encryptInstagramToken(token: string, encodedKey: string): string {
  if (!token) throw new Error("Instagram no devolvió un access token.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", decodeKey(encodedKey), iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptInstagramToken(envelope: string, encodedKey: string): string {
  const [version, ivValue, tagValue, ciphertextValue] = envelope.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !ciphertextValue) {
    throw new Error("El token de Instagram guardado no tiene un formato válido.");
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", decodeKey(encodedKey), Buffer.from(ivValue, "base64url"));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextValue, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("No pude descifrar la conexión de Instagram. Revisá la clave de cifrado.");
  }
}

