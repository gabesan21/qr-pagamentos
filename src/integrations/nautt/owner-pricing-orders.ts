import "server-only";

import { getNauttCredentialService } from "../../auth/nautt-credential";
import { getDatabaseClient } from "../../db/client";

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
import { createPrismaProviderOrderStore, storedOrderView, type ProviderOrderStore } from "./provider-order-store";

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

export function createOwnerPricingOrdersService(
  credentialPort: OwnerNauttCredentialPort,
  adapter: PricingOrdersAdapter,
  orderStore: ProviderOrderStore,
  now: () => Date = () => new Date(),
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
    ): Promise<NauttOrderView> {
      if (
        !isUuid(ownerId) ||
        !isPlainObject(quoteReference) ||
        !isUuid(quoteReference.quoteUuid) ||
        !isPlainObject(input) ||
        !isValidOnrampOrderOptions(input)
      ) {
        throw new OwnerPricingOrdersError();
      }

      let claim: Awaited<ReturnType<ProviderOrderStore["claimForCreation"]>>;
      try {
        claim = await orderStore.claimForCreation({ quoteUuid: quoteReference.quoteUuid, ownerId, now: now(), paymentLinkOrderId });
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
      await reconcileObserved(observed, credentialPort, adapter, orderStore);
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

  return reconcileObserved(observed, credentialPort, adapter, orderStore);
}

async function reconcileObserved(
  observed: NonNullable<Awaited<ReturnType<ProviderOrderStore["findPollable"]>>>,
  credentialPort: OwnerNauttCredentialPort,
  adapter: PricingOrdersAdapter,
  orderStore: ProviderOrderStore,
): Promise<NauttOrderView> {
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
    return storedOrderView(await orderStore.reconcile(observed, fetched));
  } catch (error) {
    if (error instanceof OwnerPricingOrdersError) throw error;
    throw new OwnerPricingOrdersError();
  } finally {
    apiKey = "";
  }
}

let sharedProviderOrderStore: ProviderOrderStore | undefined;

export function getOwnerPricingOrdersService() {
  sharedProviderOrderStore ??= createPrismaProviderOrderStore(getDatabaseClient());
  return createOwnerPricingOrdersService(getNauttCredentialService(), getPricingOrdersAdapter(), sharedProviderOrderStore);
}
