import "server-only";

import { decrypt, loadEncryptionKey } from "../../lib/nautt-crypto";

import type { WebhookSecretCandidate } from "./webhook-signature";

export type EncryptedWebhookSecretCandidate = {
  readonly ownerId: string;
  readonly encryptedWebhookSecret: string;
};

type CandidateLoaderDependencies = {
  readonly loadKey?: () => Buffer;
  readonly decryptSecret?: (encrypted: string, key: Buffer) => string;
};

export function createWebhookSecretCandidateLoader(
  loadEncryptedCandidates: () => Promise<readonly EncryptedWebhookSecretCandidate[]>,
  dependencies: CandidateLoaderDependencies = {},
) {
  const loadKey = dependencies.loadKey ?? loadEncryptionKey;
  const decryptSecret = dependencies.decryptSecret ?? decrypt;
  return async (): Promise<readonly WebhookSecretCandidate[]> => {
    const rows = await loadEncryptedCandidates();
    const key = loadKey();
    const candidates: WebhookSecretCandidate[] = [];
    try {
      for (const row of rows) {
        let plaintext = decryptSecret(row.encryptedWebhookSecret, key);
        try {
          candidates.push({ ownerId: row.ownerId, secret: Buffer.from(plaintext, "utf8") });
        } finally {
          plaintext = "";
        }
      }
      return candidates;
    } catch (error) {
      for (const candidate of candidates) candidate.secret.fill(0);
      throw error;
    } finally {
      key.fill(0);
    }
  };
}
