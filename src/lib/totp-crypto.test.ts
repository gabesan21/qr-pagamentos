import { describe, expect, it } from "vitest";

import { decrypt, encrypt, loadEncryptionKey, TotpCryptoError } from "./totp-crypto";

const key = Buffer.alloc(32, 0xab);
const otherKey = Buffer.alloc(32, 0xcd);

const validBase64urlKey = Buffer.alloc(32, 0xab).toString("base64url");

function makeComposite(iv: string, ciphertext: string, tag: string) {
  return [iv, ciphertext, tag].join(":");
}

describe("totp-crypto", () => {
  it("round-trips plaintext through AES-256-GCM", () => {
    const plaintext = "totp-secret-123";
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
    expect(() => decrypt(ciphertext, otherKey)).toThrow(TotpCryptoError);
  });

  it("fails closed on a tampered ciphertext", () => {
    const ciphertext = encrypt("secret", key);
    const parts = ciphertext.split(":");
    const buffer = Buffer.from(parts[1], "base64url");
    for (let index = 0; index < buffer.length; index += 1) {
      buffer[index] ^= 0xff;
    }
    parts[1] = buffer.toString("base64url");
    expect(() => decrypt(parts.join(":"), key)).toThrow(TotpCryptoError);
  });

  it("fails closed on a tampered authentication tag", () => {
    const ciphertext = encrypt("secret", key);
    const parts = ciphertext.split(":");
    const buffer = Buffer.from(parts[2], "base64url");
    for (let index = 0; index < buffer.length; index += 1) {
      buffer[index] ^= 0xff;
    }
    parts[2] = buffer.toString("base64url");
    expect(() => decrypt(parts.join(":"), key)).toThrow(TotpCryptoError);
  });

  it("rejects malformed composite ciphertexts", () => {
    expect(() => decrypt("not-enough-parts", key)).toThrow(TotpCryptoError);
    expect(() => decrypt(makeComposite("a", "b", "c"), key)).toThrow(TotpCryptoError);
  });

  it("rejects keys that are not exactly 32 bytes", () => {
    const short = Buffer.alloc(31, 0xab);
    const long = Buffer.alloc(33, 0xab);
    expect(() => encrypt("x", short)).toThrow(TotpCryptoError);
    expect(() => decrypt("a:b:c", short)).toThrow(TotpCryptoError);
    expect(() => encrypt("x", long)).toThrow(TotpCryptoError);
    expect(() => decrypt("a:b:c", long)).toThrow(TotpCryptoError);
  });

  it("loads the encryption key from the environment", () => {
    const previous = process.env.TOTP_ENCRYPTION_KEY;
    process.env.TOTP_ENCRYPTION_KEY = validBase64urlKey;
    try {
      expect(loadEncryptionKey()).toEqual(key);
    } finally {
      process.env.TOTP_ENCRYPTION_KEY = previous;
    }
  });

  it("throws when the environment key is missing or has the wrong length", () => {
    const previous = process.env.TOTP_ENCRYPTION_KEY;
    delete process.env.TOTP_ENCRYPTION_KEY;
    expect(() => loadEncryptionKey()).toThrow(TotpCryptoError);
    process.env.TOTP_ENCRYPTION_KEY = "aG9zdA";
    expect(() => loadEncryptionKey()).toThrow(TotpCryptoError);
    process.env.TOTP_ENCRYPTION_KEY = previous;
  });
});
