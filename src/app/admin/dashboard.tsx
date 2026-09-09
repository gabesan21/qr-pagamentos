import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { MoneyText } from "@/components/ui/money-text";
import { Monogram } from "@/components/ui/monogram";
import { CardSkeleton, StatGridSkeleton, TableSkeleton } from "@/components/ui/skeletons";
import { StatCard } from "@/components/ui/stat-card";
import { ProviderStateBadge, StatusBadge, type ProviderState } from "@/components/ui/status-badge";
import type { getDictionary } from "@/i18n/dictionaries";
import type { SupportedLocale } from "@/i18n/locales";
import type {
  AdminAnalyticsCurrencyAmount,
  AdminAnalyticsSalesGroup,
  AdminAnalyticsView,
} from "@/orders/admin-analytics";
import type { OrderV2Source, OrderV2State } from "@/orders/order-v2";

type Dictionary = ReturnType<typeof getDictionary>;
type CurrencyLabel = AdminAnalyticsCurrencyAmount["currency"];

const ORDER_SOURCE_ORDER: ReadonlyArray<OrderV2Source> = ["LINK", "STANDALONE", "AD_HOC"];

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
// Local copy: the administrator surface never imports merchant modules.
export function formatAdminDashboardRate(rate: string, locale: SupportedLocale) {
  const [integer, fraction] = rate.split(".");
  const digits = `${integer}${fraction}`;
  const whole = digits.slice(0, integer.length + 2).replace(/^0+(?=\d)/, "");
  const rest = digits.slice(integer.length + 2).padEnd(2, "0").slice(0, 2);
  const decimal = locale === "pt-BR" ? "," : ".";
  return `${whole}${decimal}${rest}%`;
}

// Locale-formatted exact price with the nullable currency code; the canonical
// stored decimal string is never converted through Number. Local copy of the
// catalog price grammar for the same no-cross-role-import reason.
export function formatAdminDashboardPrice(price: string, currencyCode: string | null, locale: SupportedLocale) {
  const [integer, fraction] = price.split(".");
  const grouping = locale === "pt-BR" ? "." : ",";
  const decimal = locale === "pt-BR" ? "," : ".";
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, grouping);
  const formatted = `${grouped}${fraction ? `${decimal}${fraction}` : ""}`;
  return currencyCode ? `${formatted} ${currencyCode}` : formatted;
}

function currencyDetail(dictionary: Dictionary, currency: CurrencyLabel) {
  if (currency.label) return currency.label;
  return currency.code === null ? dictionary.adminDashboardUnlabeledCurrency : null;
}

function formatAmount(dictionary: Dictionary, amount: AdminAnalyticsCurrencyAmount, locale: SupportedLocale) {
  const formatted = formatAdminDashboardPrice(amount.amount, amount.currency.code, locale);
  return amount.currency.code === null ? `${formatted} (${dictionary.adminDashboardUnlabeledCurrency})` : formatted;
}

function AmountLines({
  amounts,
  dictionary,
  locale,
}: Readonly<{ amounts: ReadonlyArray<AdminAnalyticsCurrencyAmount>; dictionary: Dictionary; locale: SupportedLocale }>) {
  return (
    <span className="flex flex-col gap-1">
      {amounts.map((amount) => (
        <span className="tabular-nums" key={`${amount.currency.code ?? "unlabeled"}-${amount.currency.label ?? "unlabeled"}-${amount.amount}`}>
          {formatAmount(dictionary, amount, locale)}
        </span>
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
  groups: ReadonlyArray<AdminAnalyticsSalesGroup>;
  heading: string;
  locale: SupportedLocale;
}>) {
  return (
    <section className="grid gap-3 border-t border-border pt-4">
      <h3 className="m-0">{heading}</h3>
      {groups.length === 0 ? (
        <p className="m-0 max-w-prose text-text-2">{emptyLabel}</p>
      ) : (
        <ul className="m-0 flex list-none flex-wrap gap-5 p-0">
          {groups.map((group) => (
            <li className="flex flex-col gap-1" key={`${group.currency.code ?? "unlabeled"}-${group.currency.label ?? "unlabeled"}-${group.amount}`}>
              <MoneyText
                className="text-[length:var(--type-title)] font-semibold tabular-nums"
                pairLabel={currencyDetail(dictionary, group.currency) ?? undefined}
                size="large"
                value={formatAmount(dictionary, group, locale)}
              />
              <span className="text-text-2 text-sm">
                <span className="tabular-nums">{group.orderCount}</span> {dictionary.adminDashboardOrderCountLabel}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function sourceLabel(dictionary: Dictionary, source: OrderV2Source) {
  if (source === "LINK") return dictionary.adminDashboardSourceLink;
  if (source === "STANDALONE") return dictionary.adminDashboardSourceStandalone;
  return dictionary.adminDashboardSourceAdHoc;
}

function stateLabel(dictionary: Dictionary, state: OrderV2State | null) {
  if (state === null) return dictionary.adminDashboardStateNone;
  if (state === "CREATED") return dictionary.checkoutStateCreated;
  if (state === "PENDING") return dictionary.checkoutStatePending;
  if (state === "CONFIRMED") return dictionary.checkoutStateConfirmed;
  if (state === "REJECTED") return dictionary.checkoutStateRejected;
  if (state === "CANCELLED") return dictionary.checkoutStateCancelled;
  if (state === "EXPIRED") return dictionary.checkoutStateExpired;
  if (state === "REFUNDED") return dictionary.checkoutStateRefunded;
  return dictionary.checkoutStateIndeterminate;
}

// `OrderV2State` members are the upper-case mirror of `ProviderState`
// (`payment-link-order.ts`'s `PAYMENT_LINK_ORDER_STATES`); every member has a
// matching lower-case `ProviderState`, so the cast is total, never partial.
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

function SourceChip({ dictionary, source }: Readonly<{ dictionary: Dictionary; source: OrderV2Source }>) {
  const variant = source === "LINK" ? "default" : source === "STANDALONE" ? "secondary" : "outline";
  return <Badge variant={variant}>{sourceLabel(dictionary, source)}</Badge>;
}

function sourceBarClass(source: OrderV2Source) {
  if (source === "LINK") return "bg-primary";
  if (source === "STANDALONE") return "bg-info";
  return "bg-muted-foreground";
}

function UsersStatGrid({ dictionary, view }: Readonly<{ dictionary: Dictionary; view: AdminAnalyticsView }>) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <StatCard
        caption={dictionary.adminDashboardPeriodIndependentCaption}
        label={dictionary.adminDashboardUsersRegistered}
        value={view.users.registeredTotal}
      />
      <StatCard
        caption={dictionary.adminDashboardPeriodIndependentCaption}
        label={dictionary.adminDashboardUsersActiveNow}
        trend={{ direction: "up", label: `${view.users.activeNow} ${dictionary.adminDashboardUsersActiveNowTrendSuffix}` }}
        value={view.users.activeNow}
      />
      <StatCard
        label={dictionary.adminDashboardUsersDeleted}
        value={
          <span className="inline-flex items-center gap-2">
            <span aria-hidden className="size-2 rounded-full bg-danger" />
            {view.users.deletedTotal}
          </span>
        }
      />
    </div>
  );
}

function OrdersCard({ dictionary, view }: Readonly<{ dictionary: Dictionary; view: AdminAnalyticsView }>) {
  const { orders } = view;
  const sourceRows = ORDER_SOURCE_ORDER.map((source) => ({
    source,
    count: orders.bySource.find((row) => row.source === source)?.count ?? 0,
  })).filter((row) => row.count > 0);
  const total = orders.createdInPeriod;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{dictionary.adminDashboardOrdersHeading}</CardTitle>
        <CardDescription>{dictionary.adminDashboardOrdersDescription}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div>
          <p className="m-0 max-w-prose text-text-2">{dictionary.adminDashboardOrdersCreated}</p>
          <p className="font-display m-0 text-[length:var(--type-display)] leading-8 font-semibold">{orders.createdInPeriod}</p>
        </div>
        {orders.bySource.length === 0 ? (
          <p className="m-0 max-w-prose text-text-2">{dictionary.adminDashboardOrdersEmpty}</p>
        ) : (
          <section aria-label={dictionary.adminDashboardOrdersBySource} className="grid gap-3 border-t border-border pt-4">
            <div aria-label={`${dictionary.adminDashboardOrdersBySource}: ${total}`} className="flex h-3 w-full overflow-hidden rounded-full bg-muted" role="img">
              {sourceRows.map((row) => {
                const pct = total === 0 ? 0 : (row.count / total) * 100;
                return (
                  <div
                    className={`transition-all ${sourceBarClass(row.source)} ${progressWidthClass(pct)}`}
                    key={row.source}
                  />
                );
              })}
            </div>
            <ul className="m-0 grid list-none gap-2 p-0">
              {sourceRows.map((row) => (
                <li className="flex items-center justify-between" key={row.source}>
                  <SourceChip dictionary={dictionary} source={row.source} />
                  <span className="tabular-nums">{row.count}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {orders.byState.length === 0 ? null : (
          <section className="grid gap-3 border-t border-border pt-4">
            <h3 className="m-0">{dictionary.adminDashboardByProviderState}</h3>
            <div className="flex flex-wrap gap-2">
              {orders.byState.map((row) => (
                <span className="inline-flex items-center gap-1.5" key={row.state ?? "none"}>
                  {row.state === null ? (
                    <StatusBadge label={stateLabel(dictionary, null)} tone="neutral" />
                  ) : (
                    <ProviderStateBadge labels={providerStateBadgeLabels(dictionary)} state={toProviderState(row.state)} />
                  )}
                  <span className="text-text-2 text-xs tabular-nums">{row.count}</span>
                </span>
              ))}
            </div>
          </section>
        )}
      </CardContent>
    </Card>
  );
}

function SalesCard({ dictionary, locale, view }: Readonly<{ dictionary: Dictionary; locale: SupportedLocale; view: AdminAnalyticsView }>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{dictionary.adminDashboardSalesHeading}</CardTitle>
        <CardDescription>{dictionary.adminDashboardSalesDescription}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <SalesGroups
          dictionary={dictionary}
          emptyLabel={dictionary.adminDashboardSalesEmpty}
          groups={view.confirmedSales}
          heading={dictionary.adminDashboardConfirmedSales}
          locale={locale}
        />
        <SalesGroups
          dictionary={dictionary}
          emptyLabel={dictionary.adminDashboardSalesEmpty}
          groups={view.locallyFinalizedSales}
          heading={dictionary.adminDashboardLocallyFinalizedSales}
          locale={locale}
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

function FunnelCard({ dictionary, locale, view }: Readonly<{ dictionary: Dictionary; locale: SupportedLocale; view: AdminAnalyticsView }>) {
  const { funnel } = view;
  const total = funnel.converted + funnel.abandoned + funnel.inProgress || 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{dictionary.adminDashboardFunnelHeading}</CardTitle>
        <CardDescription>{dictionary.adminDashboardFunnelDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        {funnel.attempts === 0 ? (
          <p className="m-0 max-w-prose text-text-2">{dictionary.adminDashboardFunnelEmpty}</p>
        ) : (
          <div className="grid gap-4">
            <FunnelBar
              cls="bg-success"
              count={funnel.converted}
              label={dictionary.adminDashboardFunnelConverted}
              total={total}
            />
            <FunnelBar
              cls="bg-info"
              count={funnel.inProgress}
              label={dictionary.adminDashboardFunnelInProgress}
              total={total}
            />
            <FunnelBar
              cls="bg-muted-foreground"
              count={funnel.abandoned}
              label={dictionary.adminDashboardFunnelAbandoned}
              total={total}
            />
            <div className="grid gap-2 border-t border-border pt-4">
              <div className="flex justify-between">
                <span>{dictionary.adminDashboardFunnelConversionRate}</span>
                <span className="tabular-nums">
                  {funnel.conversionRate === null ? dictionary.adminDashboardRateUnavailable : formatAdminDashboardRate(funnel.conversionRate, locale)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>{dictionary.adminDashboardFunnelAbandonmentRate}</span>
                <span className="tabular-nums">
                  {funnel.abandonmentRate === null ? dictionary.adminDashboardRateUnavailable : formatAdminDashboardRate(funnel.abandonmentRate, locale)}
                </span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LinksProductsStatGrid({ dictionary, view }: Readonly<{ dictionary: Dictionary; view: AdminAnalyticsView }>) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        caption={dictionary.adminDashboardPeriodIndependentCaption}
        label={dictionary.adminDashboardLinksTotal}
        value={view.paymentLinks.total}
      />
      <StatCard
        caption={dictionary.adminDashboardPeriodIndependentCaption}
        label={dictionary.adminDashboardLinksActive}
        value={view.paymentLinks.activeCount}
      />
      <StatCard
        caption={dictionary.adminDashboardPeriodIndependentCaption}
        label={dictionary.adminDashboardProductsActive}
        value={view.products.activeCount}
      />
      <StatCard
        caption={dictionary.adminDashboardPeriodIndependentCaption}
        label={dictionary.adminDashboardProductsArchived}
        value={view.products.archivedCount}
      />
    </div>
  );
}

function TopOwnersCard({ dictionary, locale, view }: Readonly<{ dictionary: Dictionary; locale: SupportedLocale; view: AdminAnalyticsView }>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{dictionary.adminDashboardTopOwnersHeading}</CardTitle>
        <CardDescription>{dictionary.adminDashboardTopOwnersDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        {view.topOwners.length === 0 ? (
          <EmptyState illustration="users" title={dictionary.adminDashboardTopOwnersEmpty} />
        ) : (
          <ol className="m-0 grid list-none gap-1 p-0">
            {view.topOwners.map((entry, index) => (
              <li key={entry.owner.username}>
                <Link
                  className="flex min-h-11 items-center gap-3 rounded-md p-2 no-underline hover:bg-muted"
                  href={`/admin/orders?filter.merchant=${encodeURIComponent(entry.owner.username)}`}
                >
                  <span aria-hidden className="bg-accent text-accent-foreground font-money inline-flex size-7 items-center justify-center rounded-full text-xs font-semibold">
                    {index + 1}
                  </span>
                  <Monogram accessibleName={entry.owner.username} name={entry.owner.username} size="sm" />
                  <span className={`truncate font-semibold ${entry.owner.deleted ? "line-through" : ""}`}>
                    {entry.owner.username}
                  </span>
                  {entry.owner.deleted ? (
                    <StatusBadge label={dictionary.adminDashboardDeletedOwnerBadge} tone="danger" />
                  ) : null}
                  <span className="ml-auto tabular-nums">{entry.confirmedOrders}</span>
                  <span className="ml-auto">
                    <AmountLines amounts={entry.confirmedVolume} dictionary={dictionary} locale={locale} />
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function TopProductsCard({ dictionary, locale, view }: Readonly<{ dictionary: Dictionary; locale: SupportedLocale; view: AdminAnalyticsView }>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{dictionary.adminDashboardTopProductsHeading}</CardTitle>
        <CardDescription>{dictionary.adminDashboardTopProductsDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        {view.topProducts.length === 0 ? (
          <EmptyState illustration="products" title={dictionary.adminDashboardTopProductsEmpty} />
        ) : (
          <ol className="m-0 grid list-none gap-1 p-0">
            {view.topProducts.map((product) => (
              <li key={`${product.titlePtBr}-${product.titleEn}-${product.confirmedQuantity}`}>
                <div className="flex min-h-11 items-center gap-3 p-2">
                  <img
                    alt=""
                    aria-hidden
                    className="size-8 rounded-md border border-border object-contain"
                    height={32}
                    src="/application-assets/product-fallback.svg"
                    width={32}
                  />
                  <span className="min-w-0 flex-1 truncate font-semibold">
                    {locale === "pt-BR" ? product.titlePtBr : product.titleEn}
                  </span>
                  <span className="ml-auto tabular-nums">×{product.confirmedQuantity}</span>
                  <span className="ml-auto">
                    <AmountLines amounts={product.revenue} dictionary={dictionary} locale={locale} />
                  </span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

export function AdminDashboardSkeleton({ dictionary }: Readonly<{ dictionary: Dictionary }>) {
  return (
    <div className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <CardSkeleton label={dictionary.adminDashboardUsersRegistered} />
        <CardSkeleton label={dictionary.adminDashboardUsersActiveNow} />
        <CardSkeleton label={dictionary.adminDashboardUsersDeleted} />
      </div>
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <TableSkeleton columns={2} label={dictionary.adminDashboardOrdersHeading} rows={4} />
        </div>
        <div className="lg:col-span-4">
          <TableSkeleton columns={1} label={dictionary.adminDashboardSalesHeading} rows={4} />
        </div>
        <div className="lg:col-span-3">
          <TableSkeleton columns={1} label={dictionary.adminDashboardFunnelHeading} rows={3} />
        </div>
      </div>
      <StatGridSkeleton count={4} label={dictionary.adminDashboardLinksProductsHeading} />
      <div className="grid gap-4 lg:grid-cols-2">
        <TableSkeleton columns={3} label={dictionary.adminDashboardTopOwnersHeading} rows={5} />
        <TableSkeleton columns={3} label={dictionary.adminDashboardTopProductsHeading} rows={5} />
      </div>
    </div>
  );
}

export function AdminDashboard({
  dictionary,
  locale,
  view,
}: Readonly<{ dictionary: Dictionary; locale: SupportedLocale; view: AdminAnalyticsView }>) {
  return (
    <div className="grid gap-6">
      <UsersStatGrid dictionary={dictionary} view={view} />

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-5">
          <OrdersCard dictionary={dictionary} view={view} />
        </div>
        <div className="min-w-0 lg:col-span-4">
          <SalesCard dictionary={dictionary} locale={locale} view={view} />
        </div>
        <div className="min-w-0 lg:col-span-3">
          <FunnelCard dictionary={dictionary} locale={locale} view={view} />
        </div>
      </div>

      <LinksProductsStatGrid dictionary={dictionary} view={view} />

      <div className="grid gap-4 lg:grid-cols-2">
        <TopOwnersCard dictionary={dictionary} locale={locale} view={view} />
        <TopProductsCard dictionary={dictionary} locale={locale} view={view} />
      </div>
    </div>
  );
}
