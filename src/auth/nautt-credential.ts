import { getDatabaseClient } from "../db/client";
import { decrypt, encrypt, loadEncryptionKey } from "../lib/nautt-crypto";

import { ForbiddenError, type Principal } from "./authorization";

export type NauttCredentialRecord = {
  userId: string;
  encryptedApiKey: string;
  webhookRegistrationState: NauttWebhookRegistrationState;
  providerWebhookId: string | null;
  encryptedWebhookSecret: string | null;
  webhookRegisteredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type NauttWebhookRegistrationState = "UNREGISTERED" | "REGISTERING" | "ACTIVE" | "INDETERMINATE";

export interface NauttCredentialStore {
  saveIfUnregistered(userId: string, encryptedApiKey: string): Promise<boolean>;
  find(userId: string): Promise<NauttCredentialRecord | null>;
  exists(userId: string): Promise<boolean>;
}

export type NauttCredentialRedacted = {
  hasCredential: boolean;
  updatedAt: Date | null;
};

export class NauttCredentialValidationError extends Error {}
export class NauttCredentialNotFoundError extends Error {}
export class NauttCredentialReplacementBlockedError extends Error {}

export function normalizeNauttCredentialRecord(
  record: Omit<NauttCredentialRecord, "webhookRegistrationState"> & { webhookRegistrationState: string },
): NauttCredentialRecord {
  switch (record.webhookRegistrationState) {
    case "UNREGISTERED":
    case "REGISTERING":
    case "ACTIVE":
    case "INDETERMINATE":
      return { ...record, webhookRegistrationState: record.webhookRegistrationState };
    default:
      throw new Error("Invalid persisted Nautt webhook registration state");
  }
}

type CryptoAdapter = {
  encrypt(plaintext: string, key: Buffer): string;
  decrypt(ciphertext: string, key: Buffer): string;
  loadKey(): Buffer;
};

function requireOwnerOrAdmin(actor: Principal, targetUserId: string) {
  if (actor.status !== "ACTIVE") {
    throw new ForbiddenError("Active account required");
  }
  if (actor.id !== targetUserId && actor.role !== "ADMIN") {
    throw new ForbiddenError("Access denied");
  }
}

export function createNauttCredentialService(store: NauttCredentialStore, crypto: CryptoAdapter) {
  return {
    async save(actor: Principal, targetUserId: string, apiKey: string) {
      requireOwnerOrAdmin(actor, targetUserId);
      const trimmed = apiKey.trim();
      if (!trimmed) {
        throw new NauttCredentialValidationError("API key is required");
      }
      const encrypted = crypto.encrypt(trimmed, crypto.loadKey());
      if (!(await store.saveIfUnregistered(targetUserId, encrypted))) {
        throw new NauttCredentialReplacementBlockedError("Credential replacement is unavailable");
      }
    },

    async getRedacted(actor: Principal, targetUserId: string): Promise<NauttCredentialRedacted> {
      requireOwnerOrAdmin(actor, targetUserId);
      const record = await store.find(targetUserId);
      return { hasCredential: !!record, updatedAt: record?.updatedAt ?? null };
    },

    async getDecryptedApiKey(targetUserId: string): Promise<string> {
      const record = await store.find(targetUserId);
      if (!record) {
        throw new NauttCredentialNotFoundError("Credential not found");
      }
      return crypto.decrypt(record.encryptedApiKey, crypto.loadKey());
    },
  };
}

function prismaStore(): NauttCredentialStore {
  const db = getDatabaseClient();
  return {
    async saveIfUnregistered(userId, encryptedApiKey) {
      const updated = await db.nauttCredential.updateMany({
        where: { userId, webhookRegistrationState: "UNREGISTERED" },
        data: { encryptedApiKey },
      });
      if (updated.count === 1) return true;

      const existing = await db.nauttCredential.findUnique({ where: { userId }, select: { userId: true } });
      if (existing) return false;

      try {
        await db.nauttCredential.create({ data: { userId, encryptedApiKey } });
        return true;
      } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") return false;
        throw error;
      }
    },
    async find(userId) {
      const record = await db.nauttCredential.findUnique({ where: { userId } });
      return record ? normalizeNauttCredentialRecord(record) : null;
    },
    async exists(userId) {
      const record = await db.nauttCredential.findUnique({ where: { userId }, select: { userId: true } });
      return record !== null;
    },
  };
}

export function getNauttCredentialService() {
  return createNauttCredentialService(prismaStore(), { encrypt, decrypt, loadKey: loadEncryptionKey });
}
