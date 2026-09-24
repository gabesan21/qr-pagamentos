import { describe, expect, it } from "vitest";

import { decrypt, encrypt, loadEncryptionKey, loadPreviousEncryptionKey, NauttCryptoError } from "./nautt-crypto";

const key = Buffer.alloc(32, 0xab);
const otherKey = Buffer.alloc(32, 0xcd);

const validBase64urlKey = Buffer.alloc(32, 0xab).toString("base64url");

function makeComposite(iv: string, ciphertext: string, tag: string) {
  return [iv, ciphertext, tag].join(":");
}

describe("nautt-crypto", () => {
  it("round-trips plaintext through AES-256-GCM", () => {
    const plaintext = "nautt-api-key-123";
    const ciphertext = encrypt(plaintext, key);
    expect(decrypt(ciphertext, key)).toBe(plaintext);
  });

  it("never reuses the IV", () => {
    const plaintext = "same-plaintext";
    const first = encrypt(plaintext, key);
    const second = encrypt(plaintext, key);
    expect(first).not.toBe(second);
    expect(decrypt(first, key)).toBe(plaintext);
    expect(decrypt(second, key)).toBe(plaintext);
  });

  it("fails closed with the wrong key", () => {
    const ciphertext = encrypt("secret", key);
    expect(() => decrypt(ciphertext, otherKey)).toThrow(NauttCryptoError);
  });

  it("fails closed on a tampered ciphertext", () => {
    const ciphertext = encrypt("secret", key);
    const parts = ciphertext.split(":");
    const buffer = Buffer.from(parts[1], "base64url");
    for (let index = 0; index < buffer.length; index += 1) {
      buffer[index] ^= 0xff;
    }
    parts[1] = buffer.toString("base64url");
    expect(() => decrypt(parts.join(":"), key)).toThrow(NauttCryptoError);
  });

  it("fails closed on a tampered authentication tag", () => {
    const ciphertext = encrypt("secret", key);
    const parts = ciphertext.split(":");
    const buffer = Buffer.from(parts[2], "base64url");
    for (let index = 0; index < buffer.length; index += 1) {
      buffer[index] ^= 0xff;
    }
    parts[2] = buffer.toString("base64url");
    expect(() => decrypt(parts.join(":"), key)).toThrow(NauttCryptoError);
  });

  it("rejects malformed composite ciphertexts", () => {
    expect(() => decrypt("not-enough-parts", key)).toThrow(NauttCryptoError);
    expect(() => decrypt(makeComposite("a", "b", "c"), key)).toThrow(NauttCryptoError);
  });

  it("rejects keys that are not exactly 32 bytes", () => {
    const short = Buffer.alloc(31, 0xab);
    const long = Buffer.alloc(33, 0xab);
    expect(() => encrypt("x", short)).toThrow(NauttCryptoError);
    expect(() => decrypt("a:b:c", short)).toThrow(NauttCryptoError);
    expect(() => encrypt("x", long)).toThrow(NauttCryptoError);
    expect(() => decrypt("a:b:c", long)).toThrow(NauttCryptoError);
  });

  it("loads the encryption key from the environment", () => {
    const previous = process.env.NAUTT_ENCRYPTION_KEY;
    process.env.NAUTT_ENCRYPTION_KEY = validBase64urlKey;
    try {
      expect(loadEncryptionKey()).toEqual(key);
    } finally {
      process.env.NAUTT_ENCRYPTION_KEY = previous;
    }
  });

  it("throws when the environment key is missing or has the wrong length", () => {
    const previous = process.env.NAUTT_ENCRYPTION_KEY;
    delete process.env.NAUTT_ENCRYPTION_KEY;
    expect(() => loadEncryptionKey()).toThrow(NauttCryptoError);
    process.env.NAUTT_ENCRYPTION_KEY = "aG9zdA";
    expect(() => loadEncryptionKey()).toThrow(NauttCryptoError);
    process.env.NAUTT_ENCRYPTION_KEY = previous;
  });

  it("decrypts ciphertext of the current key without a previous key configured", () => {
    const ciphertext = encrypt("secret", key);
    expect(decrypt(ciphertext, key)).toBe("secret");
  });

  it("decrypts ciphertext of the previous key during the rotation window", () => {
    const ciphertext = encrypt("secret", otherKey);
    expect(decrypt(ciphertext, key, otherKey)).toBe("secret");
  });

  it("prefers the current key over the previous key when both would decrypt", () => {
    const ciphertext = encrypt("secret", key);
    expect(decrypt(ciphertext, key, otherKey)).toBe("secret");
  });

  it("fails closed when neither the current nor the previous key matches", () => {
    const thirdKey = Buffer.alloc(32, 0xef);
    const ciphertext = encrypt("secret", thirdKey);
    expect(() => decrypt(ciphertext, key, otherKey)).toThrow(NauttCryptoError);
  });

  it("reproduces today's behavior byte for byte when no previous key is configured", () => {
    const ciphertext = encrypt("secret", otherKey);
    expect(() => decrypt(ciphertext, key)).toThrow(NauttCryptoError);
    expect(() => decrypt(ciphertext, key, undefined)).toThrow(NauttCryptoError);
  });

  it("returns undefined for the previous key when the environment variable is unset", () => {
    const previous = process.env.NAUTT_ENCRYPTION_KEY_PREVIOUS;
    delete process.env.NAUTT_ENCRYPTION_KEY_PREVIOUS;
    expect(loadPreviousEncryptionKey()).toBeUndefined();
    process.env.NAUTT_ENCRYPTION_KEY_PREVIOUS = previous;
  });

  it("loads the previous encryption key from the environment when configured", () => {
    const previous = process.env.NAUTT_ENCRYPTION_KEY_PREVIOUS;
    process.env.NAUTT_ENCRYPTION_KEY_PREVIOUS = validBase64urlKey;
    try {
      expect(loadPreviousEncryptionKey()).toEqual(key);
    } finally {
      process.env.NAUTT_ENCRYPTION_KEY_PREVIOUS = previous;
    }
  });

  it("fails loudly when the previous key is configured but malformed", () => {
    const previous = process.env.NAUTT_ENCRYPTION_KEY_PREVIOUS;
    process.env.NAUTT_ENCRYPTION_KEY_PREVIOUS = "aG9zdA";
    expect(() => loadPreviousEncryptionKey()).toThrow(NauttCryptoError);
    process.env.NAUTT_ENCRYPTION_KEY_PREVIOUS = previous;
  });
});
