import { getDatabaseClient } from "../db/client";
import { ForbiddenError, type Principal } from "./authorization";

export const SUPPORTED_CURRENCIES = ["BRL"] as const;
export const SUPPORTED_PAYMENT_METHODS = ["PIX"] as const;

export type GlobalPaymentSettings = {
  currencies: string[];
  paymentMethods: string[];
};

export type PaymentSettingsStore = {
  get(): Promise<GlobalPaymentSettings>;
  update(settings: GlobalPaymentSettings): Promise<void>;
};

export class PaymentSettingsValidationError extends Error {}

function requireAdmin(actor: Principal) {
  if (actor.role !== "ADMIN" || actor.status !== "ACTIVE") throw new ForbiddenError("Administrator access is required");
}

function validate(values: string[], allowed: readonly string[], label: string) {
  if (values.some((value) => !allowed.includes(value))) throw new PaymentSettingsValidationError(`Invalid ${label}`);
  return [...new Set(values)];
}

export function createPaymentSettingsService(store: PaymentSettingsStore) {
  return {
    async list(actor: Principal) {
      requireAdmin(actor);
      return store.get();
    },
    async save(actor: Principal, input: GlobalPaymentSettings) {
      requireAdmin(actor);
      await store.update({
        currencies: validate(input.currencies, SUPPORTED_CURRENCIES, "currencies"),
        paymentMethods: validate(input.paymentMethods, SUPPORTED_PAYMENT_METHODS, "payment methods"),
      });
    },
  };
}

function prismaStore(): PaymentSettingsStore {
  const db = getDatabaseClient();
  return {
    async get() {
      const settings = await db.globalPaymentSettings.findUnique({ where: { id: 1 }, select: { currencies: true, paymentMethods: true } });
      if (!settings) throw new Error("Global payment settings singleton is missing");
      return settings;
    },
    async update(settings) {
      await db.globalPaymentSettings.update({ where: { id: 1 }, data: settings });
    },
  };
}

export function getPaymentSettingsService() {
  return createPaymentSettingsService(prismaStore());
}
