import "server-only";

import { normalizeNauttCredentialRecord, type NauttCredentialRecord } from "../../auth/nautt-credential";
import { getDatabaseClient } from "../../db/client";
import { decrypt, encrypt, loadEncryptionKey } from "../../lib/nautt-crypto";

import {
  getClientWebhooksAdapter,
  type RegisteredNauttWebhook,
  validateNauttWebhookCallbackUrl,
} from "./client-webhooks";

export type RedactedOwnerWebhookRegistration = {
  providerWebhookId: string;
  state: "ACTIVE";
  registeredAt: Date;
};

export interface OwnerWebhookRegistrationStore {
  find(userId: string): Promise<NauttCredentialRecord | null>;
  claim(userId: string, expectedUpdatedAt: Date): Promise<boolean>;
  markIndeterminate(userId: string): Promise<void>;
  activate(
    userId: string,
    registration: { providerWebhookId: string; encryptedWebhookSecret: string; registeredAt: Date },
  ): Promise<boolean>;
}

type RegistrationAdapter = {
  register(input: { apiKey: string; callbackUrl: string }): Promise<RegisteredNauttWebhook>;
};

type CryptoAdapter = {
  encrypt(plaintext: string, key: Buffer): string;
  decrypt(ciphertext: string, key: Buffer): string;
  loadKey(): Buffer;
};

export class OwnerWebhookRegistrationError extends Error {}
export class OwnerWebhookRegistrationRecoveryRequiredError extends Error {}

function activeMetadata(record: NauttCredentialRecord): RedactedOwnerWebhookRegistration | null {
  if (
    record.webhookRegistrationState !== "ACTIVE" ||
    !record.providerWebhookId ||
    !record.webhookRegisteredAt ||
    !record.encryptedWebhookSecret
  ) {
    return null;
  }
  return { providerWebhookId: record.providerWebhookId, state: "ACTIVE", registeredAt: record.webhookRegisteredAt };
}

export function createOwnerWebhookRegistrationService(
  store: OwnerWebhookRegistrationStore,
  adapter: RegistrationAdapter,
  crypto: CryptoAdapter,
) {
  const recoveryRequired = () => new OwnerWebhookRegistrationRecoveryRequiredError("Webhook registration requires recovery");

  async function preserveIndeterminate(userId: string) {
    try {
      await store.markIndeterminate(userId);
    } catch {
      // REGISTERING remains a protected, non-retryable state when this write is uncertain.
    }
  }

  return {
    async register(userId: string, callbackCandidate: string): Promise<RedactedOwnerWebhookRegistration> {
      const credential = await store.find(userId);
      if (!credential) throw new OwnerWebhookRegistrationError("Webhook registration is unavailable");

      const active = activeMetadata(credential);
      if (active) return active;
      if (credential.webhookRegistrationState !== "UNREGISTERED") throw recoveryRequired();

      let callbackUrl: string;
      let apiKey: string;
      try {
        callbackUrl = validateNauttWebhookCallbackUrl(callbackCandidate);
        apiKey = crypto.decrypt(credential.encryptedApiKey, crypto.loadKey());
      } catch {
        throw new OwnerWebhookRegistrationError("Webhook registration is unavailable");
      }

      let claimed: boolean;
      try {
        claimed = await store.claim(userId, credential.updatedAt);
      } catch {
        throw recoveryRequired();
      }
      if (!claimed) {
        const current = await store.find(userId);
        const winner = current ? activeMetadata(current) : null;
        if (winner) return winner;
        throw recoveryRequired();
      }

      let registration: RegisteredNauttWebhook;
      try {
        registration = await adapter.register({ apiKey, callbackUrl });
      } catch {
        await preserveIndeterminate(userId);
        throw recoveryRequired();
      } finally {
        apiKey = "";
      }

      let encryptedWebhookSecret: string;
      try {
        encryptedWebhookSecret = crypto.encrypt(registration.secret, crypto.loadKey());
      } catch {
        registration.secret = "";
        await preserveIndeterminate(userId);
        throw recoveryRequired();
      }
      registration.secret = "";

      try {
        const activated = await store.activate(userId, {
          providerWebhookId: registration.providerWebhookId,
          encryptedWebhookSecret,
          registeredAt: registration.registeredAt,
        });
        if (!activated) throw recoveryRequired();
      } catch {
        await preserveIndeterminate(userId);
        throw recoveryRequired();
      }

      return {
        providerWebhookId: registration.providerWebhookId,
        state: "ACTIVE",
        registeredAt: registration.registeredAt,
      };
    },
  };
}

function prismaStore(): OwnerWebhookRegistrationStore {
  const db = getDatabaseClient();
  return {
    async find(userId) {
      const record = await db.nauttCredential.findUnique({ where: { userId } });
      return record ? normalizeNauttCredentialRecord(record) : null;
    },
    async claim(userId, expectedUpdatedAt) {
      const result = await db.nauttCredential.updateMany({
        where: { userId, updatedAt: expectedUpdatedAt, webhookRegistrationState: "UNREGISTERED" },
        data: { webhookRegistrationState: "REGISTERING" },
      });
      return result.count === 1;
    },
    async markIndeterminate(userId) {
      await db.nauttCredential.updateMany({
        where: { userId, webhookRegistrationState: "REGISTERING" },
        data: { webhookRegistrationState: "INDETERMINATE" },
      });
    },
    async activate(userId, registration) {
      const result = await db.nauttCredential.updateMany({
        where: { userId, webhookRegistrationState: "REGISTERING" },
        data: {
          webhookRegistrationState: "ACTIVE",
          providerWebhookId: registration.providerWebhookId,
          encryptedWebhookSecret: registration.encryptedWebhookSecret,
          webhookRegisteredAt: registration.registeredAt,
        },
      });
      return result.count === 1;
    },
  };
}

export function getOwnerWebhookRegistrationService() {
  return createOwnerWebhookRegistrationService(prismaStore(), getClientWebhooksAdapter(), {
    encrypt,
    decrypt,
    loadKey: loadEncryptionKey,
  });
}
