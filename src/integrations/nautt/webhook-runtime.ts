import "server-only";

import { getDatabaseClient } from "../../db/client";
import { getOwnerPricingOrdersService } from "./owner-pricing-orders";
import { createPrismaWebhookDeliveryStore } from "./webhook-delivery-store";
import { createWebhookIntake } from "./webhook-intake";
import { createWebhookSecretCandidateLoader } from "./webhook-secret-candidates";

const loadActiveWebhookSecrets = createWebhookSecretCandidateLoader(async () => {
  const prisma = getDatabaseClient();
  const rows = await prisma.nauttCredential.findMany({
    where: { webhookRegistrationState: "ACTIVE", encryptedWebhookSecret: { not: null } },
    orderBy: { userId: "asc" },
    select: { userId: true, encryptedWebhookSecret: true },
  });
  return rows.map((row) => ({ ownerId: row.userId, encryptedWebhookSecret: row.encryptedWebhookSecret as string }));
});

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
