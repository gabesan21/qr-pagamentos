import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import { createTestNauttCatalogStore } from "./nautt-catalog-test-store";
import { createNauttCatalogService, NauttCatalogValidationError } from "./nautt-catalog";

const admin = { id: "admin", username: "admin", email: null, role: "ADMIN" as const, status: "ACTIVE" as const, createdAt: new Date() };
const user = { ...admin, role: "USER" as const };
const disabledAdmin = { ...admin, status: "DISABLED" as const };

describe("nautt catalog service", () => {
  it("allows only an active administrator to manage the catalog", async () => {
    const service = createNauttCatalogService(createTestNauttCatalogStore());
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
    const service = createNauttCatalogService(createTestNauttCatalogStore());
    const validUuid = randomUUID();
    await expect(service.createCurrencyPair(admin, { label: "BRL/USDT", currencyUuid: "not-a-uuid", exchangeCurrencyUuid: validUuid })).rejects.toBeInstanceOf(NauttCatalogValidationError);
    await expect(service.createCurrencyPair(admin, { label: "BRL/USDT", currencyUuid: validUuid, exchangeCurrencyUuid: "  " })).rejects.toBeInstanceOf(NauttCatalogValidationError);
    await expect(service.createCurrencyPair(admin, { label: "BRL/USDT", currencyUuid: null as unknown as string, exchangeCurrencyUuid: validUuid })).rejects.toBeInstanceOf(NauttCatalogValidationError);
    await expect(service.createCurrencyPair(admin, { label: "BRL/USDT", currencyUuid: validUuid, exchangeCurrencyUuid: undefined as unknown as string })).rejects.toBeInstanceOf(NauttCatalogValidationError);
    await expect(service.createPaymentMethod(admin, { label: "PIX", paymentMethodUuid: "123e4567" })).rejects.toBeInstanceOf(NauttCatalogValidationError);
    await expect(service.createPaymentMethod(admin, { label: "PIX", paymentMethodUuid: null as unknown as string })).rejects.toBeInstanceOf(NauttCatalogValidationError);
    await expect(service.createPaymentMethod(admin, { label: "PIX", paymentMethodUuid: "" })).rejects.toBeInstanceOf(NauttCatalogValidationError);
  });

  it("rejects empty or oversized labels", async () => {
    const service = createNauttCatalogService(createTestNauttCatalogStore());
    const validUuid = randomUUID();
    await expect(service.createCurrencyPair(admin, { label: "", currencyUuid: validUuid, exchangeCurrencyUuid: validUuid })).rejects.toBeInstanceOf(NauttCatalogValidationError);
    await expect(service.createPaymentMethod(admin, { label: "a".repeat(129), paymentMethodUuid: validUuid })).rejects.toBeInstanceOf(NauttCatalogValidationError);
    await expect(service.createCurrencyPair(admin, { label: "   ", currencyUuid: validUuid, exchangeCurrencyUuid: validUuid })).rejects.toBeInstanceOf(NauttCatalogValidationError);
  });

  it("normalizes UUIDs to lowercase and trims labels", async () => {
    const store = createTestNauttCatalogStore();
    const service = createNauttCatalogService(store);
    const upperUuid = randomUUID().toUpperCase();
    const pair = await service.createCurrencyPair(admin, { label: "  BRL/USDT  ", currencyUuid: upperUuid, exchangeCurrencyUuid: upperUuid });
    expect(pair.currencyUuid).toBe(upperUuid.toLowerCase());
    expect(pair.label).toBe("BRL/USDT");
  });

  it("updates labels and toggles active state for both catalogs", async () => {
    const store = createTestNauttCatalogStore();
    const service = createNauttCatalogService(store);
    const validUuid = randomUUID();
    const pair = await service.createCurrencyPair(admin, { label: "BRL/USDT", currencyUuid: validUuid, exchangeCurrencyUuid: validUuid });
    const method = await service.createPaymentMethod(admin, { label: "PIX", paymentMethodUuid: validUuid });
    await expect(service.updateCurrencyPair(admin, pair.id, "BRL / USDT")).resolves.toMatchObject({ label: "BRL / USDT" });
    await expect(service.updatePaymentMethod(admin, method.id, "PIX Copy-and-Paste")).resolves.toMatchObject({ label: "PIX Copy-and-Paste" });
    await expect(service.setCurrencyPairActive(admin, pair.id, false)).resolves.toMatchObject({ active: false });
    await expect(service.setPaymentMethodActive(admin, method.id, true)).resolves.toMatchObject({ active: true });
  });

  it("rejects invalid identifiers on update and toggle", async () => {
    const service = createNauttCatalogService(createTestNauttCatalogStore());
    await expect(service.updateCurrencyPair(admin, "not-a-uuid", "Label")).rejects.toBeInstanceOf(NauttCatalogValidationError);
    await expect(service.updateCurrencyPair(admin, "", "Label")).rejects.toBeInstanceOf(NauttCatalogValidationError);
    await expect(service.updatePaymentMethod(admin, "   ", "Label")).rejects.toBeInstanceOf(NauttCatalogValidationError);
    await expect(service.setPaymentMethodActive(admin, null as unknown as string, false)).rejects.toBeInstanceOf(NauttCatalogValidationError);
    await expect(service.setCurrencyPairActive(admin, undefined as unknown as string, true)).rejects.toBeInstanceOf(NauttCatalogValidationError);
  });
});
