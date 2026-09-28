import { randomUUID } from "node:crypto";

import type { CatalogCurrencyPair, CatalogPaymentMethod, NauttCatalogStore } from "./nautt-catalog";

export type TestNauttCatalogStore = NauttCatalogStore & {
  currencyPairs: CatalogCurrencyPair[];
  paymentMethods: CatalogPaymentMethod[];
  currencyPointers: Map<string, string>;
};

export function createTestNauttCatalogStore(): TestNauttCatalogStore {
  return {
    currencyPairs: [],
    paymentMethods: [],
    currencyPointers: new Map(),
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
      if (!active && [...this.currencyPointers.values()].includes(id)) throw new Error("Deactivate the currency or choose another default method first");
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
    async createCurrencyMethod(input) {
      const defaultPairId = this.currencyPointers.get(input.currencyCode);
      const currency = this.currencyPairs.find((pair) => pair.active && pair.id === defaultPairId);
      if (!currency) throw new Error("Currency is not registered");
      const exchangeConflict = this.currencyPairs.find((pair) => pair.exchangeCurrencyUuid === input.exchangeCurrencyUuid && pair.currencyUuid !== currency.currencyUuid);
      if (exchangeConflict) throw new Error("Exchange currency belongs to another currency");
      return this.createCurrencyPair({ label: input.label, currencyUuid: currency.currencyUuid, exchangeCurrencyUuid: input.exchangeCurrencyUuid });
    },
    async setDefaultCurrencyMethod(currencyCode, pairId) {
      const currentPairId = this.currencyPointers.get(currencyCode);
      const current = this.currencyPairs.find((pair) => pair.id === currentPairId);
      const next = this.currencyPairs.find((pair) => pair.id === pairId);
      if (!current || !next || !next.active || current.currencyUuid !== next.currencyUuid) throw new Error("Method is not active for this currency");
      this.currencyPointers.set(currencyCode, pairId);
    },
  };
}
