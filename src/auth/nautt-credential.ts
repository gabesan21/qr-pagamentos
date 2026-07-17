import { getDatabaseClient } from "../db/client";
import { decrypt, encrypt, loadEncryptionKey } from "../lib/nautt-crypto";

import { ForbiddenError, type Principal } from "./authorization";

export type NauttCredentialRecord = {
  userId: string;
  encryptedApiKey: string;
  createdAt: Date;
  updatedAt: Date;
};

export interface NauttCredentialStore {
  upsert(userId: string, encryptedApiKey: string): Promise<void>;
  find(userId: string): Promise<NauttCredentialRecord | null>;
  exists(userId: string): Promise<boolean>;
}

export type NauttCredentialRedacted = {
  hasCredential: boolean;
  updatedAt: Date | null;
};

export class NauttCredentialValidationError extends Error {}
export class NauttCredentialNotFoundError extends Error {}

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
      await store.upsert(targetUserId, encrypted);
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
    async upsert(userId, encryptedApiKey) {
      await db.nauttCredential.upsert({
        where: { userId },
        create: { userId, encryptedApiKey },
        update: { encryptedApiKey },
      });
    },
    async find(userId) {
      return db.nauttCredential.findUnique({ where: { userId } });
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
