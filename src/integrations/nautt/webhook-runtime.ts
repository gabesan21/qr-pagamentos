import "server-only";

import { getDatabaseClient } from "../../db/client";
import { decrypt, loadEncryptionKey, loadPreviousEncryptionKey } from "../../lib/nautt-crypto";
import { getOwnerPricingOrdersService } from "./owner-pricing-orders";
import { createPrismaProviderOrderOwnerResolver } from "./provider-order-store";
import { createPrismaWebhookDeliveryStore } from "./webhook-delivery-store";
import { createWebhookIntake } from "./webhook-intake";

let sharedIntake: ReturnType<typeof createWebhookIntake> | undefined;

export async function handleNauttWebhook(input: Parameters<ReturnType<typeof createWebhookIntake>>[0]) {
  if (!sharedIntake) {
    const prisma = getDatabaseClient();
    sharedIntake = createWebhookIntake({
      resolveOrderOwner: createPrismaProviderOrderOwnerResolver(prisma),
      loadOwnerWebhookSecret: async (ownerId) => {
        const credential = await prisma.nauttCredential.findUnique({
          where: { userId: ownerId },
          select: { webhookRegistrationState: true, encryptedWebhookSecret: true },
        });
        if (!credential || credential.webhookRegistrationState !== "ACTIVE" || credential.encryptedWebhookSecret === null) return null;
        if (credential.encryptedWebhookSecret.length === 0) throw new Error("Empty webhook ciphertext");
        let key: Buffer | undefined;
        let previousKey: Buffer | undefined;
        let plaintext: string | undefined;
        try {
          key = loadEncryptionKey();
          previousKey = loadPreviousEncryptionKey();
          plaintext = decrypt(credential.encryptedWebhookSecret, key, previousKey);
          if (plaintext.length === 0) throw new Error("Empty webhook secret");
          return Buffer.from(plaintext, "utf8");
        } finally {
          plaintext = undefined;
          key?.fill(0);
          previousKey?.fill(0);
        }
      },
      deliveryStore: createPrismaWebhookDeliveryStore(prisma),
      orderReconciler: getOwnerPricingOrdersService(),
    });
  }
  return sharedIntake(input);
}
