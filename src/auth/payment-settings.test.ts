import { describe, expect, it } from "vitest";

import { createPaymentSettingsService, isObservedPaymentEnabled, PaymentSettingsValidationError, type PaymentSettingsStore } from "./payment-settings";

const admin = { id: "admin", username: "admin", email: null, role: "ADMIN" as const, status: "ACTIVE" as const, createdAt: new Date() };

function store(): PaymentSettingsStore & { saved?: unknown } {
  const result: PaymentSettingsStore & { saved?: unknown } = {
    async get() { return { currencies: ["BRL"], paymentMethods: ["PIX"] }; },
    async update(settings) { result.saved = settings; },
  };
  return result;
}

describe("global payment settings", () => {
  it("allows only an active administrator to read and save the closed catalog", async () => {
    const settings = store();
    const service = createPaymentSettingsService(settings);
    await expect(service.list(admin)).resolves.toEqual({ currencies: ["BRL"], paymentMethods: ["PIX"] });
    await service.save(admin, { currencies: ["BRL"], paymentMethods: ["PIX"] });
    expect(settings.saved).toEqual({ currencies: ["BRL"], paymentMethods: ["PIX"] });
    await expect(service.list({ ...admin, role: "USER" })).rejects.toThrow("Administrator access is required");
  });

  it("rejects codes outside the fixed BRL and PIX catalog", async () => {
    const service = createPaymentSettingsService(store());
    await expect(service.save(admin, { currencies: ["USD"], paymentMethods: ["PIX"] })).rejects.toBeInstanceOf(PaymentSettingsValidationError);
    await expect(service.save(admin, { currencies: ["BRL"], paymentMethods: ["CARD"] })).rejects.toBeInstanceOf(PaymentSettingsValidationError);
  });
});

describe("isObservedPaymentEnabled", () => {
  const enabled = { currencies: ["BRL"], paymentMethods: ["PIX"] };

  it("enables an observed pair matching the closed lists case-insensitively", () => {
    expect(isObservedPaymentEnabled(enabled, { paymentMethod: "pix", currencySymbol: "brl" })).toBe(true);
    expect(isObservedPaymentEnabled(enabled, { paymentMethod: "PIX", currencySymbol: "BRL" })).toBe(true);
  });

  it("refuses an observed pair outside the enabled sets", () => {
    expect(isObservedPaymentEnabled(enabled, { paymentMethod: "bank_transfer", currencySymbol: "BRL" })).toBe(false);
    expect(isObservedPaymentEnabled(enabled, { paymentMethod: "PIX", currencySymbol: "USD" })).toBe(false);
  });

  it("fails closed when either enabled set is empty", () => {
    expect(isObservedPaymentEnabled({ currencies: [], paymentMethods: ["PIX"] }, { paymentMethod: "PIX", currencySymbol: "BRL" })).toBe(false);
    expect(isObservedPaymentEnabled({ currencies: ["BRL"], paymentMethods: [] }, { paymentMethod: "PIX", currencySymbol: "BRL" })).toBe(false);
    expect(isObservedPaymentEnabled({ currencies: [], paymentMethods: [] }, { paymentMethod: "PIX", currencySymbol: "BRL" })).toBe(false);
  });
});
