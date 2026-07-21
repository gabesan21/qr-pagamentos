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
  };
}

function prismaStore(): NauttCatalogStore {
  const db = getDatabaseClient();
  return {
    async listCurrencyPairs() {
      return db.catalogCurrencyPair.findMany({ orderBy: { label: "asc" } });
    },
    async listPaymentMethods() {
      return db.catalogPaymentMethod.findMany({ orderBy: { label: "asc" } });
    },
    async createCurrencyPair(input) {
      return db.catalogCurrencyPair.create({ data: input });
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
      return db.catalogCurrencyPair.update({ where: { id }, data: { active } });
    },
    async setPaymentMethodActive(id, active) {
      return db.catalogPaymentMethod.update({ where: { id }, data: { active } });
    },
  };
}

export function getNauttCatalogService() {
  return createNauttCatalogService(prismaStore());
}
