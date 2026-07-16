import { describe, expect, it } from "vitest";

import { createPaymentSettingsService, PaymentSettingsValidationError, type PaymentSettingsStore } from "./payment-settings";

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
