import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createCheckoutPaymentPolicy } from "./payment-policy";

const ownerId = "330e8400-e29b-41d4-a716-446655440033";
const currencyUuid = "660e8400-e29b-41d4-a716-446655440066";
const exchangeCurrencyUuid = "770e8400-e29b-41d4-a716-446655440077";
const pairId = "990e8400-e29b-41d4-a716-446655440099";

function harness({
  pair = { id: pairId },
  verification = null as { observedPaymentMethod: string | null; observedCurrencySymbol: string | null } | null,
  settings = { currencies: ["BRL"], paymentMethods: ["PIX"] } as { currencies: string[]; paymentMethods: string[] } | null,
} = {}) {
  const db = {
    catalogCurrencyPair: { findUnique: vi.fn().mockResolvedValue(pair) },
    currencyPairVerification: { findUnique: vi.fn().mockResolvedValue(verification) },
    globalPaymentSettings: { findUnique: vi.fn().mockResolvedValue(settings) },
  };
  return { db, policy: createCheckoutPaymentPolicy(db as never) };
}

describe("checkout payment policy", () => {
  it("dispatches a pair with no recorded observation yet", async () => {
    const { policy, db } = harness({ verification: null });
    await expect(policy.refuseDispatch({ ownerId, currencyUuid, exchangeCurrencyUuid })).resolves.toBe(false);
    expect(db.globalPaymentSettings.findUnique).not.toHaveBeenCalled();
  });

  it("dispatches an observed pair enabled by the settings", async () => {
    const { policy } = harness({ verification: { observedPaymentMethod: "pix", observedCurrencySymbol: "brl" } });
    await expect(policy.refuseDispatch({ ownerId, currencyUuid, exchangeCurrencyUuid })).resolves.toBe(false);
  });

  it("refuses an observed pair outside the enabled sets", async () => {
    const { policy } = harness({
      verification: { observedPaymentMethod: "bank_transfer", observedCurrencySymbol: "USD" },
      settings: { currencies: ["BRL"], paymentMethods: ["PIX"] },
    });
    await expect(policy.refuseDispatch({ ownerId, currencyUuid, exchangeCurrencyUuid })).resolves.toBe(true);
  });

  it("fails closed on an observed pair when either enabled set is empty", async () => {
    const { policy } = harness({
      verification: { observedPaymentMethod: "pix", observedCurrencySymbol: "BRL" },
      settings: { currencies: [], paymentMethods: ["PIX"] },
    });
    await expect(policy.refuseDispatch({ ownerId, currencyUuid, exchangeCurrencyUuid })).resolves.toBe(true);
  });

  it("dispatches when no registered pair row matches the reservation's UUIDs", async () => {
    const { policy, db } = harness({ pair: null as never });
    await expect(policy.refuseDispatch({ ownerId, currencyUuid, exchangeCurrencyUuid })).resolves.toBe(false);
    expect(db.currencyPairVerification.findUnique).not.toHaveBeenCalled();
  });

  it("throws when the settings singleton is missing, never silently dispatching", async () => {
    const { policy } = harness({ verification: { observedPaymentMethod: "pix", observedCurrencySymbol: "BRL" }, settings: null });
    await expect(policy.refuseDispatch({ ownerId, currencyUuid, exchangeCurrencyUuid })).rejects.toThrow("Global payment settings singleton is missing");
  });
});
