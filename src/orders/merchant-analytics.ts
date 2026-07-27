import "server-only";

import { requireUserPrincipal, type Principal } from "../auth/authorization";
import { getDatabaseClient } from "../db/client";
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import type { OrderV2LocalOutcome, OrderV2Source, OrderV2State } from "./order-v2";
import { orderV2SummarySelect, toOrderV2Summary, type OrderV2Summary, type OrderV2SummaryRow } from "./order-v2-view";

// Durable business definitions are pinned in pop/specs/checkout-and-order-lifecycle.md
// ("Merchant analytics definitions (8.4.1)"); this module only implements them.
export const MERCHANT_ANALYTICS_PERIODS = ["today", "7d", "30d"] as const;
export type MerchantAnalyticsPeriod = (typeof MERCHANT_ANALYTICS_PERIODS)[number];
export const MERCHANT_ANALYTICS_BEST_SELLER_LIMIT = 5;
export const MERCHANT_ANALYTICS_RECENT_LIMIT = 5;

// America/Sao_Paulo has had no DST since 2019, so the fixed UTC−03:00 offset is
// exact for every reportable date; it is never owner-configurable or browser-derived.
const REPORTING_ZONE_OFFSET_MS = -3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Exact-decimal arithmetic on micro-units (10^6), never through Number. Kept in
// sync with order-v2.ts, which this task must not edit.
const FRACTION_DIGITS = 6;
const FRACTION_SCALE = BigInt(10) ** BigInt(FRACTION_DIGITS);
const RATE_DIGITS = 4;
const RATE_SCALE = BigInt(10) ** BigInt(RATE_DIGITS);

export type MerchantAnalyticsCurrencyLabel = Readonly<{
  code: string | null;
  label: string | null;
}>;

export type MerchantAnalyticsCurrencyAmount = Readonly<{
  currency: MerchantAnalyticsCurrencyLabel;
  amount: string;
}>;

export type MerchantAnalyticsSalesGroup = MerchantAnalyticsCurrencyAmount & Readonly<{
  orderCount: number;
}>;

export type MerchantAnalyticsFunnel = Readonly<{
  attempts: number;
  converted: number;
  abandoned: number;
  inProgress: number;
  conversionRate: string | null;
  abandonmentRate: string | null;
}>;

export type MerchantAnalyticsBestSeller = Readonly<{
  titlePtBr: string;
  titleEn: string;
  confirmedQuantity: number;
  revenue: ReadonlyArray<MerchantAnalyticsCurrencyAmount>;
}>;

export type MerchantAnalyticsLinkMetrics = Readonly<{
  identifier: string;
  descriptionPtBr: string | null;
  descriptionEn: string | null;
  attempts: number;
  confirmedOrders: number;
  confirmedVolume: ReadonlyArray<MerchantAnalyticsCurrencyAmount>;
}>;

export type MerchantAnalyticsRecentOrder = Readonly<{
  source: OrderV2Source;
  descriptionPtBr: string | null;
  descriptionEn: string | null;
  amount: string;
  currency: MerchantAnalyticsCurrencyLabel;
  state: OrderV2State | null;
  currentLocalOutcome: Readonly<{ outcome: OrderV2LocalOutcome; createdAt: Date }> | null;
  paymentLinkV2Identifier: string | null;
  createdAt: Date;
  settledAt: Date | null;
}>;

export type MerchantAnalyticsView = Readonly<{
  period: Readonly<{ id: MerchantAnalyticsPeriod; from: Date; to: Date }>;
  confirmedSales: ReadonlyArray<MerchantAnalyticsSalesGroup>;
  locallyFinalizedSales: ReadonlyArray<MerchantAnalyticsSalesGroup>;
  funnel: MerchantAnalyticsFunnel;
  bestSellers: ReadonlyArray<MerchantAnalyticsBestSeller>;
  paymentLinks: Readonly<{ activeCount: number; metrics: ReadonlyArray<MerchantAnalyticsLinkMetrics> }>;
  recentActivity: ReadonlyArray<MerchantAnalyticsRecentOrder>;
}>;

export type MerchantAnalyticsResult =
  | Readonly<{ kind: "ready"; view: MerchantAnalyticsView }>
  | Readonly<{ kind: "invalid-period" }>;

export type CurrencyPairRef = Readonly<{ currencyUuid: string; exchangeCurrencyUuid: string }>;

export type StoredConfirmedOrder = Readonly<{
  paymentLinkV2Id: string | null;
  amount: string;
  pair: CurrencyPairRef;
  lines: ReadonlyArray<Readonly<{ productId: string; quantity: number; unitPrice: string }>>;
}>;

export type StoredAdHocOutcomeOrder = Readonly<{
  amount: string;
  pair: CurrencyPairRef;
  latestOutcome: Readonly<{ outcome: string; createdAt: Date }> | null;
}>;

export type StoredAnalyticsAttempt = Readonly<{
  paymentLinkV2Id: string | null;
  capabilityExpiresAt: Date;
  orderState: string | null;
}>;

export type StoredAnalyticsLink = Readonly<{
  id: string;
  identifier: string;
  descriptionPtBr: string | null;
  descriptionEn: string | null;
  active: boolean;
}>;

export type StoredCurrencyLabel = Readonly<{
  pair: CurrencyPairRef;
  code: string | null;
  label: string | null;
}>;

export type StoredProductTitle = Readonly<{
  id: string;
  titlePtBr: string;
  titleEn: string;
}>;

export type MerchantAnalyticsStore = Readonly<{
  listConfirmedOrders(ownerId: string, from: Date, to: Date): Promise<StoredConfirmedOrder[]>;
  listAdHocOutcomeOrders(ownerId: string, from: Date, to: Date): Promise<StoredAdHocOutcomeOrder[]>;
  listAttempts(ownerId: string, from: Date, to: Date): Promise<StoredAnalyticsAttempt[]>;
  listLinks(ownerId: string): Promise<StoredAnalyticsLink[]>;
  listRecentOrders(ownerId: string, limit: number): Promise<OrderV2Summary[]>;
  listCurrencyLabels(): Promise<StoredCurrencyLabel[]>;
  listProductTitles(ownerId: string, productIds: ReadonlyArray<string>): Promise<StoredProductTitle[]>;
}>;

type Dependencies = Readonly<{ now: () => Date }>;

const activeDependencies: Dependencies = { now: () => new Date() };

// Calendar-day-aligned half-open UTC bounds [from, to) in the reporting zone;
// `to` is the start of the next reporting day, so `today` needs no special case.
export function resolvePeriodBounds(period: MerchantAnalyticsPeriod, now: Date): Readonly<{ from: Date; to: Date }> {
  const days = period === "today" ? 1 : period === "7d" ? 7 : 30;
  const zonedNow = now.getTime() + REPORTING_ZONE_OFFSET_MS;
  const todayStartZoned = Math.floor(zonedNow / DAY_MS) * DAY_MS;
  return {
    from: new Date(todayStartZoned - (days - 1) * DAY_MS - REPORTING_ZONE_OFFSET_MS),
    to: new Date(todayStartZoned + DAY_MS - REPORTING_ZONE_OFFSET_MS),
  };
}

export function parseDecimalUnits(value: string): bigint {
  const [integer, fraction = ""] = value.split(".");
  return BigInt(integer) * FRACTION_SCALE + BigInt((fraction + "000000").slice(0, FRACTION_DIGITS));
}

export function formatDecimalUnits(units: bigint): string {
  const rendered = units.toString().padStart(FRACTION_DIGITS + 1, "0");
  const integer = rendered.slice(0, -FRACTION_DIGITS);
  const fraction = rendered.slice(-FRACTION_DIGITS).replace(/0+$/, "");
  return fraction ? `${integer}.${fraction}` : integer;
}

// Rates are exact decimals truncated to four fraction digits, null on a zero
// denominator; in-progress attempts never enter either denominator.
export function formatRate(numerator: number, denominator: number): string | null {
  if (denominator === 0) return null;
  const scaled = (BigInt(numerator) * RATE_SCALE) / BigInt(denominator);
  const rendered = scaled.toString().padStart(RATE_DIGITS + 1, "0");
  return `${rendered.slice(0, -RATE_DIGITS)}.${rendered.slice(-RATE_DIGITS)}`;
}

export function pairKey(pair: CurrencyPairRef): string {
  return `${pair.currencyUuid}/${pair.exchangeCurrencyUuid}`;
}

export type AccumulatedGroup = { pair: CurrencyPairRef; units: bigint };

export function accumulate(groups: Map<string, AccumulatedGroup>, pair: CurrencyPairRef, units: bigint) {
  const key = pairKey(pair);
  const existing = groups.get(key);
  groups.set(key, { pair, units: (existing?.units ?? BigInt(0)) + units });
}

export function labelFor(labels: Map<string, StoredCurrencyLabel>, pair: CurrencyPairRef): MerchantAnalyticsCurrencyLabel {
  const stored = labels.get(pairKey(pair));
  return { code: stored?.code ?? null, label: stored?.label ?? null };
}

type SortedGroup = Readonly<{ pairKey: string; currency: MerchantAnalyticsCurrencyLabel; units: bigint }>;

// Deterministic order: amount desc, redacted code asc (absent last), then the
// internal pair identity asc (never exposed).
function sortedGroups(groups: Map<string, AccumulatedGroup>, labels: Map<string, StoredCurrencyLabel>): SortedGroup[] {
  return [...groups.entries()]
    .map(([key, group]) => ({ pairKey: key, currency: labelFor(labels, group.pair), units: group.units }))
    .sort((a, b) => {
      if (a.units !== b.units) return a.units > b.units ? -1 : 1;
      if (a.currency.code !== b.currency.code) {
        if (a.currency.code === null) return 1;
        if (b.currency.code === null) return -1;
        return a.currency.code.localeCompare(b.currency.code);
      }
      return a.pairKey.localeCompare(b.pairKey);
    });
}

export function toAmounts(groups: Map<string, AccumulatedGroup>, labels: Map<string, StoredCurrencyLabel>): MerchantAnalyticsCurrencyAmount[] {
  return sortedGroups(groups, labels).map((group) => ({ currency: group.currency, amount: formatDecimalUnits(group.units) }));
}

export function toSalesGroups(
  groups: Map<string, AccumulatedGroup>,
  counts: Map<string, number>,
  labels: Map<string, StoredCurrencyLabel>,
): MerchantAnalyticsSalesGroup[] {
  return sortedGroups(groups, labels).map((group) => ({
    currency: group.currency,
    amount: formatDecimalUnits(group.units),
    orderCount: counts.get(group.pairKey) ?? 0,
  }));
}

export function createMerchantAnalyticsService(store: MerchantAnalyticsStore, dependencies: Dependencies = activeDependencies) {
  return {
    async getForOwner(actor: Principal, period: unknown): Promise<MerchantAnalyticsResult> {
      requireUserPrincipal(actor);
      if (typeof period !== "string" || !(MERCHANT_ANALYTICS_PERIODS as readonly string[]).includes(period)) {
        return { kind: "invalid-period" };
      }
      const periodId = period as MerchantAnalyticsPeriod;
      const now = dependencies.now();
      const bounds = resolvePeriodBounds(periodId, now);

      const [confirmedOrders, adHocOrders, attempts, links, recentOrders, currencyLabels] = await Promise.all([
        store.listConfirmedOrders(actor.id, bounds.from, bounds.to),
        store.listAdHocOutcomeOrders(actor.id, bounds.from, bounds.to),
        store.listAttempts(actor.id, bounds.from, bounds.to),
        store.listLinks(actor.id),
        store.listRecentOrders(actor.id, MERCHANT_ANALYTICS_RECENT_LIMIT),
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
      const attemptsPerLink = new Map<string, number>();
      for (const attempt of attempts) {
        // Standalone attempts hold no link and never enter per-link metrics.
        if (attempt.paymentLinkV2Id) attemptsPerLink.set(attempt.paymentLinkV2Id, (attemptsPerLink.get(attempt.paymentLinkV2Id) ?? 0) + 1);
        if (attempt.orderState === "CONFIRMED") converted += 1;
        else if (attempt.capabilityExpiresAt <= now) abandoned += 1;
      }
      const inProgress = attempts.length - converted - abandoned;
      const rateDenominator = converted + abandoned;
      const funnel: MerchantAnalyticsFunnel = {
        attempts: attempts.length,
        converted,
        abandoned,
        inProgress,
        conversionRate: formatRate(converted, rateDenominator),
        abandonmentRate: formatRate(abandoned, rateDenominator),
      };

      const confirmedPerLink = new Map<string, { count: number; groups: Map<string, AccumulatedGroup> }>();
      const quantityPerProduct = new Map<string, number>();
      const revenuePerProduct = new Map<string, Map<string, AccumulatedGroup>>();
      const productIds = new Set<string>();
      for (const order of confirmedOrders) {
        if (order.paymentLinkV2Id) {
          const entry = confirmedPerLink.get(order.paymentLinkV2Id) ?? { count: 0, groups: new Map() };
          entry.count += 1;
          accumulate(entry.groups, order.pair, parseDecimalUnits(order.amount));
          confirmedPerLink.set(order.paymentLinkV2Id, entry);
        }
        for (const line of order.lines) {
          productIds.add(line.productId);
          quantityPerProduct.set(line.productId, (quantityPerProduct.get(line.productId) ?? 0) + line.quantity);
          const revenue = revenuePerProduct.get(line.productId) ?? new Map();
          accumulate(revenue, order.pair, parseDecimalUnits(line.unitPrice) * BigInt(line.quantity));
          revenuePerProduct.set(line.productId, revenue);
        }
      }
      const titles = new Map((await store.listProductTitles(actor.id, [...productIds])).map((title) => [title.id, title]));
      const bestSellers = [...quantityPerProduct.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, MERCHANT_ANALYTICS_BEST_SELLER_LIMIT)
        .map(([productId, confirmedQuantity]) => ({
          titlePtBr: titles.get(productId)?.titlePtBr ?? "",
          titleEn: titles.get(productId)?.titleEn ?? "",
          confirmedQuantity,
          revenue: toAmounts(revenuePerProduct.get(productId) ?? new Map(), labels),
        }));

      const linkMetrics = links
        .filter((link) => (attemptsPerLink.get(link.id) ?? 0) > 0 || confirmedPerLink.has(link.id))
        .map((link) => ({
          identifier: link.identifier,
          descriptionPtBr: link.descriptionPtBr,
          descriptionEn: link.descriptionEn,
          attempts: attemptsPerLink.get(link.id) ?? 0,
          confirmedOrders: confirmedPerLink.get(link.id)?.count ?? 0,
          confirmedVolume: toAmounts(confirmedPerLink.get(link.id)?.groups ?? new Map(), labels),
        }))
        .sort((a, b) => b.confirmedOrders - a.confirmedOrders || b.attempts - a.attempts || a.identifier.localeCompare(b.identifier));

      const recentActivity = recentOrders.map((order) => ({
        source: order.source,
        descriptionPtBr: order.descriptionPtBr,
        descriptionEn: order.descriptionEn,
        amount: order.amount,
        currency: labelFor(labels, { currencyUuid: order.currencyUuid, exchangeCurrencyUuid: order.exchangeCurrencyUuid }),
        state: order.state,
        currentLocalOutcome: order.currentLocalOutcome
          ? { outcome: order.currentLocalOutcome.outcome, createdAt: order.currentLocalOutcome.createdAt }
          : null,
        paymentLinkV2Identifier: order.paymentLinkV2Identifier,
        createdAt: order.createdAt,
        settledAt: order.settledAt,
      }));

      return {
        kind: "ready",
        view: {
          period: { id: periodId, from: bounds.from, to: bounds.to },
          confirmedSales,
          locallyFinalizedSales,
          funnel,
          bestSellers,
          paymentLinks: { activeCount: links.filter((link) => link.active).length, metrics: linkMetrics },
          recentActivity,
        },
      };
    },
  };
}

const confirmedSelect = {
  paymentLinkV2Id: true,
  amount: true,
  currencyUuid: true,
  exchangeCurrencyUuid: true,
  lines: { select: { productId: true, quantity: true, unitPrice: true } },
} satisfies Prisma.OrderV2Select;

type PrismaConfirmedRow = {
  paymentLinkV2Id: string | null;
  amount: string;
  currencyUuid: string;
  exchangeCurrencyUuid: string;
  lines: Array<{ productId: string; quantity: number; unitPrice: string }>;
};

export function createPrismaMerchantAnalyticsStore(prisma: PrismaClient): MerchantAnalyticsStore {
  return {
    // Provider-confirmed sales are (LINK ∪ STANDALONE) CONFIRMED in-period;
    // locally finalized stays AD_HOC-only and the two are never merged.
    async listConfirmedOrders(ownerId, from, to) {
      const rows = await prisma.orderV2.findMany({
        where: { ownerId, source: { in: ["LINK", "STANDALONE"] }, state: "CONFIRMED", settledAt: { gte: from, lt: to } },
        select: confirmedSelect,
      });
      return (rows as PrismaConfirmedRow[]).map((row) => ({
        paymentLinkV2Id: row.paymentLinkV2Id,
        amount: row.amount,
        pair: { currencyUuid: row.currencyUuid, exchangeCurrencyUuid: row.exchangeCurrencyUuid },
        lines: row.lines,
      }));
    },
    // The `some` pre-filter bounds the read; the service applies the
    // latest-entry-is-current rule over the take-1 outcome selection.
    async listAdHocOutcomeOrders(ownerId, from, to) {
      const rows = await prisma.orderV2.findMany({
        where: {
          ownerId,
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
    // The funnel reads both attempt tables; each order is attempt-bound in
    // exactly one of them, so the union never double-counts.
    async listAttempts(ownerId, from, to) {
      const [linkRows, standaloneRows] = await Promise.all([
        prisma.checkoutAttemptV2.findMany({
          where: { ownerId, createdAt: { gte: from, lt: to } },
          select: { paymentLinkV2Id: true, capabilityExpiresAt: true, order: { select: { state: true } } },
        }),
        prisma.standaloneCheckoutAttempt.findMany({
          where: { ownerId, createdAt: { gte: from, lt: to } },
          select: { capabilityExpiresAt: true, order: { select: { state: true } } },
        }),
      ]);
      return [
        ...linkRows.map((row) => ({ paymentLinkV2Id: row.paymentLinkV2Id as string | null, capabilityExpiresAt: row.capabilityExpiresAt, orderState: row.order.state })),
        ...standaloneRows.map((row) => ({ paymentLinkV2Id: null, capabilityExpiresAt: row.capabilityExpiresAt, orderState: row.order.state })),
      ];
    },
    async listLinks(ownerId) {
      return prisma.paymentLinkV2.findMany({
        where: { ownerId },
        select: { id: true, identifier: true, descriptionPtBr: true, descriptionEn: true, active: true },
      });
    },
    async listRecentOrders(ownerId, limit) {
      const rows = await prisma.orderV2.findMany({
        where: { ownerId },
        orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
        take: limit,
        select: orderV2SummarySelect,
      });
      return rows.map((row) => toOrderV2Summary(row as OrderV2SummaryRow));
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
    async listProductTitles(ownerId, productIds) {
      if (productIds.length === 0) return [];
      return prisma.product.findMany({
        where: { ownerId, id: { in: [...productIds] } },
        select: { id: true, titlePtBr: true, titleEn: true },
      });
    },
  };
}

export function getMerchantAnalyticsService() {
  return createMerchantAnalyticsService(createPrismaMerchantAnalyticsStore(getDatabaseClient()));
}
