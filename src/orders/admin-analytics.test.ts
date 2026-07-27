import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ForbiddenError } from "../auth/authorization";
import {
  createAdminAnalyticsService,
  type AdminAnalyticsStore,
  type StoredAdminConfirmedOrder,
  type StoredOwnerIdentity,
} from "./admin-analytics";
import type { StoredAdHocOutcomeOrder, StoredAnalyticsAttempt, StoredCurrencyLabel, StoredProductTitle } from "./merchant-analytics";

const ownerAId = "110e8400-e29b-41d4-a716-446655440011";
const ownerBId = "220e8400-e29b-41d4-a716-446655440022";
const productAId = "aa0e8400-e29b-41d4-a716-4466554400a1";
const productBId = "bb0e8400-e29b-41d4-a716-4466554400b2";
const pairA = { currencyUuid: "990e8400-e29b-41d4-a716-446655440099", exchangeCurrencyUuid: "aa0e8400-e29b-41d4-a716-4466554400aa" };
const pairB = { currencyUuid: "bb0e8400-e29b-41d4-a716-4466554400bb", exchangeCurrencyUuid: "cc0e8400-e29b-41d4-a716-4466554400cc" };

const admin = { id: "ff0e8400-e29b-41d4-a716-4466554400ff", username: "root", email: null, role: "ADMIN" as const, status: "ACTIVE" as const, createdAt: new Date() };
const merchant = { ...admin, role: "USER" as const };
const now = new Date("2026-07-25T20:00:00.000Z"); // 17:00 in America/Sao_Paulo

function confirmed(overrides: Partial<StoredAdminConfirmedOrder> = {}): StoredAdminConfirmedOrder {
  return { ownerId: ownerAId, amount: "10", pair: pairA, lines: [], ...overrides };
}

function storeWith(overrides: Partial<AdminAnalyticsStore> = {}): AdminAnalyticsStore {
  return {
    countUsers: vi.fn(async () => ({ registeredTotal: 0, activeNow: 0, deletedTotal: 0 })),
    countOrdersBySourceAndState: vi.fn(async () => []),
    countLinks: vi.fn(async () => ({ total: 0, activeCount: 0 })),
    countProducts: vi.fn(async () => ({ activeCount: 0, archivedCount: 0 })),
    listConfirmedOrders: vi.fn(async () => []),
    listAdHocOutcomeOrders: vi.fn(async () => []),
    listAttempts: vi.fn(async () => []),
    listCurrencyLabels: vi.fn(async (): Promise<StoredCurrencyLabel[]> => [
      { pair: pairA, code: "BRL", label: "BRL via PIX" },
      { pair: pairB, code: null, label: "Unmapped pair" },
    ]),
    listProductTitles: vi.fn(async (): Promise<StoredProductTitle[]> => []),
    listOwnerIdentities: vi.fn(async (): Promise<StoredOwnerIdentity[]> => []),
    ...overrides,
  };
}

function serviceWith(store: AdminAnalyticsStore) {
  return createAdminAnalyticsService(store, { now: () => now });
}

describe("admin analytics service", () => {
  it("denies non-administrator and non-active principals before any I/O and rejects unknown periods with zero reads", async () => {
    const store = storeWith();
    const service = serviceWith(store);
    await expect(service.getGlobal(merchant, "today")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.getGlobal({ ...admin, status: "DISABLED" as never }, "today")).rejects.toBeInstanceOf(ForbiddenError);
    expect(await service.getGlobal(admin, "year")).toEqual({ kind: "invalid-period" });
    expect(store.countUsers).not.toHaveBeenCalled();
    expect(store.listConfirmedOrders).not.toHaveBeenCalled();
  });

  it("reads globally — never owner-scoped — inside the resolved reporting-zone bounds", async () => {
    const store = storeWith();
    const result = await serviceWith(store).getGlobal(admin, "today");
    expect(result.kind).toBe("ready");
    const from = new Date("2026-07-25T03:00:00.000Z");
    const to = new Date("2026-07-26T03:00:00.000Z");
    expect(store.listConfirmedOrders).toHaveBeenCalledWith(from, to);
    expect(store.listAdHocOutcomeOrders).toHaveBeenCalledWith(from, to);
    expect(store.listAttempts).toHaveBeenCalledWith(from, to);
    expect(store.countOrdersBySourceAndState).toHaveBeenCalledWith(from, to);
    expect(store.countUsers).toHaveBeenCalledWith();
    expect(store.countLinks).toHaveBeenCalledWith();
    if (result.kind !== "ready") throw new Error("expected ready");
    expect(result.view.period).toEqual({ id: "today", from, to });
  });

  it("exposes registered, active, and deleted user counts as separate members", async () => {
    const store = storeWith({ countUsers: vi.fn(async () => ({ registeredTotal: 5, activeNow: 3, deletedTotal: 1 })) });
    const result = await serviceWith(store).getGlobal(admin, "today");
    if (result.kind !== "ready") throw new Error("expected ready");
    expect(result.view.users).toEqual({ registeredTotal: 5, activeNow: 3, deletedTotal: 1 });
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
        confirmed({ amount: "7.5", pair: pairB, ownerId: ownerBId }),
      ]),
      listAdHocOutcomeOrders: vi.fn(async () => adHoc),
    });
    const result = await serviceWith(store).getGlobal(admin, "today");
    if (result.kind !== "ready") throw new Error("expected ready");
    expect(result.view.confirmedSales).toEqual([
      { currency: { code: null, label: "Unmapped pair" }, amount: "7.5", orderCount: 1 },
      { currency: { code: "BRL", label: "BRL via PIX" }, amount: "0.3", orderCount: 2 },
    ]);
    expect(result.view.locallyFinalizedSales).toEqual([
      { currency: { code: "BRL", label: "BRL via PIX" }, amount: "0.3", orderCount: 1 },
    ]);
    expect(result.view).not.toHaveProperty("totalSales");
  });

  it("unions both attempt tables globally without double-counting and classifies from persisted fields only", async () => {
    const attempts: StoredAnalyticsAttempt[] = [
      // Link-table attempt: converted even though its capability expired.
      { paymentLinkV2Id: "330e8400-e29b-41d4-a716-446655440033", capabilityExpiresAt: new Date("2026-07-24T00:00:00.000Z"), orderState: "CONFIRMED" },
      // Standalone-table attempt: expiry boundary counts as abandoned.
      { paymentLinkV2Id: null, capabilityExpiresAt: now, orderState: "PENDING" },
      { paymentLinkV2Id: null, capabilityExpiresAt: new Date("2026-07-26T20:00:00.000Z"), orderState: null },
    ];
    const result = await serviceWith(storeWith({ listAttempts: vi.fn(async () => attempts) })).getGlobal(admin, "today");
    if (result.kind !== "ready") throw new Error("expected ready");
    expect(result.view.funnel).toEqual({
      attempts: 3,
      converted: 1,
      abandoned: 1,
      inProgress: 1,
      conversionRate: "0.5000",
      abandonmentRate: "0.5000",
    });
  });

  it("returns null rates when no attempt reached a terminal funnel class", async () => {
    const attempts: StoredAnalyticsAttempt[] = [
      { paymentLinkV2Id: null, capabilityExpiresAt: new Date("2026-07-26T20:00:00.000Z"), orderState: "PENDING" },
    ];
    const result = await serviceWith(storeWith({ listAttempts: vi.fn(async () => attempts) })).getGlobal(admin, "today");
    if (result.kind !== "ready") throw new Error("expected ready");
    expect(result.view.funnel.conversionRate).toBeNull();
    expect(result.view.funnel.abandonmentRate).toBeNull();
    expect(result.view.funnel.inProgress).toBe(1);
  });

  it("groups in-period order counts by source and by state with deterministic ordering", async () => {
    const store = storeWith({
      countOrdersBySourceAndState: vi.fn(async () => [
        { source: "LINK" as const, state: "CONFIRMED" as const, count: 3 },
        { source: "AD_HOC" as const, state: null, count: 2 },
        { source: "LINK" as const, state: "PENDING" as const, count: 1 },
        { source: "STANDALONE" as const, state: "CONFIRMED" as const, count: 1 },
      ]),
    });
    const result = await serviceWith(store).getGlobal(admin, "today");
    if (result.kind !== "ready") throw new Error("expected ready");
    expect(result.view.orders).toEqual({
      createdInPeriod: 7,
      bySource: [
        { source: "LINK", count: 4 },
        { source: "AD_HOC", count: 2 },
        { source: "STANDALONE", count: 1 },
      ],
      byState: [
        { state: "CONFIRMED", count: 4 },
        { state: null, count: 2 },
        { state: "PENDING", count: 1 },
      ],
    });
  });

  it("exposes V2 link totals and product active/archived counts", async () => {
    const store = storeWith({
      countLinks: vi.fn(async () => ({ total: 9, activeCount: 4 })),
      countProducts: vi.fn(async () => ({ activeCount: 7, archivedCount: 2 })),
    });
    const result = await serviceWith(store).getGlobal(admin, "today");
    if (result.kind !== "ready") throw new Error("expected ready");
    expect(result.view.paymentLinks).toEqual({ total: 9, activeCount: 4 });
    expect(result.view.products).toEqual({ activeCount: 7, archivedCount: 2 });
  });

  it("keeps soft-deleted owners inside every aggregate and marks them on the bounded top-owner leaderboard", async () => {
    const owners: StoredOwnerIdentity[] = [0, 1, 2, 3, 4, 5].map((index) => ({
      id: `owner-${index}`,
      username: `owner${index}`,
      deleted: index === 0,
    }));
    const orders = [0, 1, 2, 3, 4, 5].flatMap((index) =>
      Array.from({ length: 6 - index }, () => confirmed({ ownerId: `owner-${index}`, amount: "1" })),
    );
    const store = storeWith({
      listConfirmedOrders: vi.fn(async () => orders),
      listOwnerIdentities: vi.fn(async () => owners),
    });
    const result = await serviceWith(store).getGlobal(admin, "today");
    if (result.kind !== "ready") throw new Error("expected ready");
    expect(result.view.topOwners).toHaveLength(5);
    expect(result.view.topOwners[0]).toEqual({
      owner: { username: "owner0", deleted: true },
      confirmedOrders: 6,
      confirmedVolume: [{ currency: { code: "BRL", label: "BRL via PIX" }, amount: "6" }],
    });
    expect(Object.keys(result.view.topOwners[0].owner).sort()).toEqual(["deleted", "username"]);
    expect(result.view.topOwners.map((entry) => entry.confirmedOrders)).toEqual([6, 5, 4, 3, 2]);
    // The deleted owner's orders stay inside the global aggregate.
    expect(result.view.confirmedSales).toEqual([{ currency: { code: "BRL", label: "BRL via PIX" }, amount: "21", orderCount: 21 }]);
  });

  it("ranks top owners per currency without merging groups and breaks ties on username", async () => {
    const store = storeWith({
      listConfirmedOrders: vi.fn(async () => [
        confirmed({ ownerId: ownerAId, amount: "5", pair: pairA }),
        confirmed({ ownerId: ownerAId, amount: "5", pair: pairB }),
        confirmed({ ownerId: ownerBId, amount: "40", pair: pairB }),
      ]),
      listOwnerIdentities: vi.fn(async () => [
        { id: ownerAId, username: "bravo", deleted: false },
        { id: ownerBId, username: "alpha", deleted: false },
      ]),
    });
    const result = await serviceWith(store).getGlobal(admin, "today");
    if (result.kind !== "ready") throw new Error("expected ready");
    expect(result.view.topOwners).toEqual([
      {
        owner: { username: "bravo", deleted: false },
        confirmedOrders: 2,
        confirmedVolume: [
          { currency: { code: "BRL", label: "BRL via PIX" }, amount: "5" },
          { currency: { code: null, label: "Unmapped pair" }, amount: "5" },
        ],
      },
      {
        owner: { username: "alpha", deleted: false },
        confirmedOrders: 1,
        confirmedVolume: [{ currency: { code: null, label: "Unmapped pair" }, amount: "40" }],
      },
    ]);
  });

  it("fails closed on an unresolved owner identity without dropping the aggregates", async () => {
    const store = storeWith({
      listConfirmedOrders: vi.fn(async () => [confirmed({ ownerId: ownerAId, amount: "12" })]),
      listOwnerIdentities: vi.fn(async () => []),
    });
    const result = await serviceWith(store).getGlobal(admin, "today");
    if (result.kind !== "ready") throw new Error("expected ready");
    expect(result.view.topOwners).toEqual([]);
    expect(result.view.confirmedSales).toEqual([{ currency: { code: "BRL", label: "BRL via PIX" }, amount: "12", orderCount: 1 }]);
  });

  it("ranks top products by confirmed quantity with per-currency exact revenue, including archived products", async () => {
    const orders: StoredAdminConfirmedOrder[] = [
      confirmed({ amount: "30", lines: [{ productId: productBId, quantity: 3, unitPrice: "10" }] }),
      confirmed({ amount: "20", pair: pairB, lines: [{ productId: productAId, quantity: 2, unitPrice: "10" }] }),
      confirmed({ amount: "10.5", lines: [{ productId: productAId, quantity: 1, unitPrice: "10.5" }] }),
    ];
    const store = storeWith({
      listConfirmedOrders: vi.fn(async () => orders),
      listProductTitles: vi.fn(async (ids: ReadonlyArray<string>) =>
        ids.map((id) => ({ id, titlePtBr: `Título ${id.slice(0, 2)}`, titleEn: `Title ${id.slice(0, 2)}` }))),
    });
    const result = await serviceWith(store).getGlobal(admin, "today");
    if (result.kind !== "ready") throw new Error("expected ready");
    expect(store.listProductTitles).toHaveBeenCalledWith(expect.arrayContaining([productAId, productBId]));
    expect(result.view.topProducts).toEqual([
      {
        titlePtBr: "Título aa", titleEn: "Title aa", confirmedQuantity: 3,
        revenue: [{ currency: { code: null, label: "Unmapped pair" }, amount: "20" }, { currency: { code: "BRL", label: "BRL via PIX" }, amount: "10.5" }],
      },
      { titlePtBr: "Título bb", titleEn: "Title bb", confirmedQuantity: 3, revenue: [{ currency: { code: "BRL", label: "BRL via PIX" }, amount: "30" }] },
    ]);
  });

  it("never leaks internal identities, payer data, email, or provider material anywhere in the DTO", async () => {
    const store = storeWith({
      countUsers: vi.fn(async () => ({ registeredTotal: 2, activeNow: 1, deletedTotal: 1 })),
      listConfirmedOrders: vi.fn(async () => [confirmed({ amount: "10", lines: [{ productId: productAId, quantity: 1, unitPrice: "10" }] })]),
      listOwnerIdentities: vi.fn(async () => [{ id: ownerAId, username: "owner0", deleted: true }]),
      listProductTitles: vi.fn(async () => [{ id: productAId, titlePtBr: "Café", titleEn: "Coffee" }]),
    });
    const result = await serviceWith(store).getGlobal(admin, "today");
    if (result.kind !== "ready") throw new Error("expected ready");
    const serialized = JSON.stringify(result.view);
    expect(serialized).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(serialized).not.toContain("@");
    expect(serialized).not.toMatch(/verifier|nonce|credential|provider|cpf/i);
  });
});
