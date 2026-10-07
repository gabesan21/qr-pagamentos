import "server-only";

import { getDatabaseClient } from "../../db/client";
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
      deliveryStore: createPrismaWebhookDeliveryStore(prisma),
      orderReconciler: getOwnerPricingOrdersService(),
    });
  }
  return sharedIntake(input);
}
