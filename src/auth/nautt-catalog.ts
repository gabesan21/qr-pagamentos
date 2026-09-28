import { getDatabaseClient } from "../db/client";
import { ForbiddenError, type Principal } from "./authorization";

export type CatalogCurrencyPair = {
  id: string;
  label: string;
  currencyUuid: string;
  exchangeCurrencyUuid: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  currencyCode?: string;
  isDefault?: boolean;
};

export type CatalogPaymentMethod = {
  id: string;
  label: string;
  paymentMethodUuid: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type CatalogInput = {
  label: string;
  currencyUuid: string;
  exchangeCurrencyUuid: string;
} | {
  label: string;
  paymentMethodUuid: string;
};

export class NauttCatalogValidationError extends Error {}
export class NauttCatalogExchangeCurrencyConflictError extends Error {}
export class NauttCatalogDefaultMethodError extends Error {}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireAdmin(actor: Principal) {
  if (actor.role !== "ADMIN" || actor.status !== "ACTIVE") throw new ForbiddenError("Administrator access is required");
}

function validateUuid(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new NauttCatalogValidationError(`${label} is required`);
  if (!UUID_PATTERN.test(value)) throw new NauttCatalogValidationError(`${label} must be a valid UUID`);
  return value.toLowerCase();
}

function validateLabel(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") throw new NauttCatalogValidationError("Label is required");
  if (value.length > 128) throw new NauttCatalogValidationError("Label must be 128 characters or less");
  return value.trim();
}

export type NauttCatalogStore = {
  listCurrencyPairs(): Promise<CatalogCurrencyPair[]>;
  listPaymentMethods(): Promise<CatalogPaymentMethod[]>;
  createCurrencyPair(input: { label: string; currencyUuid: string; exchangeCurrencyUuid: string }): Promise<CatalogCurrencyPair>;
  createPaymentMethod(input: { label: string; paymentMethodUuid: string }): Promise<CatalogPaymentMethod>;
  updateCurrencyPair(id: string, label: string): Promise<CatalogCurrencyPair>;
  updatePaymentMethod(id: string, label: string): Promise<CatalogPaymentMethod>;
  setCurrencyPairActive(id: string, active: boolean): Promise<CatalogCurrencyPair>;
  setPaymentMethodActive(id: string, active: boolean): Promise<CatalogPaymentMethod>;
  createCurrencyMethod(input: { label: string; currencyCode: string; exchangeCurrencyUuid: string }): Promise<CatalogCurrencyPair>;
  setDefaultCurrencyMethod(currencyCode: string, pairId: string): Promise<void>;
};

export function createNauttCatalogService(store: NauttCatalogStore) {
  return {
    async listCurrencyPairs(actor: Principal) {
      requireAdmin(actor);
      return store.listCurrencyPairs();
    },
    async listPaymentMethods(actor: Principal) {
      requireAdmin(actor);
      return store.listPaymentMethods();
    },
    async createCurrencyPair(actor: Principal, input: { label: unknown; currencyUuid: unknown; exchangeCurrencyUuid: unknown }) {
      requireAdmin(actor);
      return store.createCurrencyPair({
        label: validateLabel(input.label),
        currencyUuid: validateUuid(input.currencyUuid, "Currency UUID"),
        exchangeCurrencyUuid: validateUuid(input.exchangeCurrencyUuid, "Exchange currency UUID"),
      });
    },
    async createPaymentMethod(actor: Principal, input: { label: unknown; paymentMethodUuid: unknown }) {
      requireAdmin(actor);
      return store.createPaymentMethod({
        label: validateLabel(input.label),
        paymentMethodUuid: validateUuid(input.paymentMethodUuid, "Payment method UUID"),
      });
    },
    async updateCurrencyPair(actor: Principal, id: unknown, label: unknown) {
      requireAdmin(actor);
      return store.updateCurrencyPair(validateUuid(id, "Identifier"), validateLabel(label));
    },
    async updatePaymentMethod(actor: Principal, id: unknown, label: unknown) {
      requireAdmin(actor);
      return store.updatePaymentMethod(validateUuid(id, "Identifier"), validateLabel(label));
    },
    async setCurrencyPairActive(actor: Principal, id: unknown, active: unknown) {
      requireAdmin(actor);
      return store.setCurrencyPairActive(validateUuid(id, "Identifier"), active === true || active === "true");
    },
    async setPaymentMethodActive(actor: Principal, id: unknown, active: unknown) {
      requireAdmin(actor);
      return store.setPaymentMethodActive(validateUuid(id, "Identifier"), active === true || active === "true");
    },
    async createCurrencyMethod(actor: Principal, input: { label: unknown; currencyCode: unknown; exchangeCurrencyUuid: unknown }) {
      requireAdmin(actor);
      if (typeof input.currencyCode !== "string" || !/^[A-Z]{3}$/.test(input.currencyCode)) throw new NauttCatalogValidationError("Currency code is invalid");
      return store.createCurrencyMethod({
        label: validateLabel(input.label),
        currencyCode: input.currencyCode,
        exchangeCurrencyUuid: validateUuid(input.exchangeCurrencyUuid, "Exchange currency UUID"),
      });
    },
    async setDefaultCurrencyMethod(actor: Principal, currencyCode: unknown, pairId: unknown) {
      requireAdmin(actor);
      if (typeof currencyCode !== "string" || !/^[A-Z]{3}$/.test(currencyCode)) throw new NauttCatalogValidationError("Currency code is invalid");
      await store.setDefaultCurrencyMethod(currencyCode, validateUuid(pairId, "Identifier"));
    },
  };
}

export function createDatabaseNauttCatalogStore(db: ReturnType<typeof getDatabaseClient>): NauttCatalogStore {
  return {
    async listCurrencyPairs() {
      const [pairs, pointers] = await Promise.all([
        db.catalogCurrencyPair.findMany({ orderBy: { label: "asc" } }),
        db.supportedExchangeCurrency.findMany({ select: { code: true, pairId: true, pair: { select: { currencyUuid: true } } } }),
      ]);
      const codeByCurrencyUuid = new Map(pointers.map((pointer) => [pointer.pair.currencyUuid, pointer.code]));
      const defaultPairIds = new Set(pointers.map((pointer) => pointer.pairId));
      return pairs.map((pair) => ({ ...pair, currencyCode: codeByCurrencyUuid.get(pair.currencyUuid), isDefault: defaultPairIds.has(pair.id) }));
    },
    async listPaymentMethods() {
      return db.catalogPaymentMethod.findMany({ orderBy: { label: "asc" } });
    },
    async createCurrencyPair(input) {
      return db.$transaction(async (transaction) => {
        const conflict = await transaction.catalogCurrencyPair.findFirst({
          where: { exchangeCurrencyUuid: input.exchangeCurrencyUuid, NOT: { currencyUuid: input.currencyUuid } }, select: { id: true },
        });
        if (conflict) throw new NauttCatalogExchangeCurrencyConflictError("Exchange currency belongs to another currency");
        return transaction.catalogCurrencyPair.create({ data: input });
      }, { isolationLevel: "Serializable" });
    },
    async createPaymentMethod(input) {
      return db.catalogPaymentMethod.create({ data: input });
    },
    async updateCurrencyPair(id, label) {
      return db.catalogCurrencyPair.update({ where: { id }, data: { label } });
    },
    async updatePaymentMethod(id, label) {
      return db.catalogPaymentMethod.update({ where: { id }, data: { label } });
    },
    async setCurrencyPairActive(id, active) {
      return db.$transaction(async (transaction) => {
        if (!active) {
          const pointer = await transaction.supportedExchangeCurrency.findFirst({ where: { pairId: id }, select: { code: true } });
          if (pointer) throw new NauttCatalogDefaultMethodError("Deactivate the currency or choose another default method first");
        }
        return transaction.catalogCurrencyPair.update({ where: { id }, data: { active } });
      }, { isolationLevel: "Serializable" });
    },
    async setPaymentMethodActive(id, active) {
      return db.catalogPaymentMethod.update({ where: { id }, data: { active } });
    },
    async createCurrencyMethod(input) {
      return db.$transaction(async (transaction) => {
        const pointer = await transaction.supportedExchangeCurrency.findUnique({
          where: { code: input.currencyCode },
          select: { pair: { select: { currencyUuid: true } } },
        });
        if (!pointer) throw new NauttCatalogValidationError("Currency is not registered");
        const conflict = await transaction.catalogCurrencyPair.findFirst({
          where: { exchangeCurrencyUuid: input.exchangeCurrencyUuid, NOT: { currencyUuid: pointer.pair.currencyUuid } },
          select: { id: true },
        });
        if (conflict) throw new NauttCatalogExchangeCurrencyConflictError("Exchange currency belongs to another currency");
        return transaction.catalogCurrencyPair.create({ data: {
          label: input.label,
          currencyUuid: pointer.pair.currencyUuid,
          exchangeCurrencyUuid: input.exchangeCurrencyUuid,
        } });
      }, { isolationLevel: "Serializable" });
    },
    async setDefaultCurrencyMethod(currencyCode, pairId) {
      await db.$transaction(async (transaction) => {
        const [pointer, pair] = await Promise.all([
          transaction.supportedExchangeCurrency.findUnique({ where: { code: currencyCode }, select: { pair: { select: { currencyUuid: true } } } }),
          transaction.catalogCurrencyPair.findUnique({ where: { id: pairId }, select: { active: true, currencyUuid: true } }),
        ]);
        if (!pointer || !pair || !pair.active || pair.currencyUuid !== pointer.pair.currencyUuid) throw new NauttCatalogDefaultMethodError("Method is not active for this currency");
        await transaction.supportedExchangeCurrency.update({ where: { code: currencyCode }, data: { pairId } });
      }, { isolationLevel: "Serializable" });
    },
  };
}

export function getNauttCatalogService() {
  return createNauttCatalogService(createDatabaseNauttCatalogStore(getDatabaseClient()));
}
