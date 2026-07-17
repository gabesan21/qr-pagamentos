import "server-only";

import { isExactDecimal, isExactPositiveDecimal, isUuid } from "./decimal";

const PRODUCTION_BASE_URL = "https://api.nauttfinance.com/api/v2";
const DEFAULT_TIMEOUT_MS = 10_000;
const QUOTE_TTL_MS = 5 * 60 * 1000;

export const NAUTT_ORDER_STATUSES = [
  "new",
  "processing",
  "paid",
  "finished",
  "rejected",
  "canceled",
  "refunded",
  "expired",
] as const;

export type NauttOrderStatus = (typeof NAUTT_ORDER_STATUSES)[number];

export class NauttPricingAdapterError extends Error {
  constructor() {
    super("Nautt pricing failed");
    this.name = "NauttPricingAdapterError";
  }
}

export class NauttOrderValidationError extends Error {
  constructor() {
    super("Nautt order input is invalid");
    this.name = "NauttOrderValidationError";
  }
}

export class NauttOrderCreationIndeterminateError extends Error {
  constructor() {
    super("Nautt order creation is indeterminate");
    this.name = "NauttOrderCreationIndeterminateError";
  }
}

export class NauttOrderReadAdapterError extends Error {
  constructor() {
    super("Nautt order read failed");
    this.name = "NauttOrderReadAdapterError";
  }
}

export class NauttOrderNotFoundError extends Error {
  constructor() {
    super("Nautt order is not available");
    this.name = "NauttOrderNotFoundError";
  }
}

export type NauttQuoteAmount = { readonly kind: "fiat" | "usdt"; readonly value: string };

export type NauttQuote = {
  readonly quoteUuid: string;
  readonly amount: string;
  readonly finalAmount: string;
  readonly clientAmount: string;
  readonly profit: string;
  readonly exchangeFee: string;
  readonly minWithdrawal: string;
  readonly withdrawalDelayMinutes: number;
  readonly basePrice: string;
  readonly price: string;
  readonly expiresAt: Date;
};

export type NauttAdditionalInfo = { readonly key: string; readonly value: string };

export type NauttOnrampOrderInput = {
  readonly apiKey: string;
  readonly quoteUuid: string;
  readonly depositFields?: Readonly<Record<string, string>>;
  readonly description?: string;
  readonly posUuid?: string;
  readonly additionalInfos?: readonly NauttAdditionalInfo[];
};

export type NauttOrderView = {
  readonly orderUuid: string;
  readonly status: NauttOrderStatus;
  readonly fiatAmount: string;
  readonly cryptoAmount: string;
  readonly nauttQuote: string;
  readonly expiresAt: Date;
  readonly paymentMethod: string;
  readonly pixCopyPaste?: string;
  readonly pixQrcodeUrl?: string;
};

type AdapterDependencies = {
  fetch?: typeof globalThis.fetch;
  createTimeoutSignal?: (timeoutMs: number) => AbortSignal;
  serialize?: (value: unknown) => string;
  now?: () => Date;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseQuoteSuccess(payload: unknown): Omit<NauttQuote, "expiresAt"> {
  if (!isPlainObject(payload) || !isPlainObject(payload.data)) throw new NauttPricingAdapterError();
  const data = payload.data;
  if (
    !isUuid(data.quote_uuid) ||
    !isExactDecimal(data.amount) ||
    !isExactDecimal(data.final_amount) ||
    !isExactDecimal(data.client_amount) ||
    !isExactDecimal(data.profit) ||
    !isExactDecimal(data.exchange_fee) ||
    !isExactDecimal(data.min_withdrawal) ||
    !isExactDecimal(data.base_price) ||
    !isExactDecimal(data.price) ||
    typeof data.withdrawal_delay_minutes !== "number" ||
    !Number.isSafeInteger(data.withdrawal_delay_minutes) ||
    data.withdrawal_delay_minutes < 0
  ) {
    throw new NauttPricingAdapterError();
  }
  return {
    quoteUuid: data.quote_uuid,
    amount: data.amount,
    finalAmount: data.final_amount,
    clientAmount: data.client_amount,
    profit: data.profit,
    exchangeFee: data.exchange_fee,
    minWithdrawal: data.min_withdrawal,
    withdrawalDelayMinutes: data.withdrawal_delay_minutes,
    basePrice: data.base_price,
    price: data.price,
  };
}

export function createPricingOrdersAdapter(dependencies: AdapterDependencies = {}) {
  const fetch = dependencies.fetch ?? globalThis.fetch;
  const createTimeoutSignal = dependencies.createTimeoutSignal ?? AbortSignal.timeout;
  const serialize = dependencies.serialize ?? JSON.stringify;
  const now = dependencies.now ?? (() => new Date());

  return {
    async createQuote(input: {
      apiKey: string;
      currencyUuid: string;
      exchangeCurrencyUuid: string;
      amount: NauttQuoteAmount;
    }): Promise<NauttQuote> {
      const apiKey = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
      if (
        !apiKey ||
        !isUuid(input.currencyUuid) ||
        !isUuid(input.exchangeCurrencyUuid) ||
        !isPlainObject(input.amount) ||
        (input.amount.kind !== "fiat" && input.amount.kind !== "usdt") ||
        !isExactPositiveDecimal(input.amount.value)
      ) {
        throw new NauttPricingAdapterError();
      }

      const amountField = input.amount.kind === "fiat" ? "amount" : "amount_usd";
      let body: string;
      try {
        body = serialize({
          currency_uuid: input.currencyUuid,
          exchange_currency_uuid: input.exchangeCurrencyUuid,
          [amountField]: input.amount.value,
        });
      } catch {
        throw new NauttPricingAdapterError();
      }

      try {
        const response = await fetch(`${PRODUCTION_BASE_URL}/pricing/panel/buy`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
          body,
          signal: createTimeoutSignal(DEFAULT_TIMEOUT_MS),
        });
        if (response.status !== 200) throw new NauttPricingAdapterError();
        const quote = parseQuoteSuccess(await response.json());
        const acceptedAt = now();
        return { ...quote, expiresAt: new Date(acceptedAt.getTime() + QUOTE_TTL_MS) };
      } catch (error) {
        if (error instanceof NauttPricingAdapterError) throw error;
        throw new NauttPricingAdapterError();
      }
    },
  };
}

export function getPricingOrdersAdapter() {
  return createPricingOrdersAdapter();
}
