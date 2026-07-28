import { createHmac, randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { createTotpService, type TotpCredential, type TotpRecoveryCode, type TotpStore } from "./totp";

const key = Buffer.alloc(32, 0xab);
const crypto = {
  encrypt: (plaintext: string) => {
    const iv = randomBytes(12).toString("base64url");
    const tag = randomBytes(16).toString("base64url");
    return `${iv}:${Buffer.from(plaintext).toString("base64url")}:${tag}`;
  },
  decrypt: (ciphertext: string) => Buffer.from(ciphertext.split(":")[1], "base64url").toString("utf8"),
};

function memoryStore(): TotpStore & { credentials: Map<string, TotpCredential>; recoveryCodes: Map<string, TotpRecoveryCode[]>; sessionsRevoked: Set<string> } {
  const credentials = new Map<string, TotpCredential>();
  const recoveryCodes = new Map<string, TotpRecoveryCode[]>();
  const sessionsRevoked = new Set<string>();
  return {
    credentials,
    recoveryCodes,
    sessionsRevoked,
    async getCredential(userId) { return credentials.get(userId) ?? null; },
    async getRecoveryCodes(credentialId) { return recoveryCodes.get(credentialId) ?? []; },
    async beginEnrollment(userId, encryptedSecret, now, codes) {
      credentials.set(userId, { userId, encryptedSecret, confirmedAt: null, replayCounter: 0, algorithm: "SHA1", digits: 6, stepSeconds: 30 });
      recoveryCodes.set(userId, codes.map((code) => ({ id: code.id, credentialId: userId, codeDigest: code.codeDigest, consumedAt: null })));
    },
    async confirm(userId, confirmedAt) {
      const credential = credentials.get(userId);
      if (!credential || credential.confirmedAt !== null) return false;
      credentials.set(userId, { ...credential, confirmedAt });
      return true;
    },
    async updateReplayCounter(userId, counter) {
      const credential = credentials.get(userId);
      if (credential) credentials.set(userId, { ...credential, replayCounter: counter });
    },
    async consumeRecoveryCode(id, consumedAt) {
      for (const [credentialId, list] of recoveryCodes.entries()) {
        const index = list.findIndex((candidate) => candidate.id === id);
        if (index >= 0) {
          list[index] = { ...list[index], consumedAt };
          recoveryCodes.set(credentialId, list);
        }
      }
    },
    async replaceRecoveryCodes(credentialId, codes) {
      recoveryCodes.set(
        credentialId,
        codes.map((code) => ({ id: code.id, credentialId, codeDigest: code.codeDigest, consumedAt: null })),
      );
    },
    async disable(userId) {
      credentials.delete(userId);
      recoveryCodes.delete(userId);
      sessionsRevoked.add(userId);
    },
  };
}

function hmacSha1(secret: Buffer, counter: number): Buffer {
  const buffer = Buffer.allocUnsafe(8);
  for (let index = 7; index >= 0; index -= 1) {
    buffer[index] = counter & 0xff;
    counter = counter >>> 8;
  }
  return createHmac("sha1", secret).update(buffer).digest();
}

function totp(secretBase32: string, timestampSeconds: number): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const map = new Map(alphabet.split("").map((character, index) => [character, index]));
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const character of secretBase32.toUpperCase()) {
    value = (value << 5) | (map.get(character) ?? 0);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const secret = Buffer.from(bytes);
  const counter = Math.floor(timestampSeconds / 30);
  const digest = hmacSha1(secret, counter);
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24) | ((digest[offset + 1] & 0xff) << 16) | ((digest[offset + 2] & 0xff) << 8) | (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

describe("totp service", () => {
  it("enrolls a new credential and returns provisioning data", async () => {
    const service = createTotpService(memoryStore(), crypto, () => new Date("2026-07-28T12:00:00Z"));
    const enrollment = await service.enroll("user-1", "owner");
    expect(enrollment.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(enrollment.provisioningUri).toContain("otpauth://totp/");
    expect(enrollment.provisioningUri).toContain(enrollment.secret);
    expect(enrollment.recoveryCodes).toHaveLength(10);
    expect(enrollment.recoveryCodes[0]).toMatch(/^[0-9a-f]{32}$/);
  });

  it("refuses a second enrollment", async () => {
    const service = createTotpService(memoryStore(), crypto, () => new Date("2026-07-28T12:00:00Z"));
    await service.enroll("user-1", "owner");
    await expect(service.enroll("user-1", "owner")).rejects.toThrow("TOTP enrollment already exists");
  });

  it("confirms with a valid code and activates TOTP", async () => {
    const store = memoryStore();
    const now = new Date("2026-07-28T12:00:00Z");
    const service = createTotpService(store, crypto, () => now);
    const enrollment = await service.enroll("user-1", "owner");
    const code = totp(enrollment.secret, now.getTime() / 1000);
    await service.confirm("user-1", code);
    expect(store.credentials.get("user-1")?.confirmedAt).toEqual(now);
    expect(await service.isEnrolled("user-1")).toBe(true);
  });

  it("rejects confirmation with an invalid code", async () => {
    const service = createTotpService(memoryStore(), crypto, () => new Date("2026-07-28T12:00:00Z"));
    await service.enroll("user-1", "owner");
    await expect(service.confirm("user-1", "000000")).rejects.toThrow("TOTP code is invalid");
  });

  it("validates a code within the clock-skew window", async () => {
    const store = memoryStore();
    const now = new Date("2026-07-28T12:00:00Z");
    const service = createTotpService(store, crypto, () => now);
    const enrollment = await service.enroll("user-1", "owner");
    await service.confirm("user-1", totp(enrollment.secret, now.getTime() / 1000));
    const late = new Date(now.getTime() + 30_000);
    const lateService = createTotpService(store, crypto, () => late);
    expect(await lateService.validate("user-1", totp(enrollment.secret, late.getTime() / 1000))).toBe(true);
  });

  it("rejects replayed codes", async () => {
    const store = memoryStore();
    const now = new Date("2026-07-28T12:00:00Z");
    const service = createTotpService(store, crypto, () => now);
    const enrollment = await service.enroll("user-1", "owner");
    await service.confirm("user-1", totp(enrollment.secret, now.getTime() / 1000));
    const code = totp(enrollment.secret, now.getTime() / 1000);
    expect(await service.validate("user-1", code)).toBe(false);
  });

  it("rejects codes outside the ±1 window", async () => {
    const store = memoryStore();
    const now = new Date("2026-07-28T12:00:00Z");
    const service = createTotpService(store, crypto, () => now);
    const enrollment = await service.enroll("user-1", "owner");
    await service.confirm("user-1", totp(enrollment.secret, now.getTime() / 1000));
    const farFutureCode = totp(enrollment.secret, now.getTime() / 1000 + 120);
    expect(await service.validate("user-1", farFutureCode)).toBe(false);
  });

  it("validates and consumes a recovery code", async () => {
    const store = memoryStore();
    const now = new Date("2026-07-28T12:00:00Z");
    const service = createTotpService(store, crypto, () => now);
    const enrollment = await service.enroll("user-1", "owner");
    await service.confirm("user-1", totp(enrollment.secret, now.getTime() / 1000));
    const code = enrollment.recoveryCodes[0];
    expect(await service.validateWithRecoveryCode("user-1", code)).toBe(true);
    expect(await service.validateWithRecoveryCode("user-1", code)).toBe(false);
    const codes = store.recoveryCodes.get("user-1") ?? [];
    expect(codes.filter((candidate) => candidate.consumedAt !== null)).toHaveLength(1);
  });

  it("rejects an unknown recovery code", async () => {
    const store = memoryStore();
    const service = createTotpService(store, crypto, () => new Date("2026-07-28T12:00:00Z"));
    await service.enroll("user-1", "owner");
    expect(await service.validateWithRecoveryCode("user-1", "a".repeat(32))).toBe(false);
  });

  it("disables TOTP, deletes credentials, and revokes sessions", async () => {
    const store = memoryStore();
    const service = createTotpService(store, crypto, () => new Date("2026-07-28T12:00:00Z"));
    await service.enroll("user-1", "owner");
    await service.disable("user-1");
    expect(store.credentials.has("user-1")).toBe(false);
    expect(store.recoveryCodes.has("user-1")).toBe(false);
    expect(store.sessionsRevoked.has("user-1")).toBe(true);
    expect(await service.isEnrolled("user-1")).toBe(false);
  });

  it("reports enrollment state correctly", async () => {
    const store = memoryStore();
    const now = new Date("2026-07-28T12:00:00Z");
    const service = createTotpService(store, crypto, () => now);
    expect(await service.isEnrolled("user-1")).toBe(false);
    const enrollment = await service.enroll("user-1", "owner");
    expect(await service.hasPendingEnrollment("user-1")).toBe(true);
    expect(await service.isEnrolled("user-1")).toBe(false);
    await service.confirm("user-1", totp(enrollment.secret, now.getTime() / 1000));
    expect(await service.hasPendingEnrollment("user-1")).toBe(false);
    expect(await service.isEnrolled("user-1")).toBe(true);
  });

  it("reports TOTP status", async () => {
    const store = memoryStore();
    const now = new Date("2026-07-28T12:00:00Z");
    const service = createTotpService(store, crypto, () => now);
    expect(await service.getStatus("user-1")).toBe("none");
    const enrollment = await service.enroll("user-1", "owner");
    expect(await service.getStatus("user-1")).toBe("pending");
    await service.confirm("user-1", totp(enrollment.secret, now.getTime() / 1000));
    expect(await service.getStatus("user-1")).toBe("active");
  });

  it("regenerates recovery codes and invalidates old ones", async () => {
    const store = memoryStore();
    const now = new Date("2026-07-28T12:00:00Z");
    const service = createTotpService(store, crypto, () => now);
    const enrollment = await service.enroll("user-1", "owner");
    await service.confirm("user-1", totp(enrollment.secret, now.getTime() / 1000));
    const newCodes = await service.regenerateRecoveryCodes("user-1");
    expect(newCodes).toHaveLength(10);
    expect(newCodes[0]).toMatch(/^[0-9a-f]{32}$/);
    expect(await service.validateWithRecoveryCode("user-1", enrollment.recoveryCodes[0])).toBe(false);
    expect(await service.validateWithRecoveryCode("user-1", newCodes[0])).toBe(true);
  });

  it("rejects recovery-code regeneration without credential", async () => {
    const service = createTotpService(memoryStore(), crypto, () => new Date("2026-07-28T12:00:00Z"));
    await expect(service.regenerateRecoveryCodes("user-1")).rejects.toThrow("TOTP is unavailable");
  });
});
