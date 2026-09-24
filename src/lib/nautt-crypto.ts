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

type ParsedComposite = { iv: Buffer; ciphertext: Buffer; authTag: Buffer };

function parseComposite(composite: string): ParsedComposite {
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
  return { iv, ciphertext, authTag };
}

function decryptWithKey(parsed: ParsedComposite, key: Buffer): string {
  if (key.length !== KEY_LENGTH) {
    throw new NauttCryptoError("Encryption key must be 32 bytes");
  }
  const decipher = createDecipheriv(ALGORITHM, key, parsed.iv);
  decipher.setAuthTag(parsed.authTag);
  try {
    return Buffer.concat([decipher.update(parsed.ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new NauttCryptoError("Decryption failed");
  }
}

// Read path: try the current key, then the optional previous key (rotation
// window). Absent previousKey reproduces prior behavior exactly; a mismatch
// on every configured key surfaces the current key's exact failure.
export function decrypt(composite: string, key: Buffer, previousKey?: Buffer): string {
  const parsed = parseComposite(composite);
  try {
    return decryptWithKey(parsed, key);
  } catch (error) {
    if (!previousKey) throw error;
    return decryptWithKey(parsed, previousKey);
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

// Optional rotation-window key: absent by design (no previous key
// configured) reproduces today's behavior; present but malformed fails
// loudly at load, never silently ignored.
export function loadPreviousEncryptionKey(): Buffer | undefined {
  const raw = process.env.NAUTT_ENCRYPTION_KEY_PREVIOUS;
  if (!raw) {
    return undefined;
  }
  const key = Buffer.from(raw, "base64url");
  if (key.length !== KEY_LENGTH) {
    throw new NauttCryptoError("NAUTT_ENCRYPTION_KEY_PREVIOUS must decode to 32 bytes");
  }
  return key;
}
