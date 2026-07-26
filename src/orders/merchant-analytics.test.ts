import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ForbiddenError } from "../auth/authorization";
import type { OrderV2Summary } from "./order-v2-view";
import {
  createMerchantAnalyticsService,
  resolvePeriodBounds,
  type MerchantAnalyticsStore,
  type StoredAdHocOutcomeOrder,
  type StoredAnalyticsAttempt,
  type StoredAnalyticsLink,
  type StoredConfirmedOrder,
  type StoredCurrencyLabel,
  type StoredProductTitle,
} from "./merchant-analytics";

const ownerId = "110e8400-e29b-41d4-a716-446655440011";
const linkId = "330e8400-e29b-41d4-a716-446655440033";
const productAId = "aa0e8400-e29b-41d4-a716-4466554400a1";
const productBId = "bb0e8400-e29b-41d4-a716-4466554400b2";
const pairA = { currencyUuid: "990e8400-e29b-41d4-a716-446655440099", exchangeCurrencyUuid: "aa0e8400-e29b-41d4-a716-4466554400aa" };
const pairB = { currencyUuid: "bb0e8400-e29b-41d4-a716-4466554400bb", exchangeCurrencyUuid: "cc0e8400-e29b-41d4-a716-4466554400cc" };

const owner = { id: ownerId, username: "owner", email: null, role: "USER" as const, status: "ACTIVE" as const, createdAt: new Date() };
const admin = { ...owner, role: "ADMIN" as const };
const now = new Date("2026-07-25T20:00:00.000Z"); // 17:00 in America/Sao_Paulo

function confirmed(overrides: Partial<StoredConfirmedOrder> = {}): StoredConfirmedOrder {
  return { paymentLinkV2Id: linkId, amount: "10", pair: pairA, lines: [], ...overrides };
}

function storeWith(overrides: Partial<MerchantAnalyticsStore> = {}): MerchantAnalyticsStore {
  return {
    listConfirmedOrders: vi.fn(async () => []),
    listAdHocOutcomeOrders: vi.fn(async () => []),
    listAttempts: vi.fn(async () => []),
    listLinks: vi.fn(async () => []),
    listRecentOrders: vi.fn(async () => []),
    listCurrencyLabels: vi.fn(async (): Promise<StoredCurrencyLabel[]> => [
      { pair: pairA, code: "BRL", label: "BRL via PIX" },
      { pair: pairB, code: null, label: "Unmapped pair" },
    ]),
    listProductTitles: vi.fn(async (): Promise<StoredProductTitle[]> => []),
    ...overrides,
  };
}

function serviceWith(store: MerchantAnalyticsStore) {
  return createMerchantAnalyticsService(store, { now: () => now });
}

describe("resolvePeriodBounds", () => {
  it("aligns closed periods to America/Sao_Paulo calendar days as half-open UTC bounds", () => {
    expect(resolvePeriodBounds("today", now)).toEqual({
      from: new Date("2026-07-25T03:00:00.000Z"),
      to: new Date("2026-07-26T03:00:00.000Z"),
    });
    expect(resolvePeriodBounds("7d", now)).toEqual({
      from: new Date("2026-07-19T03:00:00.000Z"),
      to: new Date("2026-07-26T03:00:00.000Z"),
    });
    expect(resolvePeriodBounds("30d", now)).toEqual({
      from: new Date("2026-06-26T03:00:00.000Z"),
      to: new Date("2026-07-26T03:00:00.000Z"),
    });
  });

  it("uses the reporting-zone day, not the UTC day, around midnight", () => {
    const beforeMidnightSp = new Date("2026-07-25T02:30:00.000Z"); // 23:30 SP on the 24th
    expect(resolvePeriodBounds("today", beforeMidnightSp)).toEqual({
      from: new Date("2026-07-24T03:00:00.000Z"),
      to: new Date("2026-07-25T03:00:00.000Z"),
    });
  });
});

describe("merchant analytics service", () => {
  it("re-authorizes the principal on every read and rejects unknown periods with zero I/O", async () => {
    const store = storeWith();
    const service = serviceWith(store);
    await expect(service.getForOwner(admin, "today")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.getForOwner({ ...owner, status: "DISABLED" as never }, "today")).rejects.toBeInstanceOf(ForbiddenError);
    expect(await service.getForOwner(owner, "year")).toEqual({ kind: "invalid-period" });
    expect(store.listConfirmedOrders).not.toHaveBeenCalled();
  });

  it("scopes every store read to the principal and the resolved bounds", async () => {
    const store = storeWith();
    const result = await serviceWith(store).getForOwner(owner, "today");
    expect(result.kind).toBe("ready");
    const from = new Date("2026-07-25T03:00:00.000Z");
    const to = new Date("2026-07-26T03:00:00.000Z");
    expect(store.listConfirmedOrders).toHaveBeenCalledWith(ownerId, from, to);
    expect(store.listAttempts).toHaveBeenCalledWith(ownerId, from, to);
    expect(store.listLinks).toHaveBeenCalledWith(ownerId);
    expect(store.listRecentOrders).toHaveBeenCalledWith(ownerId, 5);
  });

  it("sums exact decimals per currency group and never merges confirmed with locally finalized sales", async () => {
    const adHoc: StoredAdHocOutcomeOrder[] = [
      { amount: "0.3", pair: pairA, latestOutcome: { outcome: "LOCAL_FINALIZED", createdAt: new Date("2026-07-25T12:00:00.000Z") } },
      { amount: "99", pair: pairA, latestOutcome: { outcome: "LOCAL_CANCELLED", createdAt: new Date("2026-07-25T13:00:00.000Z") } },
      { amount: "99", pair: pairA, latestOutcome: { outcome: "LOCAL_FINALIZED", createdAt: new Date("2026-07-20T12:00:00.000Z") } },
    ];
    const store = storeWith({
      listConfirmedOrders: vi.fn(async () => [
        confirmed({ amount: "0.1" }),
        confirmed({ amount: "0.2" }),
        confirmed({ amount: "7.5", pair: pairB, paymentLinkV2Id: null }),
      ]),
      listAdHocOutcomeOrders: vi.fn(async () => adHoc),
    });
    const result = await serviceWith(store).getForOwner(owner, "today");
    if (result.kind !== "ready") throw new Error("expected ready");
    expect(result.view.confirmedSales).toEqual([
      { currency: { code: null, label: "Unmapped pair" }, amount: "7.5", orderCount: 1 },
      { currency: { code: "BRL", label: "BRL via PIX" }, amount: "0.3", orderCount: 2 },
    ]);
    expect(result.view.locallyFinalizedSales).toEqual([
      { currency: { code: "BRL", label: "BRL via PIX" }, amount: "0.3", orderCount: 1 },
    ]);
  });

  it("classifies the funnel from persisted fields only, with the expiry boundary counting as abandoned", async () => {
    const attempts: StoredAnalyticsAttempt[] = [
      { paymentLinkV2Id: linkId, capabilityExpiresAt: new Date("2026-07-24T00:00:00.000Z"), orderState: "CONFIRMED" }, // converted even though expired
      { paymentLinkV2Id: linkId, capabilityExpiresAt: now, orderState: "PENDING" }, // boundary: expired at the read instant
      { paymentLinkV2Id: linkId, capabilityExpiresAt: new Date("2026-07-25T19:00:00.000Z"), orderState: null },
      { paymentLinkV2Id: linkId, capabilityExpiresAt: new Date("2026-07-26T20:00:00.000Z"), orderState: "PENDING" }, // in progress
    ];
    const result = await serviceWith(storeWith({ listAttempts: vi.fn(async () => attempts) })).getForOwner(owner, "today");
    if (result.kind !== "ready") throw new Error("expected ready");
    expect(result.view.funnel).toEqual({
      attempts: 4,
      converted: 1,
      abandoned: 2,
      inProgress: 1,
      conversionRate: "0.3333",
      abandonmentRate: "0.6666",
    });
  });

  it("returns null rates when no attempt reached a terminal funnel class", async () => {
    const attempts: StoredAnalyticsAttempt[] = [
      { paymentLinkV2Id: linkId, capabilityExpiresAt: new Date("2026-07-26T20:00:00.000Z"), orderState: "PENDING" },
    ];
    const result = await serviceWith(storeWith({ listAttempts: vi.fn(async () => attempts) })).getForOwner(owner, "today");
    if (result.kind !== "ready") throw new Error("expected ready");
    expect(result.view.funnel.conversionRate).toBeNull();
    expect(result.view.funnel.abandonmentRate).toBeNull();
    expect(result.view.funnel.inProgress).toBe(1);
  });

  it("ranks best sellers by confirmed quantity with per-currency exact revenue and a deterministic tie-break", async () => {
    const orders: StoredConfirmedOrder[] = [
      confirmed({ amount: "30", lines: [{ productId: productBId, quantity: 3, unitPrice: "10" }] }),
      confirmed({ amount: "20", pair: pairB, lines: [{ productId: productAId, quantity: 2, unitPrice: "10" }] }),
      confirmed({ amount: "10.5", lines: [{ productId: productAId, quantity: 1, unitPrice: "10.5" }] }),
    ];
    const store = storeWith({
      listConfirmedOrders: vi.fn(async () => orders),
      listProductTitles: vi.fn(async (_owner: string, ids: ReadonlyArray<string>) =>
        ids.map((id) => ({ id, titlePtBr: `Título ${id.slice(0, 2)}`, titleEn: `Title ${id.slice(0, 2)}` }))),
    });
    const result = await serviceWith(store).getForOwner(owner, "today");
    if (result.kind !== "ready") throw new Error("expected ready");
    expect(result.view.bestSellers).toEqual([
      {
        titlePtBr: "Título aa", titleEn: "Title aa", confirmedQuantity: 3,
        revenue: [{ currency: { code: null, label: "Unmapped pair" }, amount: "20" }, { currency: { code: "BRL", label: "BRL via PIX" }, amount: "10.5" }],
      },
      { titlePtBr: "Título bb", titleEn: "Title bb", confirmedQuantity: 3, revenue: [{ currency: { code: "BRL", label: "BRL via PIX" }, amount: "30" }] },
    ]);
  });

  it("builds per-link metrics only for links with in-period activity plus the global active count", async () => {
    const links: StoredAnalyticsLink[] = [
      { id: linkId, identifier: "link-a", descriptionPtBr: "Doação", descriptionEn: "Donation", active: true },
      { id: "440e8400-e29b-41d4-a716-446655440044", identifier: "link-b", descriptionPtBr: null, descriptionEn: null, active: false },
    ];
    const store = storeWith({
      listLinks: vi.fn(async () => links),
      listAttempts: vi.fn(async () => [{ paymentLinkV2Id: linkId, capabilityExpiresAt: now, orderState: null }]),
      listConfirmedOrders: vi.fn(async () => [confirmed({ amount: "12.34" }), confirmed({ amount: "1" })]),
    });
    const result = await serviceWith(store).getForOwner(owner, "today");
    if (result.kind !== "ready") throw new Error("expected ready");
    expect(result.view.paymentLinks.activeCount).toBe(1);
    expect(result.view.paymentLinks.metrics).toEqual([
      {
        identifier: "link-a",
        descriptionPtBr: "Doação",
        descriptionEn: "Donation",
        attempts: 1,
        confirmedOrders: 2,
        confirmedVolume: [{ currency: { code: "BRL", label: "BRL via PIX" }, amount: "13.34" }],
      },
    ]);
  });

  it("counts standalone attempts in the funnel without entering per-link metrics", async () => {
    const links: StoredAnalyticsLink[] = [
      { id: linkId, identifier: "link-a", descriptionPtBr: null, descriptionEn: null, active: true },
    ];
    const attempts: StoredAnalyticsAttempt[] = [
      { paymentLinkV2Id: null, capabilityExpiresAt: new Date("2026-07-26T20:00:00.000Z"), orderState: "CONFIRMED" },
      { paymentLinkV2Id: linkId, capabilityExpiresAt: new Date("2026-07-26T20:00:00.000Z"), orderState: "PENDING" },
    ];
    const store = storeWith({ listLinks: vi.fn(async () => links), listAttempts: vi.fn(async () => attempts) });
    const result = await serviceWith(store).getForOwner(owner, "today");
    if (result.kind !== "ready") throw new Error("expected ready");
    expect(result.view.funnel).toEqual({
      attempts: 2,
      converted: 1,
      abandoned: 0,
      inProgress: 1,
      conversionRate: "1.0000",
      abandonmentRate: "0.0000",
    });
    expect(result.view.paymentLinks.metrics).toEqual([
      { identifier: "link-a", descriptionPtBr: null, descriptionEn: null, attempts: 1, confirmedOrders: 0, confirmedVolume: [] },
    ]);
  });

  it("redacts the recent-activity feed and never leaks internal identities anywhere in the DTO", async () => {
    const recent: OrderV2Summary[] = [{
      id: "550e8400-e29b-41d4-a716-446655440055",
      source: "AD_HOC",
      paymentLinkV2Identifier: null,
      amount: "10",
      currencyUuid: pairA.currencyUuid,
      exchangeCurrencyUuid: pairA.exchangeCurrencyUuid,
      descriptionPtBr: "Doação",
      descriptionEn: "Donation",
      state: null,
      currentLocalOutcome: { outcome: "LOCAL_FINALIZED", note: "internal note", createdAt: new Date("2026-07-25T12:00:00.000Z") },
      checkoutDataPolicy: "NAME_EMAIL",
      payer: { name: "Ana", email: "ana@example.com", cpf: null, address: null },
      createdAt: new Date("2026-07-25T11:00:00.000Z"),
      updatedAt: new Date("2026-07-25T12:00:00.000Z"),
      settledAt: null,
    }];
    const store = storeWith({
      listConfirmedOrders: vi.fn(async () => [confirmed()]),
      listRecentOrders: vi.fn(async () => recent),
    });
    const result = await serviceWith(store).getForOwner(owner, "today");
    if (result.kind !== "ready") throw new Error("expected ready");
    expect(result.view.recentActivity).toEqual([{
      source: "AD_HOC",
      descriptionPtBr: "Doação",
      descriptionEn: "Donation",
      amount: "10",
      currency: { code: "BRL", label: "BRL via PIX" },
      state: null,
      currentLocalOutcome: { outcome: "LOCAL_FINALIZED", createdAt: new Date("2026-07-25T12:00:00.000Z") },
      paymentLinkV2Identifier: null,
      createdAt: new Date("2026-07-25T11:00:00.000Z"),
      settledAt: null,
    }]);
    const serialized = JSON.stringify(result.view);
    expect(serialized).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(serialized).not.toContain("internal note");
  });
});
