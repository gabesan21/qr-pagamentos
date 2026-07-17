import { getDatabaseClient } from "../db/client";
import { decrypt, encrypt, loadEncryptionKey } from "../lib/nautt-crypto";
import { randomUUID } from "node:crypto";

import { ForbiddenError, type Principal } from "./authorization";

export type NauttCredentialRecord = {
  userId: string;
  encryptedApiKey: string;
  credentialRevision: string;
  webhookRegistrationState: NauttWebhookRegistrationState;
  providerWebhookId: string | null;
  encryptedWebhookSecret: string | null;
  webhookRegisteredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type NauttWebhookRegistrationState = "UNREGISTERED" | "REGISTERING" | "ACTIVE" | "INDETERMINATE";

export interface NauttCredentialStore {
  saveValidatedIfRevision(input: {
    userId: string;
    encryptedApiKey: string;
    expectedRevision: string | null;
    freshRevision: string;
  }): Promise<boolean>;
  find(userId: string): Promise<NauttCredentialRecord | null>;
  exists(userId: string): Promise<boolean>;
}

export type NauttCredentialRedacted = {
  hasCredential: boolean;
  credentialRevision: string | null;
  webhookRegistrationState: NauttWebhookRegistrationState | null;
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

export function createNauttCredentialService(
  store: NauttCredentialStore,
  crypto: CryptoAdapter,
  createRevision: () => string = randomUUID,
) {
  async function saveValidated(
    actor: Principal,
    targetUserId: string,
    apiKey: string,
    expectedRevision: string | null,
  ): Promise<string> {
    requireOwnerOrAdmin(actor, targetUserId);
    const trimmed = apiKey.trim();
    if (!trimmed) throw new NauttCredentialValidationError("API key is required");
    const freshRevision = createRevision();
    const encryptedApiKey = crypto.encrypt(trimmed, crypto.loadKey());
    const saved = await store.saveValidatedIfRevision({
      userId: targetUserId,
      encryptedApiKey,
      expectedRevision,
      freshRevision,
    });
    if (!saved) throw new NauttCredentialReplacementBlockedError("Credential setup changed");
    return freshRevision;
  }

  return {
    async save(actor: Principal, targetUserId: string, apiKey: string) {
      requireOwnerOrAdmin(actor, targetUserId);
      const current = await store.find(targetUserId);
      await saveValidated(actor, targetUserId, apiKey, current?.credentialRevision ?? null);
    },

    saveValidated,

    async snapshotRevision(actor: Principal, targetUserId: string): Promise<string | null> {
      requireOwnerOrAdmin(actor, targetUserId);
      return (await store.find(targetUserId))?.credentialRevision ?? null;
    },

    async getRedacted(actor: Principal, targetUserId: string): Promise<NauttCredentialRedacted> {
      requireOwnerOrAdmin(actor, targetUserId);
      const record = await store.find(targetUserId);
      return {
        hasCredential: !!record,
        credentialRevision: record?.credentialRevision ?? null,
        webhookRegistrationState: record?.webhookRegistrationState ?? null,
        updatedAt: record?.updatedAt ?? null,
      };
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
    async saveValidatedIfRevision({ userId, encryptedApiKey, expectedRevision, freshRevision }) {
      if (expectedRevision === null) {
        try {
          await db.nauttCredential.create({ data: { userId, encryptedApiKey, credentialRevision: freshRevision } });
          return true;
        } catch (error) {
          if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") return false;
          throw error;
        }
      }
      const updated = await db.nauttCredential.updateMany({
        where: { userId, credentialRevision: expectedRevision, webhookRegistrationState: "UNREGISTERED" },
        data: { encryptedApiKey, credentialRevision: freshRevision },
      });
      return updated.count === 1;
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
