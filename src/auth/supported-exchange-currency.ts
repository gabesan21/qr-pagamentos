import { getDatabaseClient } from "../db/client";
import type { Prisma } from "../generated/prisma/client";
import { ForbiddenError, requireUserPrincipal, type Principal } from "./authorization";

export type ExchangeCurrencyChoice = {
  code: string;
  label: string;
};

export type ResolvedExchangeCurrencyPair = {
  code: string;
  label: string;
  currencyUuid: string;
  exchangeCurrencyUuid: string;
};

export type ExchangeCurrencyMappingValues = {
  code: string;
  label: string;
  currencyUuid: string;
  exchangeCurrencyUuid: string;
};

export type ExchangeCurrencyDefaultResolution =
  | { status: "available"; choice: ExchangeCurrencyChoice }
  | { status: "unavailable" };

export class ExchangeCurrencyValidationError extends Error {}
export class ExchangeCurrencyCodeConflictError extends Error {}
export class ExchangeCurrencyDuplicatePairError extends Error {}
export class NoActiveExchangeCurrencyMappingError extends Error {}

export const DEFAULT_EXCHANGE_CURRENCY_CODE = "BRL";

export type RegisterMappingOutcome = "registered" | "code-active" | "pair-exists";
export type ReplaceMappingOutcome = "inserted" | "repointed";

export type SupportedExchangeCurrencyStore = {
  listActive(): Promise<ExchangeCurrencyChoice[]>;
  findActivePair(code: string): Promise<ResolvedExchangeCurrencyPair | null>;
  register(values: ExchangeCurrencyMappingValues): Promise<RegisterMappingOutcome>;
  replace(values: ExchangeCurrencyMappingValues): Promise<ReplaceMappingOutcome>;
  deactivate(code: string): Promise<void>;
};

const CODE_PATTERN = /^[A-Z]{3}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireAdmin(actor: Principal) {
  if (actor.role !== "ADMIN" || actor.status !== "ACTIVE") throw new ForbiddenError("Administrator access is required");
}

function validateCode(value: unknown): string {
  if (typeof value !== "string" || !CODE_PATTERN.test(value)) {
    throw new ExchangeCurrencyValidationError("Currency code must be an uppercase ISO 4217 alphabetic code");
  }
  return value;
}

function validateUuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new ExchangeCurrencyValidationError(`${field} is invalid`);
  }
  return value.toLowerCase();
}

function validateLabel(value: unknown): string {
  if (typeof value !== "string") throw new ExchangeCurrencyValidationError("Label is required");
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new ExchangeCurrencyValidationError("Label is required");
  if (trimmed.length > 128) throw new ExchangeCurrencyValidationError("Label must be 128 characters or less");
  return trimmed;
}

function validateMapping(input: Record<keyof ExchangeCurrencyMappingValues, unknown>): ExchangeCurrencyMappingValues {
  return {
    code: validateCode(input.code),
    label: validateLabel(input.label),
    currencyUuid: validateUuid(input.currencyUuid, "Currency UUID"),
    exchangeCurrencyUuid: validateUuid(input.exchangeCurrencyUuid, "Exchange currency UUID"),
  };
}

export function createSupportedExchangeCurrencyService(store: SupportedExchangeCurrencyStore) {
  return {
    async register(actor: Principal, input: Record<keyof ExchangeCurrencyMappingValues, unknown>) {
      requireAdmin(actor);
      const outcome = await store.register(validateMapping(input));
      if (outcome === "code-active") throw new ExchangeCurrencyCodeConflictError("Currency code already has an active mapping");
      if (outcome === "pair-exists") throw new ExchangeCurrencyDuplicatePairError("Currency pair is already registered");
    },
    async replace(actor: Principal, input: Record<keyof ExchangeCurrencyMappingValues, unknown>) {
      requireAdmin(actor);
      await store.replace(validateMapping(input));
    },
    async deactivate(actor: Principal, code: unknown) {
      requireAdmin(actor);
      await store.deactivate(validateCode(code));
    },
    async listActiveChoices(actor: Principal) {
      requireUserPrincipal(actor);
      return store.listActive();
    },
    async resolveDefaultChoice(actor: Principal): Promise<ExchangeCurrencyDefaultResolution> {
      requireUserPrincipal(actor);
      const pair = await store.findActivePair(DEFAULT_EXCHANGE_CURRENCY_CODE);
      if (!pair) return { status: "unavailable" };
      return { status: "available", choice: { code: pair.code, label: pair.label } };
    },
    // Server-side gating primitives for dependent backends (store defaults, product
    // currency); never wired to a public or sessionless route.
    async requireActivePair(code: unknown): Promise<ResolvedExchangeCurrencyPair> {
      const pair = await store.findActivePair(validateCode(code));
      if (!pair) throw new NoActiveExchangeCurrencyMappingError("No active exchange currency mapping");
      return pair;
    },
    async requireDefaultPair(): Promise<ResolvedExchangeCurrencyPair> {
      return this.requireActivePair(DEFAULT_EXCHANGE_CURRENCY_CODE);
    },
  };
}

function hasDatabaseConflict(error: unknown) {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  if (error.code === "P2002" || error.code === "P2034" || error.code === "40001" || error.code === "40P01") {
    return true;
  }
  if (error.code !== "P2010" || !("meta" in error) || typeof error.meta !== "object" || error.meta === null) {
    return false;
  }
  if ("code" in error.meta && (error.meta.code === "40001" || error.meta.code === "40P01")) return true;
  if (!("driverAdapterError" in error.meta)
    || typeof error.meta.driverAdapterError !== "object"
    || error.meta.driverAdapterError === null
    || !("cause" in error.meta.driverAdapterError)
    || typeof error.meta.driverAdapterError.cause !== "object"
    || error.meta.driverAdapterError.cause === null
    || !("originalCode" in error.meta.driverAdapterError.cause)) {
    return false;
  }
  return error.meta.driverAdapterError.cause.originalCode === "40001"
    || error.meta.driverAdapterError.cause.originalCode === "40P01";
}

function pairWhere(values: ExchangeCurrencyMappingValues) {
  return {
    currencyUuid_exchangeCurrencyUuid: {
      currencyUuid: values.currencyUuid,
      exchangeCurrencyUuid: values.exchangeCurrencyUuid,
    },
  };
}

export function createDatabaseSupportedExchangeCurrencyStore(
  db: ReturnType<typeof getDatabaseClient>,
): SupportedExchangeCurrencyStore {
  return {
    async listActive() {
      const rows = await db.supportedExchangeCurrency.findMany({
        orderBy: { code: "asc" },
        select: { code: true, pair: { select: { label: true } } },
      });
      return rows.map((row) => ({ code: row.code, label: row.pair.label }));
    },
    async findActivePair(code) {
      const row = await db.supportedExchangeCurrency.findUnique({
        where: { code },
        select: { code: true, pair: { select: { label: true, currencyUuid: true, exchangeCurrencyUuid: true } } },
      });
      if (!row) return null;
      return {
        code: row.code,
        label: row.pair.label,
        currencyUuid: row.pair.currencyUuid,
        exchangeCurrencyUuid: row.pair.exchangeCurrencyUuid,
      };
    },
    async register(values) {
      try {
        return await db.$transaction(async (transaction) => {
          const existingPair = await transaction.catalogCurrencyPair.findUnique({
            where: pairWhere(values),
            select: { id: true },
          });
          if (existingPair) return "pair-exists";
          const existingPointer = await transaction.supportedExchangeCurrency.findUnique({
            where: { code: values.code },
            select: { code: true },
          });
          if (existingPointer) return "code-active";
          const pair = await transaction.catalogCurrencyPair.create({
            data: { label: values.label, currencyUuid: values.currencyUuid, exchangeCurrencyUuid: values.exchangeCurrencyUuid },
            select: { id: true },
          });
          await transaction.supportedExchangeCurrency.create({ data: { code: values.code, pairId: pair.id } });
          return "registered";
        }, { isolationLevel: "Serializable" });
      } catch (error) {
        // A concurrent registration of the same pair or code must surface as one typed
        // conflict, never as a leaked constraint error or a second pair row.
        if (hasDatabaseConflict(error)) return "pair-exists";
        throw error;
      }
    },
    async replace(values) {
      const movePointer = async (transaction: Prisma.TransactionClient) => {
        let outcome: ReplaceMappingOutcome = "repointed";
        let pair = await transaction.catalogCurrencyPair.findUnique({
          where: pairWhere(values),
          select: { id: true },
        });
        if (!pair) {
          pair = await transaction.catalogCurrencyPair.create({
            data: { label: values.label, currencyUuid: values.currencyUuid, exchangeCurrencyUuid: values.exchangeCurrencyUuid },
            select: { id: true },
          });
          outcome = "inserted";
        }
        await transaction.supportedExchangeCurrency.upsert({
          where: { code: values.code },
          create: { code: values.code, pairId: pair.id },
          update: { pairId: pair.id },
        });
        return outcome;
      };
      try {
        return await db.$transaction(movePointer, { isolationLevel: "Serializable" });
      } catch (error) {
        if (!hasDatabaseConflict(error)) throw error;
        // A concurrent registration won the pair insert; re-point to that retained row.
        return await db.$transaction(movePointer, { isolationLevel: "Serializable" });
      }
    },
    async deactivate(code) {
      await db.supportedExchangeCurrency.deleteMany({ where: { code } });
    },
  };
}

export function getSupportedExchangeCurrencyService() {
  return createSupportedExchangeCurrencyService(createDatabaseSupportedExchangeCurrencyStore(getDatabaseClient()));
}
