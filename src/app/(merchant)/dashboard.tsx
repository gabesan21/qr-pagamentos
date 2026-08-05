import Image from "next/image";
import Link from "next/link";

import { ArrowRight } from "lucide-react";

import { orderStateLabel } from "@/app/orders/order-views";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { MoneyText } from "@/components/ui/money-text";
import { SimpleTabs } from "@/components/ui/simple-tabs";
import { StatCard } from "@/components/ui/stat-card";
import type { getDictionary } from "@/i18n/dictionaries";
import type { SupportedLocale } from "@/i18n/locales";
import type {
  MerchantAnalyticsCurrencyAmount,
  MerchantAnalyticsCurrencyLabel,
  MerchantAnalyticsPeriod,
  MerchantAnalyticsRecentOrder,
  MerchantAnalyticsSalesGroup,
  MerchantAnalyticsView,
} from "@/orders/merchant-analytics";

import { formatCatalogPrice } from "./catalog/price-format";

type Dictionary = ReturnType<typeof getDictionary>;
type CurrencyLabel = MerchantAnalyticsCurrencyLabel;

const DASHBOARD_PERIODS: ReadonlyArray<{
  id: MerchantAnalyticsPeriod;
  label: (dictionary: Dictionary) => string;
}> = [
  { id: "today", label: (dictionary) => dictionary.merchantDashboardPeriodToday },
  { id: "7d", label: (dictionary) => dictionary.merchantDashboardPeriod7d },
  { id: "30d", label: (dictionary) => dictionary.merchantDashboardPeriod30d },
];

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

export function DashboardPeriodNavigation({
  current,
  dictionary,
}: Readonly<{ current: MerchantAnalyticsPeriod; dictionary: Dictionary }>) {
  return (
    <nav aria-label={dictionary.merchantDashboardPeriodLabel} className="merchant-dashboard__periods">
      {DASHBOARD_PERIODS.map((period) =>
        period.id === current ? (
          <span
            aria-current="page"
            className="merchant-dashboard__period merchant-dashboard__period--current"
            key={period.id}
          >
            {period.label(dictionary)}
          </span>
        ) : (
          <Link className="merchant-dashboard__period" href={`/?period=${period.id}`} key={period.id}>
            {period.label(dictionary)}
          </Link>
        ),
      )}
    </nav>
  );
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
    <span className="merchant-dashboard__amount-lines">
      {amounts.map((amount) => (
        <MoneyText
          className="merchant-dashboard__amount"
          key={`${amount.currency.code ?? "unlabeled"}-${amount.currency.label ?? "unlabeled"}-${amount.amount}`}
          size="large"
          value={formatAmount(dictionary, amount, locale)}
        />
      ))}
    </span>
  );
}

function SalesGroups({
  dictionary,
  emptyLabel,
  groups,
  heading,
  locale,
}: Readonly<{
  dictionary: Dictionary;
  emptyLabel: string;
  groups: ReadonlyArray<MerchantAnalyticsSalesGroup>;
  heading: string;
  locale: SupportedLocale;
}>) {
  return (
    <section className="merchant-dashboard__group">
      <h3>{heading}</h3>
      {groups.length === 0 ? (
        <EmptyState illustration="orders" title={emptyLabel} />
      ) : (
        <ul className="merchant-dashboard__amounts">
          {groups.map((group) => (
            <li key={`${group.currency.code ?? "unlabeled"}-${group.currency.label ?? "unlabeled"}-${group.amount}`}>
              <MoneyText
                className="merchant-dashboard__amount"
                pairLabel={currencyDetail(dictionary, group.currency) ?? undefined}
                size="large"
                value={formatAmount(dictionary, group, locale)}
              />
              <span className="text-sm text-muted-foreground">
                <span className="tabular-nums">{group.orderCount}</span> {dictionary.merchantDashboardOrderCountLabel}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function KeyStatsGrid({
  dictionary,
  locale,
  view,
}: Readonly<{ dictionary: Dictionary; locale: SupportedLocale; view: MerchantAnalyticsView }>) {
  const confirmedOrders = view.confirmedSales.reduce((sum, group) => sum + group.orderCount, 0);
  const finalizedOrders = view.locallyFinalizedSales.reduce((sum, group) => sum + group.orderCount, 0);

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
    <div className="merchant-dashboard__stat-grid merchant-dashboard__stat-grid--4">
      <StatCard
        label={dictionary.merchantDashboardCheckoutAttempts}
        value={view.funnel.attempts}
      />
      <StatCard
        caption={`${confirmedOrders} ${dictionary.merchantDashboardOrderCountLabel}`}
        label={dictionary.merchantDashboardConfirmedSales}
        value={confirmedValue}
      />
      <StatCard
        caption={`${finalizedOrders} ${dictionary.merchantDashboardOrderCountLabel}`}
        label={dictionary.merchantDashboardLocallyFinalizedSales}
        value={finalizedValue}
      />
      <StatCard
        label={dictionary.merchantDashboardFunnelConversionRate}
        value={conversionValue}
      />
    </div>
  );
}

function SalesBreakdownCard({
  dictionary,
  locale,
  view,
}: Readonly<{ dictionary: Dictionary; locale: SupportedLocale; view: MerchantAnalyticsView }>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{dictionary.merchantDashboardSalesHeading}</CardTitle>
        <CardDescription>{dictionary.merchantDashboardSalesDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <SimpleTabs
          label={dictionary.merchantDashboardSalesHeading}
          tabs={[
            {
              id: "confirmed",
              label: dictionary.merchantDashboardConfirmedSales,
              content: (
                <SalesGroups
                  dictionary={dictionary}
                  emptyLabel={dictionary.merchantDashboardSalesEmpty}
                  groups={view.confirmedSales}
                  heading={dictionary.merchantDashboardConfirmedSales}
                  locale={locale}
                />
              ),
            },
            {
              id: "local",
              label: dictionary.merchantDashboardLocallyFinalizedSales,
              content: (
                <SalesGroups
                  dictionary={dictionary}
                  emptyLabel={dictionary.merchantDashboardSalesEmpty}
                  groups={view.locallyFinalizedSales}
                  heading={dictionary.merchantDashboardLocallyFinalizedSales}
                  locale={locale}
                />
              ),
            },
          ]}
        />
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
    <div className="merchant-dashboard__funnel-row">
      <div className="merchant-dashboard__funnel-labels">
        <span>{label}</span>
        <span className="tabular-nums">{count} · {rate}%</span>
      </div>
      <div className="merchant-dashboard__progress merchant-dashboard__progress--small">
        <div className={`${cls} ${progressWidthClass(rate)}`} />
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
          <div className="merchant-dashboard__funnel">
            <FunnelBar
              cls="merchant-dashboard__funnel-bar--converted"
              count={funnel.converted}
              label={dictionary.merchantDashboardFunnelConverted}
              total={total}
            />
            <FunnelBar
              cls="merchant-dashboard__funnel-bar--in-progress"
              count={funnel.inProgress}
              label={dictionary.merchantDashboardFunnelInProgress}
              total={total}
            />
            <FunnelBar
              cls="merchant-dashboard__funnel-bar--abandoned"
              count={funnel.abandoned}
              label={dictionary.merchantDashboardFunnelAbandoned}
              total={total}
            />
            <div className="merchant-dashboard__funnel-rates">
              <div>
                <span>{dictionary.merchantDashboardFunnelConversionRate}</span>
                <span className="tabular-nums">
                  {funnel.conversionRate === null
                    ? dictionary.merchantDashboardRateUnavailable
                    : formatDashboardRate(funnel.conversionRate, locale)}
                </span>
              </div>
              <div>
                <span>{dictionary.merchantDashboardFunnelAbandonmentRate}</span>
                <span className="tabular-nums">
                  {funnel.abandonmentRate === null
                    ? dictionary.merchantDashboardRateUnavailable
                    : formatDashboardRate(funnel.abandonmentRate, locale)}
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
  return (
    <div className="merchant-dashboard__stat-grid merchant-dashboard__stat-grid--4">
      <StatCard
        label={dictionary.merchantDashboardLinksActiveCount}
        value={view.paymentLinks.activeCount}
      />
      <StatCard
        label={dictionary.merchantDashboardLinksWithActivity}
        value={view.paymentLinks.metrics.length}
      />
    </div>
  );
}

function localizedDescription(
  locale: SupportedLocale,
  descriptionPtBr: string | null,
  descriptionEn: string | null,
) {
  return (locale === "pt-BR" ? descriptionPtBr : descriptionEn) ?? descriptionPtBr ?? descriptionEn;
}

function RecentStateBadge({ dictionary, order }: Readonly<{ dictionary: Dictionary; order: MerchantAnalyticsRecentOrder }>) {
  if (order.state !== null) {
    const variant = order.state === "CONFIRMED" ? "secondary" : order.state === "REJECTED" ? "destructive" : "outline";
    return <Badge variant={variant}>{orderStateLabel(dictionary, order.state)}</Badge>;
  }
  if (order.currentLocalOutcome !== null) {
    const finalized = order.currentLocalOutcome.outcome === "LOCAL_FINALIZED";
    return (
      <Badge variant={finalized ? "secondary" : "outline"}>
        {finalized ? dictionary.merchantDashboardOutcomeFinalized : dictionary.merchantDashboardOutcomeCancelled}
      </Badge>
    );
  }
  return <span className="text-sm text-muted-foreground">{dictionary.merchantDashboardStateUnavailable}</span>;
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
            {view.bestSellers.map((seller) => (
              <li
                className="flex items-center gap-3 py-2.5"
                key={`${seller.titlePtBr}-${seller.titleEn}-${seller.confirmedQuantity}`}
              >
                <Image
                  alt=""
                  aria-hidden
                  className="size-10 rounded-md border object-contain"
                  height={40}
                  src="/application-assets/product-fallback.svg"
                  width={40}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {locale === "pt-BR" ? seller.titlePtBr : seller.titleEn}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {dictionary.merchantDashboardBestSellerColumnQuantity}:{" "}
                    <span className="tabular-nums">{seller.confirmedQuantity}</span>
                  </span>
                </span>
                <AmountLines amounts={seller.revenue} dictionary={dictionary} locale={locale} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
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
            {view.recentActivity.map((order) => (
              <li
                className="flex flex-wrap items-center gap-2 py-2.5"
                key={`${order.createdAt.getTime()}-${order.amount}-${order.paymentLinkV2Identifier ?? "direct"}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {localizedDescription(locale, order.descriptionPtBr, order.descriptionEn)
                      ?? order.paymentLinkV2Identifier
                      ?? dictionary.merchantDashboardUntitledOrder}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{instant(order.createdAt)}</span>
                </span>
                <Badge variant="outline">
                  {order.source === "LINK" ? dictionary.merchantDashboardSourceLink : dictionary.merchantDashboardSourceAdHoc}
                </Badge>
                <RecentStateBadge dictionary={dictionary} order={order} />
                <MoneyText value={formatAmount(dictionary, order, locale)} />
              </li>
            ))}
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

export function MerchantDashboard({
  dictionary,
  locale,
  view,
}: Readonly<{ dictionary: Dictionary; locale: SupportedLocale; view: MerchantAnalyticsView }>) {
  return (
    <div className="merchant-dashboard">
      <KeyStatsGrid dictionary={dictionary} locale={locale} view={view} />
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <SalesBreakdownCard dictionary={dictionary} locale={locale} view={view} />
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
