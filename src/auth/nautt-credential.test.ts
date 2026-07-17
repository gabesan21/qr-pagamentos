import { describe, expect, it, vi } from "vitest";

import { ForbiddenError } from "./authorization";
import {
  createNauttCredentialService,
  NauttCredentialNotFoundError,
  NauttCredentialValidationError,
  type NauttCredentialRecord,
  type NauttCredentialStore,
} from "./nautt-credential";

const testKey = Buffer.alloc(32, 0x12);

const crypto = {
  encrypt: vi.fn((plaintext: string, key: Buffer) => `enc:${plaintext}:${key.toString("base64url")}`),
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  decrypt: vi.fn((ciphertext: string, _key: Buffer) => {
    const payload = ciphertext.split(":")[1];
    if (!payload) throw new Error("Invalid ciphertext");
    return payload;
  }),
  loadKey: () => testKey,
};

function store(): NauttCredentialStore & { records: Map<string, NauttCredentialRecord> } {
  const records = new Map<string, NauttCredentialRecord>();
  return {
    records,
    async upsert(userId, encryptedApiKey) {
      const existing = records.get(userId);
      const now = new Date();
      records.set(userId, {
        userId,
        encryptedApiKey,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });
    },
    async find(userId) {
      return records.get(userId) ?? null;
    },
    async exists(userId) {
      return records.has(userId);
    },
  };
}

const owner = { id: "owner", username: "owner", email: null, role: "USER" as const, status: "ACTIVE" as const, createdAt: new Date() };
const admin = { id: "admin", username: "admin", email: null, role: "ADMIN" as const, status: "ACTIVE" as const, createdAt: new Date() };
const other = { id: "other", username: "other", email: null, role: "USER" as const, status: "ACTIVE" as const, createdAt: new Date() };
const disabled = { id: "disabled", username: "disabled", email: null, role: "USER" as const, status: "DISABLED" as const, createdAt: new Date() };

describe("nautt credential service", () => {
  it("allows an owner to save and read their own redacted credential", async () => {
    const repository = store();
    const service = createNauttCredentialService(repository, crypto);
    await service.save(owner, owner.id, "owner-key");
    const redacted = await service.getRedacted(owner, owner.id);
    expect(redacted.hasCredential).toBe(true);
    expect(redacted.updatedAt).toBeInstanceOf(Date);
    expect(repository.records.get(owner.id)?.encryptedApiKey).toBe(`enc:owner-key:${testKey.toString("base64url")}`);
  });

  it("allows an administrator to save and read a credential for another user", async () => {
    const repository = store();
    const service = createNauttCredentialService(repository, crypto);
    await service.save(admin, owner.id, "admin-set-key");
    const redacted = await service.getRedacted(admin, owner.id);
    expect(redacted.hasCredential).toBe(true);
  });

  it("rejects a non-owner non-admin user", async () => {
    const service = createNauttCredentialService(store(), crypto);
    await expect(service.save(other, owner.id, "evil")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.getRedacted(other, owner.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects a disabled actor", async () => {
    const service = createNauttCredentialService(store(), crypto);
    await expect(service.save(disabled, disabled.id, "key")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.getRedacted(disabled, disabled.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects empty or whitespace-only keys", async () => {
    const service = createNauttCredentialService(store(), crypto);
    await expect(service.save(owner, owner.id, "")).rejects.toBeInstanceOf(NauttCredentialValidationError);
    await expect(service.save(owner, owner.id, "   ")).rejects.toBeInstanceOf(NauttCredentialValidationError);
  });

  it("safely replaces a previous credential without exposing the old value", async () => {
    const repository = store();
    const service = createNauttCredentialService(repository, crypto);
    await service.save(owner, owner.id, "first-key");
    const first = repository.records.get(owner.id)!;
    await new Promise((resolve) => setTimeout(resolve, 10));
    await service.save(owner, owner.id, "second-key");
    const second = repository.records.get(owner.id)!;
    expect(second.encryptedApiKey).toBe(`enc:second-key:${testKey.toString("base64url")}`);
    expect(second.createdAt.getTime()).toBe(first.createdAt.getTime());
    expect(second.updatedAt.getTime()).toBeGreaterThanOrEqual(first.updatedAt.getTime());
  });

  it("returns the original plaintext only through the server-only helper", async () => {
    const repository = store();
    const service = createNauttCredentialService(repository, crypto);
    await service.save(owner, owner.id, "secret-key");
    const decrypted = await service.getDecryptedApiKey(owner.id);
    expect(decrypted).toBe("secret-key");
  });

  it("throws when no credential exists for decryption", async () => {
    const service = createNauttCredentialService(store(), crypto);
    await expect(service.getDecryptedApiKey(owner.id)).rejects.toBeInstanceOf(NauttCredentialNotFoundError);
  });

  it("never includes the key in redacted output", async () => {
    const repository = store();
    const service = createNauttCredentialService(repository, crypto);
    await service.save(owner, owner.id, "leak-test");
    const redacted = await service.getRedacted(owner, owner.id);
    expect(JSON.stringify(redacted)).not.toContain("leak-test");
    expect(JSON.stringify(redacted)).not.toContain("enc:");
  });
});
