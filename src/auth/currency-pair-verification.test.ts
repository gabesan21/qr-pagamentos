import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../db/client", () => ({ getDatabaseClient: vi.fn() }));
vi.mock("../integrations/nautt/owner-pricing-orders", () => ({ getOwnerPricingOrdersService: vi.fn() }));
vi.mock("./supported-exchange-currency", async () => {
  const actual = await vi.importActual<typeof import("./supported-exchange-currency")>("./supported-exchange-currency");
  return { ...actual, getSupportedExchangeCurrencyService: vi.fn() };
});

import { getDatabaseClient } from "../db/client";
import { getOwnerPricingOrdersService } from "../integrations/nautt/owner-pricing-orders";
import { NauttPricingRefusedError } from "../integrations/nautt/pricing-orders-client";
import { ForbiddenError } from "./authorization";
import {
  CurrencyPairProbeCodeInvalidError,
  CurrencyPairProbeThrottledError,
  CurrencyPairSelectionRefusedError,
  isSelectable,
  listLatestEvidenceByCode,
  probeCurrencyPair,
  requireSelectable,
  requireSelectableForCurrencyPair,
} from "./currency-pair-verification";
import { getSupportedExchangeCurrencyService, NoActiveExchangeCurrencyMappingError } from "./supported-exchange-currency";

const getDatabaseClientMock = vi.mocked(getDatabaseClient);
const getOwnerPricingOrdersServiceMock = vi.mocked(getOwnerPricingOrdersService);
const getSupportedExchangeCurrencyServiceMock = vi.mocked(getSupportedExchangeCurrencyService);

const owner = { id: "owner-id", username: "owner", email: null, role: "USER" as const, status: "ACTIVE" as const, createdAt: new Date() };
const admin = { ...owner, id: "admin-id", role: "ADMIN" as const };
const pairId = "pair-id";
const enabledSettings = { currencies: ["BRL"], paymentMethods: ["PIX"] };

function fakeDb(overrides: Record<string, unknown> = {}) {
  return {
    currencyPairVerification: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    globalPaymentSettings: { findUnique: vi.fn().mockResolvedValue(enabledSettings) },
    catalogCurrencyPair: { findUnique: vi.fn() },
    supportedExchangeCurrency: { findMany: vi.fn() },
    ...overrides,
  };
}

describe("isSelectable / requireSelectable", () => {
  it("refuses when there is no verification row", async () => {
    const db = fakeDb();
    db.currencyPairVerification.findUnique.mockResolvedValue(null);
    await expect(isSelectable(owner.id, pairId, db as never)).resolves.toBe(false);
    await expect(requireSelectable(owner.id, pairId, db as never)).rejects.toBeInstanceOf(CurrencyPairSelectionRefusedError);
  });

  it("refuses when the probe did not pass", async () => {
    const db = fakeDb();
    db.currencyPairVerification.findUnique.mockResolvedValue({ quoteOutcome: "validation.failed", observedPaymentMethod: null, observedCurrencySymbol: null });
    await expect(isSelectable(owner.id, pairId, db as never)).resolves.toBe(false);
  });

  it("allows a passing probe with no observation yet", async () => {
    const db = fakeDb();
    db.currencyPairVerification.findUnique.mockResolvedValue({ quoteOutcome: "ok", observedPaymentMethod: null, observedCurrencySymbol: null });
    await expect(isSelectable(owner.id, pairId, db as never)).resolves.toBe(true);
  });

  it("refuses a passing probe disproven by an observation settings do not cover", async () => {
    const db = fakeDb();
    db.currencyPairVerification.findUnique.mockResolvedValue({ quoteOutcome: "ok", observedPaymentMethod: "CREDIT_CARD", observedCurrencySymbol: "USD" });
    await expect(isSelectable(owner.id, pairId, db as never)).resolves.toBe(false);
  });

  it("allows a passing probe with an observation the settings cover", async () => {
    const db = fakeDb();
    db.currencyPairVerification.findUnique.mockResolvedValue({ quoteOutcome: "ok", observedPaymentMethod: "pix", observedCurrencySymbol: "brl" });
    await expect(isSelectable(owner.id, pairId, db as never)).resolves.toBe(true);
  });
});

describe("requireSelectableForCurrencyPair", () => {
  it("refuses when the catalog pair cannot be resolved", async () => {
    const db = fakeDb();
    db.catalogCurrencyPair.findUnique.mockResolvedValue(null);
    await expect(requireSelectableForCurrencyPair(owner.id, "c", "e", db as never)).rejects.toBeInstanceOf(CurrencyPairSelectionRefusedError);
  });

  it("resolves the pair id then delegates to the shared gate", async () => {
    const db = fakeDb();
    db.catalogCurrencyPair.findUnique.mockResolvedValue({ id: pairId });
    db.currencyPairVerification.findUnique.mockResolvedValue({ quoteOutcome: "ok", observedPaymentMethod: null, observedCurrencySymbol: null });
    await expect(requireSelectableForCurrencyPair(owner.id, "c", "e", db as never)).resolves.toBeUndefined();
  });
});

describe("probeCurrencyPair", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDatabaseClientMock.mockReturnValue(fakeDb() as never);
  });

  it("denies an administrator principal", async () => {
    await expect(probeCurrencyPair(admin, "BRL")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects a code with no active registered pair", async () => {
    getSupportedExchangeCurrencyServiceMock.mockReturnValue({
      requireActivePair: vi.fn().mockRejectedValue(new NoActiveExchangeCurrencyMappingError("none")),
    } as never);
    await expect(probeCurrencyPair(owner, "ZZZ")).rejects.toBeInstanceOf(CurrencyPairProbeCodeInvalidError);
  });

  it("throttles a second probe for the same (owner, pair) within 60s without calling the provider", async () => {
    const db = fakeDb();
    db.catalogCurrencyPair.findUnique.mockResolvedValue({ id: pairId });
    db.currencyPairVerification.findUnique.mockResolvedValue({ quoteCheckedAt: new Date("2026-01-01T00:00:30.000Z") });
    getDatabaseClientMock.mockReturnValue(db as never);
    getSupportedExchangeCurrencyServiceMock.mockReturnValue({
      requireActivePair: vi.fn().mockResolvedValue({ currencyUuid: "c", exchangeCurrencyUuid: "e" }),
    } as never);
    const quote = vi.fn();
    getOwnerPricingOrdersServiceMock.mockReturnValue({ quote } as never);

    await expect(
      probeCurrencyPair(owner, "BRL", () => new Date("2026-01-01T00:01:00.000Z")),
    ).rejects.toBeInstanceOf(CurrencyPairProbeThrottledError);
    expect(quote).not.toHaveBeenCalled();
  });

  it("records ok on a passing quote", async () => {
    const db = fakeDb();
    db.catalogCurrencyPair.findUnique.mockResolvedValue({ id: pairId });
    db.currencyPairVerification.findUnique.mockResolvedValue(null);
    getDatabaseClientMock.mockReturnValue(db as never);
    getSupportedExchangeCurrencyServiceMock.mockReturnValue({
      requireActivePair: vi.fn().mockResolvedValue({ currencyUuid: "c", exchangeCurrencyUuid: "e" }),
    } as never);
    const quote = vi.fn().mockResolvedValue({});
    getOwnerPricingOrdersServiceMock.mockReturnValue({ quote } as never);

    const result = await probeCurrencyPair(owner, "BRL", () => new Date("2026-01-01T00:00:00.000Z"));
    expect(result).toEqual({ outcome: "ok" });
    expect(quote).toHaveBeenCalledWith(owner.id, { currencyUuid: "c", exchangeCurrencyUuid: "e", amount: { kind: "fiat", value: "1.00" } });
    expect(db.currencyPairVerification.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ quoteOutcome: "ok" }),
      update: expect.objectContaining({ quoteOutcome: "ok" }),
    }));
  });

  it("records exactly the documented refusal code", async () => {
    const db = fakeDb();
    db.catalogCurrencyPair.findUnique.mockResolvedValue({ id: pairId });
    db.currencyPairVerification.findUnique.mockResolvedValue(null);
    getDatabaseClientMock.mockReturnValue(db as never);
    getSupportedExchangeCurrencyServiceMock.mockReturnValue({
      requireActivePair: vi.fn().mockResolvedValue({ currencyUuid: "c", exchangeCurrencyUuid: "e" }),
    } as never);
    const quote = vi.fn().mockRejectedValue(new NauttPricingRefusedError("validation.failed"));
    getOwnerPricingOrdersServiceMock.mockReturnValue({ quote } as never);

    const result = await probeCurrencyPair(owner, "BRL", () => new Date("2026-01-01T00:00:00.000Z"));
    expect(result).toEqual({ outcome: "validation.failed" });
    expect(db.currencyPairVerification.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ quoteOutcome: "validation.failed" }),
    }));
  });

  it("records the opaque unavailable outcome and never writes a code (missing credential, transport failure, generic adapter error)", async () => {
    const db = fakeDb();
    db.catalogCurrencyPair.findUnique.mockResolvedValue({ id: pairId });
    db.currencyPairVerification.findUnique.mockResolvedValue(null);
    getDatabaseClientMock.mockReturnValue(db as never);
    getSupportedExchangeCurrencyServiceMock.mockReturnValue({
      requireActivePair: vi.fn().mockResolvedValue({ currencyUuid: "c", exchangeCurrencyUuid: "e" }),
    } as never);
    const quote = vi.fn().mockRejectedValue(new Error("transport failure"));
    getOwnerPricingOrdersServiceMock.mockReturnValue({ quote } as never);

    const result = await probeCurrencyPair(owner, "BRL", () => new Date("2026-01-01T00:00:00.000Z"));
    expect(result).toEqual({ outcome: "unavailable" });
    const [call] = db.currencyPairVerification.upsert.mock.calls;
    expect(call[0].create.quoteOutcome).toBeNull();
    expect(call[0].update).not.toHaveProperty("quoteOutcome");
  });
});

describe("listLatestEvidenceByCode", () => {
  it("denies a non-administrator", async () => {
    await expect(listLatestEvidenceByCode(owner, fakeDb() as never)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("returns the most recently updated evidence row per registered code", async () => {
    const db = fakeDb();
    db.supportedExchangeCurrency.findMany.mockResolvedValue([{ code: "BRL", pairId }]);
    db.currencyPairVerification.findMany.mockResolvedValue([
      { pairId, quoteCheckedAt: new Date("2026-02-01T00:00:00.000Z"), quoteOutcome: "ok", observedPaymentMethod: "pix", observedCurrencySymbol: "BRL" },
      { pairId, quoteCheckedAt: new Date("2026-01-01T00:00:00.000Z"), quoteOutcome: "validation.failed", observedPaymentMethod: null, observedCurrencySymbol: null },
    ]);
    await expect(listLatestEvidenceByCode(admin, db as never)).resolves.toEqual([
      { code: "BRL", checkedAt: "2026-02-01T00:00:00.000Z", outcome: "ok", observedPaymentMethod: "pix", observedCurrencySymbol: "BRL" },
    ]);
  });
});
