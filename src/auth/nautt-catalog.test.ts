import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import { createNauttCatalogService, NauttCatalogValidationError, type NauttCatalogStore } from "./nautt-catalog";

const admin = { id: "admin", username: "admin", email: null, role: "ADMIN" as const, status: "ACTIVE" as const, createdAt: new Date() };
const user = { ...admin, role: "USER" as const };
const disabledAdmin = { ...admin, status: "DISABLED" as const };

function store(): NauttCatalogStore & { currencyPairs: unknown[]; paymentMethods: unknown[] } {
  return {
    currencyPairs: [],
    paymentMethods: [],
    async listCurrencyPairs() { return this.currencyPairs as { id: string; label: string; currencyUuid: string; exchangeCurrencyUuid: string; active: boolean; createdAt: Date; updatedAt: Date }[]; },
    async listPaymentMethods() { return this.paymentMethods as { id: string; label: string; paymentMethodUuid: string; active: boolean; createdAt: Date; updatedAt: Date }[]; },
    async createCurrencyPair(input) {
      const record = { id: randomUUID(), ...input, active: true, createdAt: new Date(), updatedAt: new Date() };
      this.currencyPairs.push(record);
      return record;
    },
    async createPaymentMethod(input) {
      const record = { id: randomUUID(), ...input, active: true, createdAt: new Date(), updatedAt: new Date() };
      this.paymentMethods.push(record);
      return record;
    },
    async updateCurrencyPair(id, label) {
      const record = (this.currencyPairs as { id: string; label: string }[]).find((pair) => pair.id === id);
      if (!record) throw new Error("Not found");
      return { ...record, label } as unknown as ReturnType<NauttCatalogStore["updateCurrencyPair"]>;
    },
    async updatePaymentMethod(id, label) {
      const record = (this.paymentMethods as { id: string; label: string }[]).find((method) => method.id === id);
      if (!record) throw new Error("Not found");
      return { ...record, label } as unknown as ReturnType<NauttCatalogStore["updatePaymentMethod"]>;
    },
    async setCurrencyPairActive(id, active) {
      const record = (this.currencyPairs as { id: string; active: boolean }[]).find((pair) => pair.id === id);
      if (!record) throw new Error("Not found");
      return { ...record, active } as unknown as ReturnType<NauttCatalogStore["setCurrencyPairActive"]>;
    },
    async setPaymentMethodActive(id, active) {
      const record = (this.paymentMethods as { id: string; active: boolean }[]).find((method) => method.id === id);
      if (!record) throw new Error("Not found");
      return { ...record, active } as unknown as ReturnType<NauttCatalogStore["setPaymentMethodActive"]>;
    },
  };
}

describe("nautt catalog service", () => {
  it("allows only an active administrator to manage the catalog", async () => {
    const service = createNauttCatalogService(store());
    const validUuid = randomUUID();
    await expect(service.listCurrencyPairs(admin)).resolves.toEqual([]);
    await expect(service.listPaymentMethods(admin)).resolves.toEqual([]);
    await expect(service.createCurrencyPair(admin, { label: "BRL/USDT", currencyUuid: validUuid, exchangeCurrencyUuid: validUuid })).resolves.toBeDefined();
    await expect(service.createPaymentMethod(admin, { label: "PIX", paymentMethodUuid: validUuid })).resolves.toBeDefined();
    await expect(service.listCurrencyPairs(user)).rejects.toThrow("Administrator access is required");
    await expect(service.listPaymentMethods(disabledAdmin)).rejects.toThrow("Administrator access is required");
    await expect(service.createCurrencyPair(user, { label: "BRL/USDT", currencyUuid: validUuid, exchangeCurrencyUuid: validUuid })).rejects.toThrow("Administrator access is required");
    await expect(service.createPaymentMethod(disabledAdmin, { label: "PIX", paymentMethodUuid: validUuid })).rejects.toThrow("Administrator access is required");
  });

  it("rejects malformed or missing UUIDs before persistence", async () => {
    const service = createNauttCatalogService(store());
    const validUuid = randomUUID();
    await expect(service.createCurrencyPair(admin, { label: "BRL/USDT", currencyUuid: "not-a-uuid", exchangeCurrencyUuid: validUuid })).rejects.toBeInstanceOf(NauttCatalogValidationError);
    await expect(service.createCurrencyPair(admin, { label: "BRL/USDT", currencyUuid: validUuid, exchangeCurrencyUuid: "  " })).rejects.toBeInstanceOf(NauttCatalogValidationError);
    await expect(service.createPaymentMethod(admin, { label: "PIX", paymentMethodUuid: "123e4567" })).rejects.toBeInstanceOf(NauttCatalogValidationError);
    await expect(service.createPaymentMethod(admin, { label: "PIX", paymentMethodUuid: null as unknown as string })).rejects.toBeInstanceOf(NauttCatalogValidationError);
  });

  it("rejects empty or oversized labels", async () => {
    const service = createNauttCatalogService(store());
    const validUuid = randomUUID();
    await expect(service.createCurrencyPair(admin, { label: "", currencyUuid: validUuid, exchangeCurrencyUuid: validUuid })).rejects.toBeInstanceOf(NauttCatalogValidationError);
    await expect(service.createPaymentMethod(admin, { label: "a".repeat(129), paymentMethodUuid: validUuid })).rejects.toBeInstanceOf(NauttCatalogValidationError);
  });

  it("normalizes UUIDs to lowercase and trims labels", async () => {
    const s = store();
    const service = createNauttCatalogService(s);
    const upperUuid = randomUUID().toUpperCase();
    const pair = await service.createCurrencyPair(admin, { label: "  BRL/USDT  ", currencyUuid: upperUuid, exchangeCurrencyUuid: upperUuid });
    expect(pair.currencyUuid).toBe(upperUuid.toLowerCase());
    expect(pair.label).toBe("BRL/USDT");
  });

  it("updates labels and toggles active state for both catalogs", async () => {
    const s = store();
    const service = createNauttCatalogService(s);
    const validUuid = randomUUID();
    const pair = await service.createCurrencyPair(admin, { label: "BRL/USDT", currencyUuid: validUuid, exchangeCurrencyUuid: validUuid });
    const method = await service.createPaymentMethod(admin, { label: "PIX", paymentMethodUuid: validUuid });
    await expect(service.updateCurrencyPair(admin, pair.id, "BRL / USDT")).resolves.toMatchObject({ label: "BRL / USDT" });
    await expect(service.updatePaymentMethod(admin, method.id, "PIX Copy-and-Paste")).resolves.toMatchObject({ label: "PIX Copy-and-Paste" });
    await expect(service.setCurrencyPairActive(admin, pair.id, false)).resolves.toMatchObject({ active: false });
    await expect(service.setPaymentMethodActive(admin, method.id, true)).resolves.toMatchObject({ active: true });
  });

  it("rejects invalid identifiers on update and toggle", async () => {
    const service = createNauttCatalogService(store());
    await expect(service.updateCurrencyPair(admin, "not-a-uuid", "Label")).rejects.toBeInstanceOf(NauttCatalogValidationError);
    await expect(service.setPaymentMethodActive(admin, null as unknown as string, false)).rejects.toBeInstanceOf(NauttCatalogValidationError);
  });
});
