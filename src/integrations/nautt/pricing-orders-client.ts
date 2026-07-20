import "server-only";

import { loadNauttApiBaseUrl } from "./config";
import { isExactDecimal, isExactPositiveDecimal, isUuid } from "./decimal";

const DEFAULT_TIMEOUT_MS = 10_000;
const QUOTE_TTL_MS = 5 * 60 * 1000;
const MAX_DEPOSIT_FIELDS = 32;
const MAX_DEPOSIT_FIELD_KEY_LENGTH = 128;
const MAX_DEPOSIT_FIELD_VALUE_LENGTH = 1024;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_ADDITIONAL_INFOS = 32;
const MAX_ADDITIONAL_INFO_KEY_LENGTH = 128;
const MAX_ADDITIONAL_INFO_VALUE_LENGTH = 1024;

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

export type NauttOnrampOrderOptions = {
  readonly depositFields?: Readonly<Record<string, string>>;
  readonly description?: string;
  readonly posUuid?: string;
  readonly additionalInfos?: readonly NauttAdditionalInfo[];
};

export type NauttOnrampOrderInput = NauttOnrampOrderOptions & {
  readonly apiKey: string;
  readonly quoteUuid: string;
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

class InvalidOrderPayloadError extends Error {}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function isValidDepositFields(value: unknown): value is Record<string, string> {
  if (!isPlainObject(value)) return false;
  const entries = Object.entries(value);
  return (
    entries.length <= MAX_DEPOSIT_FIELDS &&
    entries.every(
      ([key, fieldValue]) =>
        key.length >= 1 &&
        key.length <= MAX_DEPOSIT_FIELD_KEY_LENGTH &&
        typeof fieldValue === "string" &&
        fieldValue.length <= MAX_DEPOSIT_FIELD_VALUE_LENGTH,
    )
  );
}

function isValidAdditionalInfos(value: unknown): value is readonly NauttAdditionalInfo[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_ADDITIONAL_INFOS &&
    value.every(
      (item) =>
        isPlainObject(item) &&
        typeof item.key === "string" &&
        item.key.length >= 1 &&
        item.key.length <= MAX_ADDITIONAL_INFO_KEY_LENGTH &&
        typeof item.value === "string" &&
        item.value.length <= MAX_ADDITIONAL_INFO_VALUE_LENGTH,
    )
  );
}

export function isValidOnrampOrderOptions(input: NauttOnrampOrderOptions): boolean {
  if (input.depositFields !== undefined && !isValidDepositFields(input.depositFields)) return false;
  if (
    input.description !== undefined &&
    (typeof input.description !== "string" || input.description.length > MAX_DESCRIPTION_LENGTH)
  ) {
    return false;
  }
  if (input.posUuid !== undefined && !isUuid(input.posUuid)) return false;
  if (input.additionalInfos !== undefined && !isValidAdditionalInfos(input.additionalInfos)) return false;
  return true;
}

function parseOrderView(payload: unknown): NauttOrderView {
  if (!isPlainObject(payload) || !isPlainObject(payload.data)) throw new InvalidOrderPayloadError();
  const data = payload.data;
  if (
    !isUuid(data.uuid) ||
    typeof data.status !== "string" ||
    !(NAUTT_ORDER_STATUSES as readonly string[]).includes(data.status) ||
    !isExactDecimal(data.fiat_amount) ||
    !isExactDecimal(data.crypto_amount) ||
    !isExactDecimal(data.nautt_quote) ||
    typeof data.expire_at !== "string" ||
    !isPlainObject(data.payment_data) ||
    typeof data.payment_data.payment_method !== "string" ||
    !data.payment_data.payment_method.trim()
  ) {
    throw new InvalidOrderPayloadError();
  }
  const expiresAt = new Date(data.expire_at);
  if (Number.isNaN(expiresAt.getTime())) throw new InvalidOrderPayloadError();
  const view: {
    orderUuid: string;
    status: NauttOrderStatus;
    fiatAmount: string;
    cryptoAmount: string;
    nauttQuote: string;
    expiresAt: Date;
    paymentMethod: string;
    pixCopyPaste?: string;
    pixQrcodeUrl?: string;
  } = {
    orderUuid: data.uuid,
    status: data.status as NauttOrderStatus,
    fiatAmount: data.fiat_amount,
    cryptoAmount: data.crypto_amount,
    nauttQuote: data.nautt_quote,
    expiresAt,
    paymentMethod: data.payment_data.payment_method,
  };
  const pixCopyPaste = nonEmptyString(data.payment_data.pix_qrcode) ?? nonEmptyString(data.payment_data.qrcode);
  if (pixCopyPaste) view.pixCopyPaste = pixCopyPaste;
  const pixQrcodeUrl = nonEmptyString(data.payment_data.pix_qrcode_url);
  if (pixQrcodeUrl) view.pixQrcodeUrl = pixQrcodeUrl;
  return view;
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
        const response = await fetch(`${loadNauttApiBaseUrl()}/pricing/panel/buy`, {
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

    async createOnrampOrder(input: NauttOnrampOrderInput): Promise<NauttOrderView> {
      const apiKey = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
      if (!apiKey || !isUuid(input.quoteUuid) || !isValidOnrampOrderOptions(input)) {
        throw new NauttOrderValidationError();
      }

      const requestRecord: Record<string, unknown> = { quote_uuid: input.quoteUuid };
      if (input.depositFields !== undefined) requestRecord.deposit_fields = { ...input.depositFields };
      if (input.description !== undefined) requestRecord.description = input.description;
      if (input.posUuid !== undefined) requestRecord.pos_uuid = input.posUuid;
      if (input.additionalInfos !== undefined) {
        requestRecord.additional_infos = input.additionalInfos.map((info) => ({ key: info.key, value: info.value }));
      }

      let body: string;
      try {
        body = serialize(requestRecord);
      } catch {
        throw new NauttOrderValidationError();
      }

      let response: Response;
      try {
        response = await fetch(`${loadNauttApiBaseUrl()}/orders/onramp`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
          body,
          signal: createTimeoutSignal(DEFAULT_TIMEOUT_MS),
        });
      } catch {
        throw new NauttOrderCreationIndeterminateError();
      }

      try {
        if (response.status !== 201) throw new NauttOrderCreationIndeterminateError();
        return parseOrderView(await response.json());
      } catch (error) {
        if (error instanceof NauttOrderCreationIndeterminateError) throw error;
        throw new NauttOrderCreationIndeterminateError();
      }
    },

    async getOrder(input: { apiKey: string; orderUuid: string }): Promise<NauttOrderView> {
      const apiKey = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
      if (!apiKey || !isUuid(input.orderUuid)) throw new NauttOrderValidationError();

      let response: Response;
      try {
        response = await fetch(`${loadNauttApiBaseUrl()}/orders/${input.orderUuid}`, {
          method: "GET",
          headers: { "X-API-Key": apiKey },
          signal: createTimeoutSignal(DEFAULT_TIMEOUT_MS),
        });
      } catch {
        throw new NauttOrderReadAdapterError();
      }

      if (response.status === 403 || response.status === 404) throw new NauttOrderNotFoundError();

      try {
        if (response.status !== 200) throw new NauttOrderReadAdapterError();
        return parseOrderView(await response.json());
      } catch (error) {
        if (error instanceof NauttOrderReadAdapterError) throw error;
        throw new NauttOrderReadAdapterError();
      }
    },
  };
}

export function getPricingOrdersAdapter() {
  return createPricingOrdersAdapter();
}
