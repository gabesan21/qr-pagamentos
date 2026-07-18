import "server-only";

import { getDatabaseClient } from "../../db/client";
import { decrypt, loadEncryptionKey } from "../../lib/nautt-crypto";

import { getOwnerPricingOrdersService } from "./owner-pricing-orders";
import { createPrismaWebhookDeliveryStore } from "./webhook-delivery-store";
import { createWebhookIntake } from "./webhook-intake";
import type { WebhookSecretCandidate } from "./webhook-signature";

async function loadActiveWebhookSecrets(): Promise<readonly WebhookSecretCandidate[]> {
  const prisma = getDatabaseClient();
  const rows = await prisma.nauttCredential.findMany({
    where: { webhookRegistrationState: "ACTIVE", encryptedWebhookSecret: { not: null } },
    orderBy: { userId: "asc" },
    select: { userId: true, encryptedWebhookSecret: true },
  });
  const key = loadEncryptionKey();
  const candidates: WebhookSecretCandidate[] = [];
  try {
    for (const row of rows) {
      let plaintext = decrypt(row.encryptedWebhookSecret as string, key);
      try {
        candidates.push({ ownerId: row.userId, secret: Buffer.from(plaintext, "utf8") });
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
}

let sharedIntake: ReturnType<typeof createWebhookIntake> | undefined;

export async function handleNauttWebhook(input: Parameters<ReturnType<typeof createWebhookIntake>>[0]) {
  if (!sharedIntake) {
    const prisma = getDatabaseClient();
    sharedIntake = createWebhookIntake({
      loadCandidates: loadActiveWebhookSecrets,
      deliveryStore: createPrismaWebhookDeliveryStore(prisma),
      orderReconciler: getOwnerPricingOrdersService(),
    });
  }
  return sharedIntake(input);
}
