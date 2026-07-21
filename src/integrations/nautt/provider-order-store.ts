import "server-only";

import { randomUUID } from "node:crypto";

import type { PrismaClient } from "../../generated/prisma/client";

import type { NauttOrderStatus, NauttOrderView } from "./pricing-orders-client";
import type { ClaimedOrderAttempt, QuoteClaimResult, QuoteOwnershipRegistration, QuoteOwnershipStore } from "./quote-ownership";

export const ACTIVE_ORDER_STATUSES = ["new", "processing", "paid"] as const;
export const FINAL_ORDER_STATUSES = ["finished", "rejected", "canceled", "refunded", "expired"] as const;

export type StoredProviderOrder = {
  readonly id: string;
  readonly ownerId: string;
  readonly quoteUuid: string;
  readonly providerOrderUuid: string | null;
  readonly creationState: "CREATING" | "INDETERMINATE" | "CREATED";
  readonly status: NauttOrderStatus | null;
  readonly fiatAmount: string | null;
  readonly cryptoAmount: string | null;
  readonly nauttQuote: string | null;
  readonly providerExpiresAt: Date | null;
  readonly paymentMethod: string | null;
  readonly pixCopyPaste: string | null;
  readonly pixQrcodeUrl: string | null;
  readonly reconciliationVersion: number;
};

export interface ProviderOrderStore extends QuoteOwnershipStore {
  releasePreDispatch(attempt: ClaimedOrderAttempt): Promise<void>;
  markIndeterminate(attempt: ClaimedOrderAttempt, providerOrderUuid?: string): Promise<void>;
  completeCreation(attempt: ClaimedOrderAttempt, order: NauttOrderView): Promise<StoredProviderOrder>;
  findPollable(ownerId: string, localOrderId: string): Promise<StoredProviderOrder | null>;
  findRecoverable(ownerId: string, localOrderId: string): Promise<StoredProviderOrder | null>;
  findWebhookActionable(ownerId: string, providerOrderUuid: string): Promise<StoredProviderOrder | null>;
  reconcile(observed: StoredProviderOrder, order: NauttOrderView): Promise<StoredProviderOrder>;
}

function asStored(row: Record<string, unknown>): StoredProviderOrder {
  return row as StoredProviderOrder;
}

function orderData(order: NauttOrderView) {
  return {
    providerOrderUuid: order.orderUuid,
    status: order.status,
    fiatAmount: order.fiatAmount,
    cryptoAmount: order.cryptoAmount,
    nauttQuote: order.nauttQuote,
    providerExpiresAt: order.expiresAt,
    paymentMethod: order.paymentMethod,
    pixCopyPaste: order.pixCopyPaste ?? null,
    pixQrcodeUrl: order.pixQrcodeUrl ?? null,
  };
}

export function createPrismaProviderOrderStore(prisma: PrismaClient): ProviderOrderStore {
  return {
    async register(registration: QuoteOwnershipRegistration): Promise<boolean> {
      try {
        await prisma.providerQuote.create({ data: registration });
        return true;
      } catch {
        return false;
      }
    },

    async claimForCreation({ quoteUuid, ownerId, now, paymentLinkOrderId }): Promise<QuoteClaimResult> {
      return prisma.$transaction(async (tx) => {
        const claimed = await tx.providerQuote.updateMany({
          where: { quoteUuid, ownerId, claimedAt: null, expiresAt: { gt: now }, order: null },
          data: { claimedAt: now },
        });
        if (claimed.count !== 1) return { kind: "unavailable" };
        const attempt = await tx.providerOrder.create({ data: { quoteUuid, ownerId, paymentLinkOrderId } });
        return { kind: "claimed", attempt: { id: attempt.id, ownerId, quoteUuid } };
      });
    },

    async releasePreDispatch(attempt): Promise<void> {
      await prisma.$transaction(async (tx) => {
        const removed = await tx.providerOrder.deleteMany({
          where: { id: attempt.id, ownerId: attempt.ownerId, quoteUuid: attempt.quoteUuid, creationState: "CREATING" },
        });
        if (removed.count === 1) {
          await tx.providerQuote.updateMany({
            where: { quoteUuid: attempt.quoteUuid, ownerId: attempt.ownerId },
            data: { claimedAt: null },
          });
        }
      });
    },

    async markIndeterminate(attempt, providerOrderUuid): Promise<void> {
      await prisma.providerOrder.updateMany({
        where: { id: attempt.id, ownerId: attempt.ownerId, quoteUuid: attempt.quoteUuid, creationState: "CREATING" },
        data: { creationState: "INDETERMINATE", providerOrderUuid: providerOrderUuid ?? null },
      });
    },

    async completeCreation(attempt, order): Promise<StoredProviderOrder> {
      const result = await prisma.providerOrder.updateMany({
        where: { id: attempt.id, ownerId: attempt.ownerId, quoteUuid: attempt.quoteUuid, creationState: "CREATING" },
        data: { creationState: "CREATED", ...orderData(order), reconciliationVersion: { increment: 1 } },
      });
      if (result.count !== 1) throw new Error("creation attempt changed");
      return asStored(await prisma.providerOrder.findUniqueOrThrow({ where: { id: attempt.id } }));
    },

    async findPollable(ownerId, localOrderId): Promise<StoredProviderOrder | null> {
      const row = await prisma.providerOrder.findFirst({
        where: { id: localOrderId, ownerId, creationState: "CREATED", status: { in: [...ACTIVE_ORDER_STATUSES] } },
      });
      return row ? asStored(row) : null;
    },

    async findRecoverable(ownerId, localOrderId): Promise<StoredProviderOrder | null> {
      const row = await prisma.providerOrder.findFirst({
        where: { id: localOrderId, ownerId, creationState: "INDETERMINATE", providerOrderUuid: { not: null } },
      });
      return row ? asStored(row) : null;
    },

    async findWebhookActionable(ownerId, providerOrderUuid): Promise<StoredProviderOrder | null> {
      const row = await prisma.providerOrder.findFirst({
        where: {
          ownerId,
          providerOrderUuid,
          OR: [
            { creationState: "CREATED", status: { in: [...ACTIVE_ORDER_STATUSES] } },
            { creationState: "INDETERMINATE", status: null },
          ],
        },
      });
      return row ? asStored(row) : null;
    },

    async reconcile(observed, order): Promise<StoredProviderOrder> {
      const isActiveCreated = observed.creationState === "CREATED" && ACTIVE_ORDER_STATUSES.includes(observed.status as never);
      const isKnownRecovery = observed.creationState === "INDETERMINATE" && observed.status === null && observed.providerOrderUuid !== null;
      if (order.orderUuid !== observed.providerOrderUuid || (!isActiveCreated && !isKnownRecovery)) {
        return asStored(await prisma.providerOrder.findUniqueOrThrow({ where: { id: observed.id } }));
      }
      await prisma.providerOrder.updateMany({
        where: {
          id: observed.id,
          ownerId: observed.ownerId,
          providerOrderUuid: observed.providerOrderUuid,
          creationState: observed.creationState,
          status: observed.status,
          reconciliationVersion: observed.reconciliationVersion,
        },
        data: {
          creationState: "CREATED",
          ...orderData(order),
          reconciliationVersion: { increment: 1 },
        },
      });
      const current = await prisma.providerOrder.findUniqueOrThrow({ where: { id: observed.id } });
      return asStored(current);
    },
  };
}

export function storedOrderView(order: StoredProviderOrder): NauttOrderView {
  if (!order.providerOrderUuid || !order.status || order.fiatAmount === null || order.cryptoAmount === null || order.nauttQuote === null || !order.providerExpiresAt || !order.paymentMethod) {
    throw new Error("provider order is incomplete");
  }
  return {
    orderUuid: order.providerOrderUuid,
    status: order.status,
    fiatAmount: order.fiatAmount,
    cryptoAmount: order.cryptoAmount,
    nauttQuote: order.nauttQuote,
    expiresAt: order.providerExpiresAt,
    paymentMethod: order.paymentMethod,
    ...(order.pixCopyPaste ? { pixCopyPaste: order.pixCopyPaste } : {}),
    ...(order.pixQrcodeUrl ? { pixQrcodeUrl: order.pixQrcodeUrl } : {}),
  };
}

export function createInMemoryProviderOrderStore(): ProviderOrderStore {
  const quotes = new Map<string, { ownerId: string; expiresAt: Date; claimedAt: Date | null }>();
  const orders = new Map<string, StoredProviderOrder>();
  return {
    register({ quoteUuid, ownerId, expiresAt }) {
      if (quotes.has(quoteUuid)) return Promise.resolve(false);
      quotes.set(quoteUuid, { ownerId, expiresAt, claimedAt: null });
      return Promise.resolve(true);
    },
    claimForCreation({ quoteUuid, ownerId, now }) {
      const quote = quotes.get(quoteUuid);
      if (!quote || quote.ownerId !== ownerId || quote.claimedAt || quote.expiresAt <= now) {
        return Promise.resolve({ kind: "unavailable" });
      }
      quote.claimedAt = now;
      const attempt = { id: randomUUID(), ownerId, quoteUuid };
      orders.set(attempt.id, {
        ...attempt,
        providerOrderUuid: null,
        creationState: "CREATING",
        status: null,
        fiatAmount: null,
        cryptoAmount: null,
        nauttQuote: null,
        providerExpiresAt: null,
        paymentMethod: null,
        pixCopyPaste: null,
        pixQrcodeUrl: null,
        reconciliationVersion: 0,
      });
      return Promise.resolve({ kind: "claimed", attempt });
    },
    releasePreDispatch(attempt) {
      const order = orders.get(attempt.id);
      if (order?.creationState === "CREATING") {
        orders.delete(attempt.id);
        const quote = quotes.get(attempt.quoteUuid);
        if (quote?.ownerId === attempt.ownerId) quote.claimedAt = null;
      }
      return Promise.resolve();
    },
    markIndeterminate(attempt, providerOrderUuid) {
      const order = orders.get(attempt.id);
      if (order?.creationState === "CREATING") {
        orders.set(attempt.id, { ...order, creationState: "INDETERMINATE", providerOrderUuid: providerOrderUuid ?? null });
      }
      return Promise.resolve();
    },
    completeCreation(attempt, order) {
      const current = orders.get(attempt.id);
      if (!current || current.creationState !== "CREATING") return Promise.reject(new Error("creation attempt changed"));
      const completed: StoredProviderOrder = {
        ...current,
        creationState: "CREATED",
        ...orderData(order),
        reconciliationVersion: current.reconciliationVersion + 1,
      };
      orders.set(attempt.id, completed);
      return Promise.resolve(completed);
    },
    findPollable(ownerId, localOrderId) {
      const order = orders.get(localOrderId);
      return Promise.resolve(order?.ownerId === ownerId && order.creationState === "CREATED" && ACTIVE_ORDER_STATUSES.includes(order.status as never) ? order : null);
    },
    findRecoverable(ownerId, localOrderId) {
      const order = orders.get(localOrderId);
      return Promise.resolve(order?.ownerId === ownerId && order.creationState === "INDETERMINATE" && order.providerOrderUuid ? order : null);
    },
    findWebhookActionable(ownerId, providerOrderUuid) {
      const order = [...orders.values()].find((candidate) =>
        candidate.ownerId === ownerId &&
        candidate.providerOrderUuid === providerOrderUuid &&
        ((candidate.creationState === "CREATED" && ACTIVE_ORDER_STATUSES.includes(candidate.status as never)) ||
          (candidate.creationState === "INDETERMINATE" && candidate.status === null)),
      );
      return Promise.resolve(order ?? null);
    },
    reconcile(observed, order) {
      const current = orders.get(observed.id);
      const isActiveCreated = observed.creationState === "CREATED" && ACTIVE_ORDER_STATUSES.includes(observed.status as never);
      const isKnownRecovery = observed.creationState === "INDETERMINATE" && observed.status === null && observed.providerOrderUuid !== null;
      if (order.orderUuid === observed.providerOrderUuid && (isActiveCreated || isKnownRecovery) && current && current.ownerId === observed.ownerId && current.providerOrderUuid === observed.providerOrderUuid && current.creationState === observed.creationState && current.status === observed.status && current.reconciliationVersion === observed.reconciliationVersion) {
        orders.set(observed.id, { ...current, creationState: "CREATED", ...orderData(order), reconciliationVersion: current.reconciliationVersion + 1 });
      }
      const result = orders.get(observed.id);
      return result ? Promise.resolve(result) : Promise.reject(new Error("order unavailable"));
    },
  };
}
