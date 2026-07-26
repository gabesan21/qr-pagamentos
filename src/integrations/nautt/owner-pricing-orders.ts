import "server-only";

import { getNauttCredentialService } from "../../auth/nautt-credential";
import { getDatabaseClient } from "../../db/client";
import type { PrismaClient } from "../../generated/prisma/client";
import { getOrderV2Service, type SettlementInputV2 } from "../../orders/order-v2";

import { isExactPositiveDecimal, isUuid } from "./decimal";
import {
  getPricingOrdersAdapter,
  isValidOnrampOrderOptions,
  type NauttOnrampOrderInput,
  type NauttOnrampOrderOptions,
  type NauttOrderView,
  NauttOrderCreationIndeterminateError,
  type NauttQuote,
  type NauttQuoteAmount,
  NauttOrderValidationError,
} from "./pricing-orders-client";
import { createPrismaProviderOrderStore, storedOrderView, type ProviderOrderStore, type StoredProviderOrder } from "./provider-order-store";

export class OwnerPricingOrdersError extends Error {
  constructor() {
    super("Nautt pricing and orders are unavailable");
    this.name = "OwnerPricingOrdersError";
  }
}

export interface OwnerNauttCredentialPort {
  getDecryptedApiKey(ownerId: string): Promise<string>;
}

export type OwnerQuoteInput = {
  readonly currencyUuid: string;
  readonly exchangeCurrencyUuid: string;
  readonly amount: NauttQuoteAmount;
};

export type NauttQuoteReference = {
  readonly quoteUuid: string;
};

type PricingOrdersAdapter = {
  createQuote(input: { apiKey: string; currencyUuid: string; exchangeCurrencyUuid: string; amount: NauttQuoteAmount }): Promise<NauttQuote>;
  createOnrampOrder(input: NauttOnrampOrderInput): Promise<NauttOrderView>;
  getOrder(input: { apiKey: string; orderUuid: string }): Promise<NauttOrderView>;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidQuoteInput(input: OwnerQuoteInput): boolean {
  return (
    isPlainObject(input) &&
    isUuid(input.currencyUuid) &&
    isUuid(input.exchangeCurrencyUuid) &&
    isPlainObject(input.amount) &&
    (input.amount.kind === "fiat" || input.amount.kind === "usdt") &&
    isExactPositiveDecimal(input.amount.value)
  );
}

// V2 settlement wiring (9.2.1): invoked only after the authoritative
// owner-bound GET reconciliation has persisted status/version, only for a
// provider order attached to `orderV2Id`. Notification payloads stay
// non-evidence; the hook reads exact persisted identities/versions.
export type OrderV2SettlementHook = (persisted: StoredProviderOrder) => Promise<void>;

export function createOwnerPricingOrdersService(
  credentialPort: OwnerNauttCredentialPort,
  adapter: PricingOrdersAdapter,
  orderStore: ProviderOrderStore,
  now: () => Date = () => new Date(),
  settlementHook?: OrderV2SettlementHook,
) {
  return {
    async quote(ownerId: string, input: OwnerQuoteInput): Promise<NauttQuote> {
      if (!isUuid(ownerId) || !isValidQuoteInput(input)) throw new OwnerPricingOrdersError();

      let apiKey: string;
      try {
        apiKey = await credentialPort.getDecryptedApiKey(ownerId);
      } catch {
        throw new OwnerPricingOrdersError();
      }

      try {
        const issued = await adapter.createQuote({ apiKey, ...input });
        let registered: boolean;
        try {
          registered = await orderStore.register({
            quoteUuid: issued.quoteUuid,
            ownerId,
            expiresAt: issued.expiresAt,
          });
        } catch {
          throw new OwnerPricingOrdersError();
        }
        if (!registered) throw new OwnerPricingOrdersError();
        return issued;
      } finally {
        apiKey = "";
      }
    },

    async createOrder(
      ownerId: string,
      quoteReference: NauttQuoteReference,
      input: NauttOnrampOrderOptions,
      paymentLinkOrderId?: string,
      orderV2Id?: string,
    ): Promise<NauttOrderView> {
      if (
        !isUuid(ownerId) ||
        !isPlainObject(quoteReference) ||
        !isUuid(quoteReference.quoteUuid) ||
        !isPlainObject(input) ||
        !isValidOnrampOrderOptions(input) ||
        (orderV2Id !== undefined && !isUuid(orderV2Id))
      ) {
        throw new OwnerPricingOrdersError();
      }

      let claim: Awaited<ReturnType<ProviderOrderStore["claimForCreation"]>>;
      try {
        claim = await orderStore.claimForCreation({ quoteUuid: quoteReference.quoteUuid, ownerId, now: now(), paymentLinkOrderId, orderV2Id });
      } catch {
        throw new OwnerPricingOrdersError();
      }
      if (claim.kind !== "claimed") throw new OwnerPricingOrdersError();

      let apiKey: string;
      try {
        apiKey = await credentialPort.getDecryptedApiKey(ownerId);
      } catch {
        await orderStore.releasePreDispatch(claim.attempt).catch(() => undefined);
        throw new OwnerPricingOrdersError();
      }

      try {
        let order: NauttOrderView;
        try {
          order = await adapter.createOnrampOrder({ apiKey, quoteUuid: quoteReference.quoteUuid, ...input });
        } catch (error) {
          if (error instanceof NauttOrderValidationError) {
            await orderStore.releasePreDispatch(claim.attempt).catch(() => undefined);
          } else {
            await orderStore.markIndeterminate(claim.attempt).catch(() => undefined);
          }
          throw error;
        }
        try {
          await orderStore.completeCreation(claim.attempt, order);
        } catch {
          await orderStore.markIndeterminate(claim.attempt, order.orderUuid).catch(() => undefined);
          throw new NauttOrderCreationIndeterminateError();
        }
        return order;
      } finally {
        apiKey = "";
      }
    },

    async getOrder(ownerId: string, orderUuid: string): Promise<NauttOrderView> {
      if (!isUuid(ownerId) || !isUuid(orderUuid)) throw new OwnerPricingOrdersError();

      let apiKey: string;
      try {
        apiKey = await credentialPort.getDecryptedApiKey(ownerId);
      } catch {
        throw new OwnerPricingOrdersError();
      }

      try {
        return await adapter.getOrder({ apiKey, orderUuid });
      } finally {
        apiKey = "";
      }
    },

    async pollOrder(ownerId: string, localOrderId: string): Promise<NauttOrderView> {
      return reconcileOne("poll", ownerId, localOrderId, credentialPort, adapter, orderStore);
    },

    async recoverOrder(ownerId: string, localOrderId: string): Promise<NauttOrderView> {
      return reconcileOne("recover", ownerId, localOrderId, credentialPort, adapter, orderStore);
    },

    async reconcileWebhookOrder(ownerId: string, providerOrderUuid: string): Promise<{ kind: "ignored" } | { kind: "processed"; localOrderId: string }> {
      if (!isUuid(ownerId) || !isUuid(providerOrderUuid)) throw new OwnerPricingOrdersError();
      let observed;
      try {
        observed = await orderStore.findWebhookActionable(ownerId, providerOrderUuid);
      } catch {
        throw new OwnerPricingOrdersError();
      }
      if (!observed) return { kind: "ignored" };
      const persisted = await reconcileObserved(observed, credentialPort, adapter, orderStore);
      if (settlementHook) await settlementHook(persisted);
      return { kind: "processed", localOrderId: observed.id };
    },
  };
}

async function reconcileOne(
  mode: "poll" | "recover",
  ownerId: string,
  localOrderId: string,
  credentialPort: OwnerNauttCredentialPort,
  adapter: PricingOrdersAdapter,
  orderStore: ProviderOrderStore,
): Promise<NauttOrderView> {
  if (!isUuid(ownerId) || !isUuid(localOrderId)) throw new OwnerPricingOrdersError();
  let observed;
  try {
    observed = mode === "poll"
      ? await orderStore.findPollable(ownerId, localOrderId)
      : await orderStore.findRecoverable(ownerId, localOrderId);
  } catch {
    throw new OwnerPricingOrdersError();
  }
  if (!observed?.providerOrderUuid) throw new OwnerPricingOrdersError();

  return storedOrderView(await reconcileObserved(observed, credentialPort, adapter, orderStore));
}

async function reconcileObserved(
  observed: NonNullable<Awaited<ReturnType<ProviderOrderStore["findPollable"]>>>,
  credentialPort: OwnerNauttCredentialPort,
  adapter: PricingOrdersAdapter,
  orderStore: ProviderOrderStore,
): Promise<StoredProviderOrder> {
  if (!observed.providerOrderUuid) throw new OwnerPricingOrdersError();
  let apiKey: string;
  try {
    apiKey = await credentialPort.getDecryptedApiKey(observed.ownerId);
  } catch {
    throw new OwnerPricingOrdersError();
  }
  try {
    const fetched = await adapter.getOrder({ apiKey, orderUuid: observed.providerOrderUuid });
    if (fetched.orderUuid !== observed.providerOrderUuid) throw new OwnerPricingOrdersError();
    return await orderStore.reconcile(observed, fetched);
  } catch (error) {
    if (error instanceof OwnerPricingOrdersError) throw error;
    throw new OwnerPricingOrdersError();
  } finally {
    apiKey = "";
  }
}

// The standalone/LINK V2 settle invocation: exact persisted identities and
// versions from the authoritative reconciliation read, with the local
// lifecycle fence read fresh immediately before the versioned CAS. A stale
// fence is a durable no-op inside `settle`, never a retry or a second GET.
export function createOrderV2SettlementHook(
  db: PrismaClient,
  settle: (input: SettlementInputV2) => Promise<unknown>,
): OrderV2SettlementHook {
  return async (persisted) => {
    if (!persisted.orderV2Id || !persisted.providerOrderUuid || !persisted.status) return;
    const fence = await db.orderV2.findFirst({
      where: { id: persisted.orderV2Id, ownerId: persisted.ownerId },
      select: { lifecycleVersion: true },
    });
    if (!fence) return;
    await settle({
      ownerId: persisted.ownerId,
      orderV2Id: persisted.orderV2Id,
      providerOrderId: persisted.id,
      providerOrderUuid: persisted.providerOrderUuid,
      observedProviderReconciliationVersion: persisted.reconciliationVersion,
      observedLocalLifecycleVersion: fence.lifecycleVersion,
      authoritativeProviderStatus: persisted.status,
    });
  };
}

let sharedProviderOrderStore: ProviderOrderStore | undefined;

export function getOwnerPricingOrdersService() {
  sharedProviderOrderStore ??= createPrismaProviderOrderStore(getDatabaseClient());
  return createOwnerPricingOrdersService(
    getNauttCredentialService(),
    getPricingOrdersAdapter(),
    sharedProviderOrderStore,
    () => new Date(),
    createOrderV2SettlementHook(getDatabaseClient(), (input) => getOrderV2Service().settle(input)),
  );
}
