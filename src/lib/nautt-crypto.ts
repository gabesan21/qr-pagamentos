import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const SEPARATOR = ":";

export class NauttCryptoError extends Error {}

export function encrypt(plaintext: string, key: Buffer): string {
  if (key.length !== KEY_LENGTH) {
    throw new NauttCryptoError("Encryption key must be 32 bytes");
  }
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, ciphertext, authTag].map((buffer) => buffer.toString("base64url")).join(SEPARATOR);
}

export function decrypt(composite: string, key: Buffer): string {
  if (key.length !== KEY_LENGTH) {
    throw new NauttCryptoError("Encryption key must be 32 bytes");
  }
  const parts = composite.split(SEPARATOR);
  if (parts.length !== 3) {
    throw new NauttCryptoError("Invalid ciphertext format");
  }
  const iv = Buffer.from(parts[0], "base64url");
  const ciphertext = Buffer.from(parts[1], "base64url");
  const authTag = Buffer.from(parts[2], "base64url");
  if (iv.length !== IV_LENGTH) {
    throw new NauttCryptoError("Invalid initialization vector");
  }
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new NauttCryptoError("Decryption failed");
  }
}

export function loadEncryptionKey(): Buffer {
  const raw = process.env.NAUTT_ENCRYPTION_KEY;
  if (!raw) {
    throw new NauttCryptoError("NAUTT_ENCRYPTION_KEY is not set");
  }
  const key = Buffer.from(raw, "base64url");
  if (key.length !== KEY_LENGTH) {
    throw new NauttCryptoError("NAUTT_ENCRYPTION_KEY must decode to 32 bytes");
  }
  return key;
}
