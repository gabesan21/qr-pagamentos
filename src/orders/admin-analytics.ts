import "server-only";

import { ForbiddenError, type Principal } from "../auth/authorization";
import { getDatabaseClient } from "../db/client";
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import type { OrderV2Source, OrderV2State } from "./order-v2";
import {
  accumulate,
  formatDecimalUnits,
  formatRate,
  MERCHANT_ANALYTICS_PERIODS,
  pairKey,
  parseDecimalUnits,
  resolvePeriodBounds,
  toAmounts,
  toSalesGroups,
  type AccumulatedGroup,
  type CurrencyPairRef,
  type MerchantAnalyticsBestSeller,
  type MerchantAnalyticsCurrencyAmount,
  type MerchantAnalyticsFunnel,
  type MerchantAnalyticsPeriod,
  type MerchantAnalyticsSalesGroup,
  type StoredAdHocOutcomeOrder,
  type StoredAnalyticsAttempt,
  type StoredCurrencyLabel,
  type StoredProductTitle,
} from "./merchant-analytics";

// Durable business definitions are pinned in pop/specs/administrative-foundation.md
// ("Administrator analytics definitions (10.1.1)"); the sales, funnel, currency,
// and period semantics are the 8.4.1 definitions reused globally. This module
// only implements them — no HTTP route, no mutation surface.
export const ADMIN_ANALYTICS_PERIODS = MERCHANT_ANALYTICS_PERIODS;
export type AdminAnalyticsPeriod = MerchantAnalyticsPeriod;
export const ADMIN_ANALYTICS_LEADERBOARD_LIMIT = 5;

export type AdminAnalyticsCurrencyAmount = MerchantAnalyticsCurrencyAmount;
export type AdminAnalyticsSalesGroup = MerchantAnalyticsSalesGroup;
export type AdminAnalyticsFunnel = MerchantAnalyticsFunnel;
export type AdminAnalyticsTopProduct = MerchantAnalyticsBestSeller;

export type AdminAnalyticsUserCounts = Readonly<{
  registeredTotal: number;
  activeNow: number;
  deletedTotal: number;
}>;

export type AdminAnalyticsOrderCounts = Readonly<{
  createdInPeriod: number;
  bySource: ReadonlyArray<Readonly<{ source: OrderV2Source; count: number }>>;
  byState: ReadonlyArray<Readonly<{ state: OrderV2State | null; count: number }>>;
}>;

// The only per-owner identity the projection ever exposes; internal UUIDs,
// email, credential state, and storefront data stay behind the store boundary.
export type AdminAnalyticsOwnerRef = Readonly<{
  username: string;
  deleted: boolean;
}>;

export type AdminAnalyticsTopOwner = Readonly<{
  owner: AdminAnalyticsOwnerRef;
  confirmedOrders: number;
  confirmedVolume: ReadonlyArray<AdminAnalyticsCurrencyAmount>;
}>;

export type AdminAnalyticsView = Readonly<{
  period: Readonly<{ id: AdminAnalyticsPeriod; from: Date; to: Date }>;
  users: AdminAnalyticsUserCounts;
  orders: AdminAnalyticsOrderCounts;
  confirmedSales: ReadonlyArray<AdminAnalyticsSalesGroup>;
  locallyFinalizedSales: ReadonlyArray<AdminAnalyticsSalesGroup>;
  funnel: AdminAnalyticsFunnel;
  paymentLinks: Readonly<{ total: number; activeCount: number }>;
  products: Readonly<{ activeCount: number; archivedCount: number }>;
  topOwners: ReadonlyArray<AdminAnalyticsTopOwner>;
  topProducts: ReadonlyArray<AdminAnalyticsTopProduct>;
}>;

export type AdminAnalyticsResult =
  | Readonly<{ kind: "ready"; view: AdminAnalyticsView }>
  | Readonly<{ kind: "invalid-period" }>;

export type StoredAdminConfirmedOrder = Readonly<{
  ownerId: string;
  amount: string;
  pair: CurrencyPairRef;
  lines: ReadonlyArray<Readonly<{ productId: string; quantity: number; unitPrice: string }>>;
}>;

export type StoredOwnerIdentity = Readonly<{
  id: string;
  username: string;
  deleted: boolean;
}>;

export type AdminAnalyticsStore = Readonly<{
  countUsers(): Promise<AdminAnalyticsUserCounts>;
  countOrdersBySourceAndState(from: Date, to: Date): Promise<ReadonlyArray<Readonly<{ source: OrderV2Source; state: OrderV2State | null; count: number }>>>;
  countLinks(): Promise<Readonly<{ total: number; activeCount: number }>>;
  countProducts(): Promise<Readonly<{ activeCount: number; archivedCount: number }>>;
  listConfirmedOrders(from: Date, to: Date): Promise<StoredAdminConfirmedOrder[]>;
  listAdHocOutcomeOrders(from: Date, to: Date): Promise<StoredAdHocOutcomeOrder[]>;
  listAttempts(from: Date, to: Date): Promise<StoredAnalyticsAttempt[]>;
  listCurrencyLabels(): Promise<StoredCurrencyLabel[]>;
  listProductTitles(productIds: ReadonlyArray<string>): Promise<StoredProductTitle[]>;
  listOwnerIdentities(ownerIds: ReadonlyArray<string>): Promise<StoredOwnerIdentity[]>;
}>;

type Dependencies = Readonly<{ now: () => Date }>;

const activeDependencies: Dependencies = { now: () => new Date() };

// Denial precedes any I/O and every denied principal — a merchant, a disabled
// administrator, or an unresolved role — shares the one forbidden outcome,
// mirroring the administration.ts posture.
function requireAdminPrincipal(actor: Principal) {
  if (actor.role !== "ADMIN" || actor.status !== "ACTIVE") throw new ForbiddenError("Administrator access is required");
}

// Deterministic order: count descending, then the grouping key ascending with
// the stateless (null) group last.
function compareNullableState(a: OrderV2State | null, b: OrderV2State | null) {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a.localeCompare(b);
}

export function createAdminAnalyticsService(store: AdminAnalyticsStore, dependencies: Dependencies = activeDependencies) {
  return {
    async getGlobal(actor: Principal, period: unknown): Promise<AdminAnalyticsResult> {
      requireAdminPrincipal(actor);
      if (typeof period !== "string" || !(ADMIN_ANALYTICS_PERIODS as readonly string[]).includes(period)) {
        return { kind: "invalid-period" };
      }
      const periodId = period as AdminAnalyticsPeriod;
      const now = dependencies.now();
      const bounds = resolvePeriodBounds(periodId, now);

      const [users, orderCounts, links, products, confirmedOrders, adHocOrders, attempts, currencyLabels] = await Promise.all([
        store.countUsers(),
        store.countOrdersBySourceAndState(bounds.from, bounds.to),
        store.countLinks(),
        store.countProducts(),
        store.listConfirmedOrders(bounds.from, bounds.to),
        store.listAdHocOutcomeOrders(bounds.from, bounds.to),
        store.listAttempts(bounds.from, bounds.to),
        store.listCurrencyLabels(),
      ]);
      const labels = new Map(currencyLabels.map((entry) => [pairKey(entry.pair), entry]));

      const confirmedGroups = new Map<string, AccumulatedGroup>();
      const confirmedCounts = new Map<string, number>();
      for (const order of confirmedOrders) {
        accumulate(confirmedGroups, order.pair, parseDecimalUnits(order.amount));
        confirmedCounts.set(pairKey(order.pair), (confirmedCounts.get(pairKey(order.pair)) ?? 0) + 1);
      }
      const confirmedSales = toSalesGroups(confirmedGroups, confirmedCounts, labels);

      // Latest-entry-is-current: only AD_HOC orders whose newest local outcome
      // is LOCAL_FINALIZED inside the period count, never merged with confirmed sales.
      const finalizedGroups = new Map<string, AccumulatedGroup>();
      const finalizedCounts = new Map<string, number>();
      for (const order of adHocOrders) {
        const outcome = order.latestOutcome;
        if (!outcome || outcome.outcome !== "LOCAL_FINALIZED") continue;
        if (outcome.createdAt < bounds.from || outcome.createdAt >= bounds.to) continue;
        accumulate(finalizedGroups, order.pair, parseDecimalUnits(order.amount));
        finalizedCounts.set(pairKey(order.pair), (finalizedCounts.get(pairKey(order.pair)) ?? 0) + 1);
      }
      const locallyFinalizedSales = toSalesGroups(finalizedGroups, finalizedCounts, labels);

      let converted = 0;
      let abandoned = 0;
      for (const attempt of attempts) {
        if (attempt.orderState === "CONFIRMED") converted += 1;
        else if (attempt.capabilityExpiresAt <= now) abandoned += 1;
      }
      const inProgress = attempts.length - converted - abandoned;
      const rateDenominator = converted + abandoned;
      const funnel: AdminAnalyticsFunnel = {
        attempts: attempts.length,
        converted,
        abandoned,
        inProgress,
        conversionRate: formatRate(converted, rateDenominator),
        abandonmentRate: formatRate(abandoned, rateDenominator),
      };

      const bySourceMap = new Map<OrderV2Source, number>();
      const byStateMap = new Map<OrderV2State | null, number>();
      let createdInPeriod = 0;
      for (const row of orderCounts) {
        createdInPeriod += row.count;
        bySourceMap.set(row.source, (bySourceMap.get(row.source) ?? 0) + row.count);
        byStateMap.set(row.state, (byStateMap.get(row.state) ?? 0) + row.count);
      }
      const orders: AdminAnalyticsOrderCounts = {
        createdInPeriod,
        bySource: [...bySourceMap.entries()]
          .map(([source, count]) => ({ source, count }))
          .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source)),
        byState: [...byStateMap.entries()]
          .map(([state, count]) => ({ state, count }))
          .sort((a, b) => b.count - a.count || compareNullableState(a.state, b.state)),
      };

      // History is durable: soft-deleted owners stay inside every aggregate,
      // and leaderboard rows carry the deletion marker so the dashboard can
      // render withdrawn owners distinctly.
      const confirmedPerOwner = new Map<string, { count: number; groups: Map<string, AccumulatedGroup> }>();
      for (const order of confirmedOrders) {
        const entry = confirmedPerOwner.get(order.ownerId) ?? { count: 0, groups: new Map() };
        entry.count += 1;
        accumulate(entry.groups, order.pair, parseDecimalUnits(order.amount));
        confirmedPerOwner.set(order.ownerId, entry);
      }
      const ownerIdentities = new Map((await store.listOwnerIdentities([...confirmedPerOwner.keys()])).map((owner) => [owner.id, owner]));
      const topOwners = [...confirmedPerOwner.entries()]
        .flatMap(([ownerId, entry]) => {
          const identity = ownerIdentities.get(ownerId);
          // Fail closed: an unresolved identity never blocks the aggregates;
          // it only leaves the leaderboard.
          return identity ? [{ identity, count: entry.count, groups: entry.groups }] : [];
        })
        .sort((a, b) => b.count - a.count || a.identity.username.localeCompare(b.identity.username))
        .slice(0, ADMIN_ANALYTICS_LEADERBOARD_LIMIT)
        .map(({ identity, count, groups }) => ({
          owner: { username: identity.username, deleted: identity.deleted },
          confirmedOrders: count,
          confirmedVolume: toAmounts(groups, labels),
        }));

      const quantityPerProduct = new Map<string, number>();
      const revenuePerProduct = new Map<string, Map<string, AccumulatedGroup>>();
      const productIds = new Set<string>();
      for (const order of confirmedOrders) {
        for (const line of order.lines) {
          productIds.add(line.productId);
          quantityPerProduct.set(line.productId, (quantityPerProduct.get(line.productId) ?? 0) + line.quantity);
          const revenue = revenuePerProduct.get(line.productId) ?? new Map();
          accumulate(revenue, order.pair, parseDecimalUnits(line.unitPrice) * BigInt(line.quantity));
          revenuePerProduct.set(line.productId, revenue);
        }
      }
      const titles = new Map((await store.listProductTitles([...productIds])).map((title) => [title.id, title]));
      const topProducts = [...quantityPerProduct.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, ADMIN_ANALYTICS_LEADERBOARD_LIMIT)
        .map(([productId, confirmedQuantity]) => ({
          titlePtBr: titles.get(productId)?.titlePtBr ?? "",
          titleEn: titles.get(productId)?.titleEn ?? "",
          confirmedQuantity,
          revenue: toAmounts(revenuePerProduct.get(productId) ?? new Map(), labels),
        }));

      return {
        kind: "ready",
        view: {
          period: { id: periodId, from: bounds.from, to: bounds.to },
          users,
          orders,
          confirmedSales,
          locallyFinalizedSales,
          funnel,
          paymentLinks: links,
          products,
          topOwners,
          topProducts,
        },
      };
    },
  };
}

const confirmedSelect = {
  ownerId: true,
  amount: true,
  currencyUuid: true,
  exchangeCurrencyUuid: true,
  lines: { select: { productId: true, quantity: true, unitPrice: true } },
} satisfies Prisma.OrderV2Select;

type PrismaConfirmedRow = {
  ownerId: string;
  amount: string;
  currencyUuid: string;
  exchangeCurrencyUuid: string;
  lines: Array<{ productId: string; quantity: number; unitPrice: string }>;
};

export function createPrismaAdminAnalyticsStore(prisma: PrismaClient): AdminAnalyticsStore {
  return {
    // Cheap full-table counts: registered includes soft-deleted rows, activeNow
    // is the double condition (status ACTIVE and no deletion marker), and
    // deletedTotal rides the 10.3.1 marker alone.
    async countUsers() {
      const [registeredTotal, activeNow, deletedTotal] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { status: "ACTIVE", deletedAt: null } }),
        prisma.user.count({ where: { deletedAt: { not: null } } }),
      ]);
      return { registeredTotal, activeNow, deletedTotal };
    },
    async countOrdersBySourceAndState(from, to) {
      const rows = await prisma.orderV2.groupBy({
        by: ["source", "state"],
        where: { createdAt: { gte: from, lt: to } },
        _count: true,
      });
      return rows.map((row) => ({ source: row.source as OrderV2Source, state: row.state as OrderV2State | null, count: row._count }));
    },
    async countLinks() {
      const [total, activeCount] = await Promise.all([
        prisma.paymentLinkV2.count(),
        prisma.paymentLinkV2.count({ where: { active: true } }),
      ]);
      return { total, activeCount };
    },
    async countProducts() {
      const [activeCount, archivedCount] = await Promise.all([
        prisma.product.count({ where: { active: true } }),
        prisma.product.count({ where: { archivedAt: { not: null } } }),
      ]);
      return { activeCount, archivedCount };
    },
    // Provider-confirmed sales are (LINK ∪ STANDALONE) CONFIRMED in-period;
    // locally finalized stays AD_HOC-only and the two are never merged.
    async listConfirmedOrders(from, to) {
      const rows = await prisma.orderV2.findMany({
        where: { source: { in: ["LINK", "STANDALONE"] }, state: "CONFIRMED", settledAt: { gte: from, lt: to } },
        select: confirmedSelect,
      });
      return (rows as PrismaConfirmedRow[]).map((row) => ({
        ownerId: row.ownerId,
        amount: row.amount,
        pair: { currencyUuid: row.currencyUuid, exchangeCurrencyUuid: row.exchangeCurrencyUuid },
        lines: row.lines,
      }));
    },
    // The `some` pre-filter bounds the read; the service applies the
    // latest-entry-is-current rule over the take-1 outcome selection.
    async listAdHocOutcomeOrders(from, to) {
      const rows = await prisma.orderV2.findMany({
        where: {
          source: "AD_HOC",
          localOutcomes: { some: { outcome: "LOCAL_FINALIZED", createdAt: { gte: from, lt: to } } },
        },
        select: {
          amount: true,
          currencyUuid: true,
          exchangeCurrencyUuid: true,
          localOutcomes: { select: { outcome: true, createdAt: true }, orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }], take: 1 },
        },
      });
      return rows.map((row) => ({
        amount: row.amount,
        pair: { currencyUuid: row.currencyUuid, exchangeCurrencyUuid: row.exchangeCurrencyUuid },
        latestOutcome: row.localOutcomes[0] ?? null,
      }));
    },
    // The funnel reads both attempt tables globally; each order is
    // attempt-bound in exactly one of them, so the union never double-counts.
    async listAttempts(from, to) {
      const [linkRows, standaloneRows] = await Promise.all([
        prisma.checkoutAttemptV2.findMany({
          where: { createdAt: { gte: from, lt: to } },
          select: { paymentLinkV2Id: true, capabilityExpiresAt: true, order: { select: { state: true } } },
        }),
        prisma.standaloneCheckoutAttempt.findMany({
          where: { createdAt: { gte: from, lt: to } },
          select: { capabilityExpiresAt: true, order: { select: { state: true } } },
        }),
      ]);
      return [
        ...linkRows.map((row) => ({ paymentLinkV2Id: row.paymentLinkV2Id as string | null, capabilityExpiresAt: row.capabilityExpiresAt, orderState: row.order.state })),
        ...standaloneRows.map((row) => ({ paymentLinkV2Id: null, capabilityExpiresAt: row.capabilityExpiresAt, orderState: row.order.state })),
      ];
    },
    // The registry is global configuration, read-only; labels never expose the
    // underlying provider UUIDs.
    async listCurrencyLabels() {
      const pairs = await prisma.catalogCurrencyPair.findMany({
        select: { currencyUuid: true, exchangeCurrencyUuid: true, label: true, supportedExchangeCurrency: { select: { code: true } } },
      });
      return pairs.map((pair) => ({
        pair: { currencyUuid: pair.currencyUuid, exchangeCurrencyUuid: pair.exchangeCurrencyUuid },
        code: pair.supportedExchangeCurrency?.code ?? null,
        label: pair.label,
      }));
    },
    // Titles come from the current catalog rows globally; archived or
    // deactivated products still appear because quantity and revenue come
    // from the immutable order-line snapshots.
    async listProductTitles(productIds) {
      if (productIds.length === 0) return [];
      return prisma.product.findMany({
        where: { id: { in: [...productIds] } },
        select: { id: true, titlePtBr: true, titleEn: true },
      });
    },
    // Leaderboard identity is exactly username plus the deletion marker;
    // email and every other account field are never selected.
    async listOwnerIdentities(ownerIds) {
      if (ownerIds.length === 0) return [];
      const rows = await prisma.user.findMany({
        where: { id: { in: [...ownerIds] } },
        select: { id: true, username: true, deletedAt: true },
      });
      return rows.map((row) => ({ id: row.id, username: row.username, deleted: row.deletedAt !== null }));
    },
  };
}

export function getAdminAnalyticsService() {
  return createAdminAnalyticsService(createPrismaAdminAnalyticsStore(getDatabaseClient()));
}
