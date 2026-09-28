import "server-only";

import { logProviderFailure, providerFailureOperations } from "../../observability/provider-failure-log";
import { loadNauttApiBaseUrl } from "./config";
import { isExactDecimal, isExactPositiveDecimal, isUuid } from "./decimal";

const DEFAULT_TIMEOUT_MS = 10_000;
const QUOTE_TTL_MS = 10 * 60 * 1000;
const MAX_MONEY_TOKEN_LENGTH = 128;
const MAX_MONEY_EXPONENT_MAGNITUDE = BigInt(128);
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

// Documented POST /pricing/panel/buy refusal codes (any non-200 with a
// parseable body): a deterministic diagnosis of the probed pair, never
// widened without new approved research. Every other status, an unparseable
// body, or a transport failure stays the plain `NauttPricingAdapterError`
// above, so every existing call site behaves byte for byte as today.
export const NAUTT_PRICING_REFUSAL_CODES = [
  "validation.invalid_parameters",
  "validation.currency_not_found",
  "validation.exchange_currency_not_found",
  "validation.no_valid_exchange_currency_for_operation",
  "validation.failed",
] as const;

export type NauttPricingRefusalCode = (typeof NAUTT_PRICING_REFUSAL_CODES)[number];

export class NauttPricingRefusedError extends NauttPricingAdapterError {
  readonly code: NauttPricingRefusalCode;
  constructor(code: NauttPricingRefusalCode) {
    super();
    this.name = "NauttPricingRefusedError";
    this.code = code;
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

// Documented POST /orders/onramp refusal codes (400/422 with a parseable
// body): a deterministic, terminal local outcome, never retried and never
// widened without a new approved research-backed entry.
export const NAUTT_ORDER_REFUSAL_CODES = [
  "order.quote_not_found",
  "order.quote_expired",
  "order.exchange_not_configured",
  "order.payment_method_not_available",
  "orders.deposit_bank_account_not_found",
  "order.deposit_fields_required",
  "order.deposit_fields_validation_failed",
] as const;

export type NauttOrderRefusalCode = (typeof NAUTT_ORDER_REFUSAL_CODES)[number];

export class NauttOrderRefusedError extends Error {
  readonly code: NauttOrderRefusalCode;
  constructor(code: NauttOrderRefusalCode) {
    super("Nautt order creation was refused");
    this.name = "NauttOrderRefusedError";
    this.code = code;
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
  readonly amount?: string;
  readonly amountUsd: string;
  readonly extraCost: string;
  readonly minDeposit: string;
  readonly price: string;
  readonly exchangeCurrencyUuid: string;
  readonly depositDelayMinutes: number;
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
  // `data.currency.symbol`: documented on onramp/offramp orders, absent by
  // design on crypto-kind orders (`get-order.md`); an order without a
  // `currency` object never fails parsing over this field alone.
  readonly currencySymbol?: string;
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

const numericJsonToken = Symbol("nautt pricing numeric JSON token");

type NumericJsonToken = Readonly<{
  readonly [numericJsonToken]: true;
  readonly source: string;
}>;

type JsonParseContext = Readonly<{ source: string }>;
type JsonWithRawNumber = typeof JSON & Readonly<{ rawJSON?: (text: string) => unknown }>;

function isNumericJsonToken(value: unknown): value is NumericJsonToken {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value as { readonly [numericJsonToken]?: unknown })[numericJsonToken] === true &&
    typeof (value as { readonly source?: unknown }).source === "string"
  );
}

function parseProviderJson(text: string): unknown {
  return JSON.parse(text, (_key, value, context?: JsonParseContext) => {
    if (typeof value !== "number") return value;
    if (!context || typeof context.source !== "string") return value;
    return { [numericJsonToken]: true, source: context.source } satisfies NumericJsonToken;
  });
}

function isBoundedMoneyToken(value: unknown): value is NumericJsonToken {
  if (!isNumericJsonToken(value) || value.source.length > MAX_MONEY_TOKEN_LENGTH) return false;
  const match = /^(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE]([+-]?\d+))?$/.exec(value.source);
  if (!match) return false;
  try {
    return match[1] === undefined || (BigInt(match[1]) <= MAX_MONEY_EXPONENT_MAGNITUDE && BigInt(match[1]) >= -MAX_MONEY_EXPONENT_MAGNITUDE);
  } catch {
    return false;
  }
}

function moneyLexeme(value: unknown): string | undefined {
  return isBoundedMoneyToken(value) ? value.source : undefined;
}

function nonNegativeSafeInteger(value: unknown): number | undefined {
  if (!isNumericJsonToken(value) || !/^(?:0|[1-9]\d*)$/.test(value.source)) return undefined;
  const parsed = Number(value.source);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

// The existing exact-decimal input contract deliberately accepts leading
// integer zeroes. JSON.rawJSON correctly rejects those non-JSON number
// lexemes, so normalize only this serialization boundary without converting
// or otherwise changing the submitted money value.
function normalizeExactDecimalForJsonNumber(value: string): string {
  const [integer, fraction] = value.split(".");
  const normalizedInteger = integer.replace(/^0+(?=\d)/, "");
  return fraction === undefined ? normalizedInteger : `${normalizedInteger}.${fraction}`;
}

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
  // `currency` is documented absent on crypto-kind orders (`get-order.md:22-31`);
  // when present it must be a strict object carrying a non-empty `symbol`, so a
  // malformed present `currency` still fails parsing like every other field.
  let currencySymbol: string | undefined;
  if (data.currency !== undefined) {
    if (!isPlainObject(data.currency) || typeof data.currency.symbol !== "string" || !data.currency.symbol.trim()) {
      throw new InvalidOrderPayloadError();
    }
    currencySymbol = data.currency.symbol;
  }
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
    currencySymbol?: string;
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
  if (currencySymbol) view.currencySymbol = currencySymbol;
  return view;
}

function parseQuoteRefusalCode(payload: unknown): NauttPricingRefusalCode | undefined {
  if (!isPlainObject(payload) || typeof payload.code !== "string") return undefined;
  return (NAUTT_PRICING_REFUSAL_CODES as readonly string[]).includes(payload.code)
    ? payload.code as NauttPricingRefusalCode
    : undefined;
}

function parseRefusalCode(payload: unknown): NauttOrderRefusalCode | undefined {
  if (!isPlainObject(payload) || typeof payload.code !== "string") return undefined;
  return (NAUTT_ORDER_REFUSAL_CODES as readonly string[]).includes(payload.code)
    ? (payload.code as NauttOrderRefusalCode)
    : undefined;
}

function parseQuoteSuccess(payload: unknown, requestedExchangeCurrencyUuid: string): Omit<NauttQuote, "expiresAt"> {
  if (!isPlainObject(payload) || !isPlainObject(payload.data)) throw new NauttPricingAdapterError();
  const data = payload.data;
  const amount = data.amount === undefined ? undefined : moneyLexeme(data.amount);
  const amountUsd = moneyLexeme(data.amount_usd);
  const extraCost = moneyLexeme(data.extra_cost);
  const minDeposit = moneyLexeme(data.min_deposit);
  const price = moneyLexeme(data.price);
  const depositDelayMinutes = nonNegativeSafeInteger(data.deposit_delay_minutes);
  if (
    (payload.success !== undefined && payload.success !== true) ||
    !isUuid(data.quote_uuid) ||
    !isUuid(data.exchange_currency_uuid) ||
    data.exchange_currency_uuid !== requestedExchangeCurrencyUuid ||
    (data.amount !== undefined && amount === undefined) ||
    amountUsd === undefined ||
    extraCost === undefined ||
    minDeposit === undefined ||
    price === undefined ||
    depositDelayMinutes === undefined
  ) {
    throw new NauttPricingAdapterError();
  }
  return {
    quoteUuid: data.quote_uuid,
    ...(amount === undefined ? {} : { amount }),
    amountUsd,
    extraCost,
    minDeposit,
    price,
    exchangeCurrencyUuid: data.exchange_currency_uuid,
    depositDelayMinutes,
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
        const rawJSON = (JSON as JsonWithRawNumber).rawJSON;
        if (!rawJSON) throw new TypeError("JSON.rawJSON is unavailable");
        body = serialize({
          currency_uuid: input.currencyUuid,
          exchange_currency_uuid: input.exchangeCurrencyUuid,
          [amountField]: rawJSON(normalizeExactDecimalForJsonNumber(input.amount.value)),
        });
      } catch {
        throw new NauttPricingAdapterError();
      }

      let response: Response;
      try {
        response = await fetch(`${loadNauttApiBaseUrl()}/pricing/panel/buy`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
          body,
          signal: createTimeoutSignal(DEFAULT_TIMEOUT_MS),
        });
      } catch {
        logProviderFailure(providerFailureOperations.quoteCreation, "transport_failure");
        throw new NauttPricingAdapterError();
      }

      if (response.status !== 200) {
        let refusalCode: NauttPricingRefusalCode | undefined;
        try {
          refusalCode = parseQuoteRefusalCode(parseProviderJson(await response.text()));
        } catch {
          refusalCode = undefined;
        }
        if (refusalCode) {
          // refusalCode already comes from the closed documented allowlist
          // (parseQuoteRefusalCode), so logging it verbatim never echoes a
          // raw provider-controlled string.
          logProviderFailure(providerFailureOperations.quoteCreation, response.status, refusalCode);
          throw new NauttPricingRefusedError(refusalCode);
        }
        logProviderFailure(providerFailureOperations.quoteCreation, response.status);
        throw new NauttPricingAdapterError();
      }

      try {
        const quote = parseQuoteSuccess(parseProviderJson(await response.text()), input.exchangeCurrencyUuid);
        const acceptedAt = now();
        return { ...quote, expiresAt: new Date(acceptedAt.getTime() + QUOTE_TTL_MS) };
      } catch (error) {
        logProviderFailure(providerFailureOperations.quoteCreation, response.status);
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
        logProviderFailure(providerFailureOperations.onrampOrderCreation, "transport_failure");
        throw new NauttOrderCreationIndeterminateError();
      }

      if (response.status === 400 || response.status === 422) {
        let refusalCode: NauttOrderRefusalCode | undefined;
        try {
          refusalCode = parseRefusalCode(await response.json());
        } catch {
          refusalCode = undefined;
        }
        if (refusalCode) {
          // refusalCode already comes from the closed documented allowlist
          // (parseRefusalCode), so logging it verbatim never echoes a raw
          // provider-controlled string.
          logProviderFailure(providerFailureOperations.onrampOrderCreation, response.status, refusalCode);
          throw new NauttOrderRefusedError(refusalCode);
        }
        logProviderFailure(providerFailureOperations.onrampOrderCreation, response.status);
        throw new NauttOrderCreationIndeterminateError();
      }

      if (response.status !== 201) {
        logProviderFailure(providerFailureOperations.onrampOrderCreation, response.status);
        throw new NauttOrderCreationIndeterminateError();
      }

      try {
        return parseOrderView(await response.json());
      } catch {
        logProviderFailure(providerFailureOperations.onrampOrderCreation, response.status);
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
        logProviderFailure(providerFailureOperations.orderRead, "transport_failure");
        throw new NauttOrderReadAdapterError();
      }

      if (response.status === 403 || response.status === 404) {
        logProviderFailure(providerFailureOperations.orderRead, response.status);
        throw new NauttOrderNotFoundError();
      }

      if (response.status !== 200) {
        logProviderFailure(providerFailureOperations.orderRead, response.status);
        throw new NauttOrderReadAdapterError();
      }

      try {
        return parseOrderView(await response.json());
      } catch {
        logProviderFailure(providerFailureOperations.orderRead, response.status);
        throw new NauttOrderReadAdapterError();
      }
    },
  };
}

export function getPricingOrdersAdapter() {
  return createPricingOrdersAdapter();
}
