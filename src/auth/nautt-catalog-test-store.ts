import { randomUUID } from "node:crypto";

import type { CatalogCurrencyPair, CatalogPaymentMethod, NauttCatalogStore } from "./nautt-catalog";

export type TestNauttCatalogStore = NauttCatalogStore & {
  currencyPairs: CatalogCurrencyPair[];
  paymentMethods: CatalogPaymentMethod[];
};

export function createTestNauttCatalogStore(): TestNauttCatalogStore {
  return {
    currencyPairs: [],
    paymentMethods: [],
    async listCurrencyPairs() {
      return this.currencyPairs;
    },
    async listPaymentMethods() {
      return this.paymentMethods;
    },
    async createCurrencyPair(input) {
      const record: CatalogCurrencyPair = {
        id: randomUUID(),
        label: input.label,
        currencyUuid: input.currencyUuid,
        exchangeCurrencyUuid: input.exchangeCurrencyUuid,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.currencyPairs.push(record);
      return record;
    },
    async createPaymentMethod(input) {
      const record: CatalogPaymentMethod = {
        id: randomUUID(),
        label: input.label,
        paymentMethodUuid: input.paymentMethodUuid,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.paymentMethods.push(record);
      return record;
    },
    async updateCurrencyPair(id, label) {
      const record = this.currencyPairs.find((pair) => pair.id === id);
      if (!record) throw new Error("Not found");
      record.label = label;
      record.updatedAt = new Date();
      return record;
    },
    async updatePaymentMethod(id, label) {
      const record = this.paymentMethods.find((method) => method.id === id);
      if (!record) throw new Error("Not found");
      record.label = label;
      record.updatedAt = new Date();
      return record;
    },
    async setCurrencyPairActive(id, active) {
      const record = this.currencyPairs.find((pair) => pair.id === id);
      if (!record) throw new Error("Not found");
      record.active = active;
      record.updatedAt = new Date();
      return record;
    },
    async setPaymentMethodActive(id, active) {
      const record = this.paymentMethods.find((method) => method.id === id);
      if (!record) throw new Error("Not found");
      record.active = active;
      record.updatedAt = new Date();
      return record;
    },
  };
}
