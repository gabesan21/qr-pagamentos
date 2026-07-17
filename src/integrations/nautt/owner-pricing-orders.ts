import "server-only";

import { getNauttCredentialService } from "../../auth/nautt-credential";

import { isExactPositiveDecimal, isUuid } from "./decimal";
import {
  getPricingOrdersAdapter,
  isValidOnrampOrderOptions,
  type NauttOnrampOrderInput,
  type NauttOnrampOrderOptions,
  type NauttOrderView,
  type NauttQuote,
  type NauttQuoteAmount,
} from "./pricing-orders-client";
import { createInMemoryQuoteOwnershipStore, type QuoteOwnershipStore } from "./quote-ownership";

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
  quoteStore: QuoteOwnershipStore,
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
          registered = await quoteStore.register({
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

      let claim: Awaited<ReturnType<QuoteOwnershipStore["claimForCreation"]>>;
      try {
        claim = await quoteStore.claimForCreation({ quoteUuid: quoteReference.quoteUuid, ownerId, now: now() });
      } catch {
        throw new OwnerPricingOrdersError();
      }
      if (claim !== "claimed") throw new OwnerPricingOrdersError();

      let apiKey: string;
      try {
        apiKey = await credentialPort.getDecryptedApiKey(ownerId);
      } catch {
        throw new OwnerPricingOrdersError();
      }

      try {
        return await adapter.createOnrampOrder({ apiKey, quoteUuid: quoteReference.quoteUuid, ...input });
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
  };
}

const sharedQuoteOwnershipStore = createInMemoryQuoteOwnershipStore();

export function getOwnerPricingOrdersService() {
  return createOwnerPricingOrdersService(getNauttCredentialService(), getPricingOrdersAdapter(), sharedQuoteOwnershipStore);
}
