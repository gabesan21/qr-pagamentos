import Image from "next/image";
import Link from "next/link";

import { ArrowRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { MoneyText } from "@/components/ui/money-text";
import { SimpleTabs } from "@/components/ui/simple-tabs";
import { StatCard } from "@/components/ui/stat-card";
import { ProviderStateBadge, StatusBadge, type ProviderState } from "@/components/ui/status-badge";
import type { getDictionary } from "@/i18n/dictionaries";
import type { SupportedLocale } from "@/i18n/locales";
import type {
  MerchantAnalyticsBestSeller,
  MerchantAnalyticsCurrencyAmount,
  MerchantAnalyticsCurrencyLabel,
  MerchantAnalyticsRecentOrder,
  MerchantAnalyticsView,
} from "@/orders/merchant-analytics";
import type { OrderV2Source, OrderV2State } from "@/orders/order-v2";

import { formatCatalogPrice } from "./catalog/price-format";

type Dictionary = ReturnType<typeof getDictionary>;
type CurrencyLabel = MerchantAnalyticsCurrencyLabel;

const PROVIDER_STATE_ORDER: ReadonlyArray<OrderV2State> = [
  "CREATED",
  "PENDING",
  "CONFIRMED",
  "REJECTED",
  "CANCELLED",
  "EXPIRED",
  "INDETERMINATE",
  "REFUNDED",
];
const ORIGIN_ORDER: ReadonlyArray<OrderV2Source> = ["LINK", "STANDALONE", "AD_HOC"];

// Progress bars are rendered without inline styles so they stay inside the
// token boundary. Widths are snapped to the nearest 5 % bucket; the bucket
// strings are literals so Tailwind can scan them.
const PROGRESS_WIDTH_BUCKETS: ReadonlyArray<string> = [
  "w-0",
  "w-[5%]",
  "w-[10%]",
  "w-[15%]",
  "w-[20%]",
  "w-[25%]",
  "w-[30%]",
  "w-[35%]",
  "w-[40%]",
  "w-[45%]",
  "w-[50%]",
  "w-[55%]",
  "w-[60%]",
  "w-[65%]",
  "w-[70%]",
  "w-[75%]",
  "w-[80%]",
  "w-[85%]",
  "w-[90%]",
  "w-[95%]",
  "w-full",
];

function progressWidthClass(percentage: number): string {
  if (percentage <= 0) return PROGRESS_WIDTH_BUCKETS[0];
  const bucket = Math.min(PROGRESS_WIDTH_BUCKETS.length - 1, Math.ceil(percentage / 5));
  return PROGRESS_WIDTH_BUCKETS[bucket];
}

// Rates arrive as exact decimals with exactly four fraction digits ("0.5000");
// the percent rendering shifts the decimal point textually, never through Number.
export function formatDashboardRate(rate: string, locale: SupportedLocale) {
  const [integer, fraction] = rate.split(".");
  const digits = `${integer}${fraction}`;
  const whole = digits.slice(0, integer.length + 2).replace(/^0+(?=\d)/, "");
  const rest = digits.slice(integer.length + 2).padEnd(2, "0").slice(0, 2);
  const decimal = locale === "pt-BR" ? "," : ".";
  return `${whole}${decimal}${rest}%`;
}

function currencyDetail(dictionary: Dictionary, currency: CurrencyLabel) {
  if (currency.label) return currency.label;
  return currency.code === null ? dictionary.merchantDashboardUnlabeledCurrency : null;
}

function formatAmount(dictionary: Dictionary, amount: MerchantAnalyticsCurrencyAmount, locale: SupportedLocale) {
  const formatted = formatCatalogPrice(amount.amount, amount.currency.code, locale);
  return amount.currency.code === null ? `${formatted} (${dictionary.merchantDashboardUnlabeledCurrency})` : formatted;
}

function AmountLines({
  amounts,
  dictionary,
  locale,
}: Readonly<{ amounts: ReadonlyArray<MerchantAnalyticsCurrencyAmount>; dictionary: Dictionary; locale: SupportedLocale }>) {
  return (
    <span className="flex flex-col gap-1">
      {amounts.map((amount) => (
        <MoneyText
          key={`${amount.currency.code ?? "unlabeled"}-${amount.currency.label ?? "unlabeled"}-${amount.amount}`}
          pairLabel={currencyDetail(dictionary, amount.currency) ?? undefined}
          size="large"
          value={formatAmount(dictionary, amount, locale)}
        />
      ))}
    </span>
  );
}

function sourceLabel(dictionary: Dictionary, source: OrderV2Source) {
  if (source === "LINK") return dictionary.merchantDashboardSourceLink;
  if (source === "STANDALONE") return dictionary.merchantDashboardSourceStandalone;
  return dictionary.merchantDashboardSourceAdHoc;
}

function KeyStatsGrid({
  dictionary,
  locale,
  view,
}: Readonly<{ dictionary: Dictionary; locale: SupportedLocale; view: MerchantAnalyticsView }>) {
  const byOrigin = view.byOrigin ?? [];
  const originCaption = ORIGIN_ORDER
    .map((source) => `${sourceLabel(dictionary, source)} ${byOrigin.find((row) => row.source === source)?.count ?? 0}`)
    .join(" · ");

  const confirmedValue = view.confirmedSales.length === 0
    ? <span className="text-muted-foreground">{dictionary.merchantDashboardNoSales}</span>
    : <AmountLines amounts={view.confirmedSales} dictionary={dictionary} locale={locale} />;

  const finalizedValue = view.locallyFinalizedSales.length === 0
    ? <span className="text-muted-foreground">{dictionary.merchantDashboardNoSales}</span>
    : <AmountLines amounts={view.locallyFinalizedSales} dictionary={dictionary} locale={locale} />;

  const conversionValue = view.funnel.conversionRate === null
    ? dictionary.merchantDashboardRateUnavailable
    : formatDashboardRate(view.funnel.conversionRate, locale);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        caption={originCaption}
        label={dictionary.merchantDashboardOrdersInPeriod}
        value={view.ordersInPeriod ?? 0}
      />
      <StatCard label={dictionary.merchantDashboardConfirmedSales} value={confirmedValue} />
      <StatCard label={dictionary.merchantDashboardLocallyFinalizedSales} value={finalizedValue} />
      <StatCard label={dictionary.merchantDashboardFunnelConversionRate} value={conversionValue} />
    </div>
  );
}

// `OrderV2State` members are the upper-case mirror of `ProviderState`
// (`payment-link-order.ts`'s `PAYMENT_LINK_ORDER_STATES`); every member has a
// matching lower-case `ProviderState`, so the cast is total, never partial.
// Local copy, mirroring `src/app/admin/dashboard.tsx`'s comment: the merchant
// surface never imports admin modules.
function toProviderState(state: OrderV2State): ProviderState {
  return state.toLowerCase() as ProviderState;
}

function providerStateBadgeLabels(dictionary: Dictionary): Readonly<Record<ProviderState, string>> {
  return {
    cancelled: dictionary.checkoutStateCancelled,
    confirmed: dictionary.checkoutStateConfirmed,
    created: dictionary.checkoutStateCreated,
    expired: dictionary.checkoutStateExpired,
    indeterminate: dictionary.checkoutStateIndeterminate,
    pending: dictionary.checkoutStatePending,
    refunded: dictionary.checkoutStateRefunded,
    rejected: dictionary.checkoutStateRejected,
  };
}

function ByBreakdownCard({
  dictionary,
  view,
}: Readonly<{ dictionary: Dictionary; view: MerchantAnalyticsView }>) {
  const byState = view.byProviderState ?? [];
  const byOrigin = view.byOrigin ?? [];
  const stateCounts = new Map(byState.map((row) => [row.state, row.count]));
  const originCounts = new Map(byOrigin.map((row) => [row.source, row.count]));
  const stateRows = [
    ...PROVIDER_STATE_ORDER.map((state) => ({ state: state as OrderV2State | null, count: stateCounts.get(state) ?? 0 })),
    { state: null, count: stateCounts.get(null) ?? 0 },
  ];
  const originRows = ORIGIN_ORDER.map((source) => ({ source, count: originCounts.get(source) ?? 0 }));
  const stateMax = Math.max(1, ...stateRows.map((row) => row.count));
  const originMax = Math.max(1, ...originRows.map((row) => row.count));
  const empty = (view.ordersInPeriod ?? 0) === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{dictionary.merchantDashboardByBreakdownHeading}</CardTitle>
        <CardDescription>{dictionary.merchantDashboardByBreakdownDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        {empty ? (
          <EmptyState illustration="orders" title={dictionary.merchantDashboardByBreakdownEmpty} />
        ) : (
          <SimpleTabs
            label={dictionary.merchantDashboardByBreakdownHeading}
            tabs={[
              {
                id: "state",
                label: dictionary.merchantDashboardByState,
                content: (
                  <div className="space-y-2.5 pt-3">
                    {stateRows.map((row) => (
                      <div className="flex items-center gap-3" key={row.state ?? "none"}>
                        <div className="w-36 shrink-0">
                          {row.state === null ? (
                            <StatusBadge label={dictionary.merchantDashboardStateNone} tone="neutral" />
                          ) : (
                            <ProviderStateBadge labels={providerStateBadgeLabels(dictionary)} state={toProviderState(row.state)} />
                          )}
                        </div>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <div className={`h-full bg-primary transition-all ${progressWidthClass((row.count / stateMax) * 100)}`} />
                        </div>
                        <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">{row.count}</span>
                      </div>
                    ))}
                  </div>
                ),
              },
              {
                id: "source",
                label: dictionary.merchantDashboardBySource,
                content: (
                  <div className="space-y-2.5 pt-3">
                    {originRows.map((row) => (
                      <div className="flex items-center gap-3" key={row.source}>
                        <span className="w-36 shrink-0 truncate text-sm font-medium">{sourceLabel(dictionary, row.source)}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <div className={`h-full bg-primary transition-all ${progressWidthClass((row.count / originMax) * 100)}`} />
                        </div>
                        <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">{row.count}</span>
                      </div>
                    ))}
                  </div>
                ),
              },
            ]}
          />
        )}
      </CardContent>
    </Card>
  );
}

function FunnelBar({
  cls,
  count,
  label,
  total,
}: Readonly<{ cls: string; count: number; label: string; total: number }>) {
  const rate = total === 0 ? 0 : Math.round((count / total) * 100);
  return (
    <div className="grid gap-1">
      <div className="flex justify-between">
        <span>{label}</span>
        <span className="tabular-nums">{count} · {rate}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={`h-full transition-all ${cls} ${progressWidthClass(rate)}`} />
      </div>
    </div>
  );
}

function FunnelCard({
  dictionary,
  locale,
  view,
}: Readonly<{ dictionary: Dictionary; locale: SupportedLocale; view: MerchantAnalyticsView }>) {
  const { funnel } = view;
  const total = funnel.converted + funnel.abandoned + funnel.inProgress || 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{dictionary.merchantDashboardFunnelHeading}</CardTitle>
        <CardDescription>{dictionary.merchantDashboardFunnelDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        {funnel.attempts === 0 ? (
          <EmptyState illustration="orders" title={dictionary.merchantDashboardFunnelEmpty} />
        ) : (
          <div className="grid gap-4">
            <FunnelBar
              cls="bg-success"
              count={funnel.converted}
              label={dictionary.merchantDashboardFunnelConverted}
              total={total}
            />
            <FunnelBar
              cls="bg-info"
              count={funnel.inProgress}
              label={dictionary.merchantDashboardFunnelInProgress}
              total={total}
            />
            <FunnelBar
              cls="bg-muted-foreground"
              count={funnel.abandoned}
              label={dictionary.merchantDashboardFunnelAbandoned}
              total={total}
            />
            <div className="grid gap-2 border-t border-border pt-4">
              <div className="flex justify-between">
                <span>{dictionary.merchantDashboardFunnelConversionRate}</span>
                <span className="tabular-nums">
                  {funnel.conversionRate === null ? dictionary.merchantDashboardRateUnavailable : formatDashboardRate(funnel.conversionRate, locale)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>{dictionary.merchantDashboardFunnelAbandonmentRate}</span>
                <span className="tabular-nums">
                  {funnel.abandonmentRate === null ? dictionary.merchantDashboardRateUnavailable : formatDashboardRate(funnel.abandonmentRate, locale)}
                </span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function InventoryStatGrid({
  dictionary,
  view,
}: Readonly<{ dictionary: Dictionary; view: MerchantAnalyticsView }>) {
  const products = view.products ?? { activeCount: 0, archivedCount: 0 };
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label={dictionary.merchantDashboardLinksActiveCount} value={view.paymentLinks.activeCount} />
      <StatCard label={dictionary.merchantDashboardLinksTotalCount} value={view.paymentLinks.totalCount ?? view.paymentLinks.activeCount} />
      <StatCard label={dictionary.merchantDashboardProductsActiveCount} value={products.activeCount} />
      <StatCard label={dictionary.merchantDashboardProductsArchivedCount} value={products.archivedCount} />
    </div>
  );
}

function bestSellerKey(seller: MerchantAnalyticsBestSeller) {
  return seller.id ?? `${seller.titlePtBr}-${seller.titleEn}-${seller.confirmedQuantity}`;
}

function LeadingProductsCard({
  dictionary,
  locale,
  view,
}: Readonly<{ dictionary: Dictionary; locale: SupportedLocale; view: MerchantAnalyticsView }>) {
  return (
    <Card className="lg:col-span-7">
      <CardHeader>
        <CardTitle>{dictionary.merchantDashboardBestSellersHeading}</CardTitle>
        <CardDescription>{dictionary.merchantDashboardBestSellersDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        {view.bestSellers.length === 0 ? (
          <EmptyState illustration="products" title={dictionary.merchantDashboardBestSellersEmpty} />
        ) : (
          <ul className="divide-y divide-border">
            {view.bestSellers.map((seller) => {
              const title = locale === "pt-BR" ? seller.titlePtBr : seller.titleEn;
              const row = (
                <>
                  <Image
                    alt=""
                    aria-hidden
                    className="size-10 shrink-0 rounded-md border object-contain"
                    height={40}
                    src="/application-assets/product-fallback.svg"
                    width={40}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {dictionary.merchantDashboardBestSellerColumnQuantity}:{" "}
                      <span className="tabular-nums">{seller.confirmedQuantity}</span>
                    </span>
                  </span>
                  <AmountLines amounts={seller.revenue} dictionary={dictionary} locale={locale} />
                </>
              );
              return (
                <li key={bestSellerKey(seller)}>
                  {seller.id ? (
                    <Link className="flex items-center gap-3 rounded-md py-2.5 transition-colors hover:bg-muted/50" href={`/catalog/products/${seller.id}`}>
                      {row}
                    </Link>
                  ) : (
                    <div className="flex items-center gap-3 py-2.5">{row}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function RecentOrderBadges({ dictionary, order }: Readonly<{ dictionary: Dictionary; order: MerchantAnalyticsRecentOrder }>) {
  if (order.state === null && order.currentLocalOutcome === null) {
    return <span className="text-sm text-muted-foreground">{dictionary.merchantDashboardStateUnavailable}</span>;
  }
  return (
    <>
      {order.state !== null ? (
        <ProviderStateBadge labels={providerStateBadgeLabels(dictionary)} state={toProviderState(order.state)} />
      ) : null}
      {order.currentLocalOutcome !== null ? (
        <StatusBadge
          label={order.currentLocalOutcome.outcome === "LOCAL_FINALIZED" ? dictionary.merchantDashboardOutcomeFinalized : dictionary.merchantDashboardOutcomeCancelled}
          tone={order.currentLocalOutcome.outcome === "LOCAL_FINALIZED" ? "success" : "danger"}
        />
      ) : null}
    </>
  );
}

function recentOrderKey(order: MerchantAnalyticsRecentOrder) {
  return order.id ?? `${order.createdAt.getTime()}-${order.amount}-${order.paymentLinkV2Identifier ?? "direct"}`;
}

function RecentActivityCard({
  dictionary,
  locale,
  view,
}: Readonly<{ dictionary: Dictionary; locale: SupportedLocale; view: MerchantAnalyticsView }>) {
  const instant = (value: Date) =>
    new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(value);

  return (
    <Card className="lg:col-span-5">
      <CardHeader>
        <CardTitle>{dictionary.merchantDashboardRecentHeading}</CardTitle>
        <CardDescription>{dictionary.merchantDashboardRecentDescription}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col">
        {view.recentActivity.length === 0 ? (
          <EmptyState illustration="orders" title={dictionary.merchantDashboardRecentEmpty} />
        ) : (
          <ul className="flex-1 divide-y divide-border">
            {view.recentActivity.map((order) => {
              const row = (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-xs text-muted-foreground">#{order.id ?? "—"}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {order.payerName ?? dictionary.merchantDashboardPayerUnknown} · {instant(order.createdAt)}
                    </span>
                  </span>
                  <Badge variant="outline">{sourceLabel(dictionary, order.source)}</Badge>
                  <RecentOrderBadges dictionary={dictionary} order={order} />
                  <MoneyText value={formatAmount(dictionary, order, locale)} />
                </>
              );
              return (
                <li key={recentOrderKey(order)}>
                  {order.id ? (
                    <Link className="flex flex-wrap items-center gap-2 rounded-md py-2.5 transition-colors hover:bg-muted/50" href={`/orders/v2/${order.id}`}>
                      {row}
                    </Link>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2 py-2.5">{row}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <Link
          className="mt-3 inline-flex items-center gap-1.5 self-end text-sm font-medium text-primary hover:underline"
          href="/orders"
        >
          {dictionary.merchantDashboardViewAll}
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </CardContent>
    </Card>
  );
}

function FirstRunState({
  dictionary,
}: Readonly<{ dictionary: Dictionary }>) {
  return (
    <div className="space-y-6">
      <Card>
        <EmptyState
          action={
            <Button asChild>
              <Link href="/links/new">{dictionary.merchantDashboardCreateLinkCta}</Link>
            </Button>
          }
          body={dictionary.merchantDashboardEmptyBody}
          illustration="links"
          title={dictionary.merchantDashboardEmptyTitle}
        />
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={dictionary.merchantDashboardOrdersInPeriod} value={0} />
        <StatCard label={dictionary.merchantDashboardConfirmedSales} value={<span className="text-muted-foreground">{dictionary.merchantDashboardNoSales}</span>} />
        <StatCard label={dictionary.merchantDashboardLocallyFinalizedSales} value={<span className="text-muted-foreground">{dictionary.merchantDashboardNoSales}</span>} />
        <StatCard label={dictionary.merchantDashboardFunnelConversionRate} value={dictionary.merchantDashboardRateUnavailable} />
      </div>
    </div>
  );
}

export function MerchantDashboard({
  dictionary,
  locale,
  view,
}: Readonly<{ dictionary: Dictionary; locale: SupportedLocale; view: MerchantAnalyticsView }>) {
  if (view.isFirstRun) {
    return <FirstRunState dictionary={dictionary} />;
  }

  return (
    <div className="space-y-6">
      <KeyStatsGrid dictionary={dictionary} locale={locale} view={view} />
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <ByBreakdownCard dictionary={dictionary} view={view} />
        </div>
        <div className="lg:col-span-5">
          <FunnelCard dictionary={dictionary} locale={locale} view={view} />
        </div>
      </div>
      <InventoryStatGrid dictionary={dictionary} view={view} />
      <div className="grid gap-4 lg:grid-cols-12">
        <LeadingProductsCard dictionary={dictionary} locale={locale} view={view} />
        <RecentActivityCard dictionary={dictionary} locale={locale} view={view} />
      </div>
    </div>
  );
}
