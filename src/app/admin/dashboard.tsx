import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { MoneyText } from "@/components/ui/money-text";
import { Monogram } from "@/components/ui/monogram";
import { CardSkeleton, StatGridSkeleton, TableSkeleton } from "@/components/ui/skeletons";
import { StatCard } from "@/components/ui/stat-card";
import type { getDictionary } from "@/i18n/dictionaries";
import type { SupportedLocale } from "@/i18n/locales";
import type {
  AdminAnalyticsCurrencyAmount,
  AdminAnalyticsPeriod,
  AdminAnalyticsSalesGroup,
  AdminAnalyticsView,
} from "@/orders/admin-analytics";
import type { OrderV2Source, OrderV2State } from "@/orders/order-v2";

type Dictionary = ReturnType<typeof getDictionary>;
type CurrencyLabel = AdminAnalyticsCurrencyAmount["currency"];

const DASHBOARD_PERIODS: ReadonlyArray<{
  id: AdminAnalyticsPeriod;
  label: (dictionary: Dictionary) => string;
}> = [
  { id: "today", label: (dictionary) => dictionary.adminDashboardPeriodToday },
  { id: "7d", label: (dictionary) => dictionary.adminDashboardPeriod7d },
  { id: "30d", label: (dictionary) => dictionary.adminDashboardPeriod30d },
];

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

export function AdminDashboardPeriodNavigation({
  current,
  dictionary,
}: Readonly<{ current: AdminAnalyticsPeriod; dictionary: Dictionary }>) {
  return (
    <nav aria-label={dictionary.adminDashboardPeriodLabel} className="admin-dashboard__periods">
      {DASHBOARD_PERIODS.map((period) =>
        period.id === current ? (
          <span aria-current="page" className="admin-dashboard__period admin-dashboard__period--current" key={period.id}>
            {period.label(dictionary)}
          </span>
        ) : (
          <Link className="admin-dashboard__period" href={`/admin?period=${period.id}`} key={period.id}>
            {period.label(dictionary)}
          </Link>
        ),
      )}
    </nav>
  );
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
    <span className="admin-dashboard__amount-lines">
      {amounts.map((amount) => (
        <span className="admin-dashboard__count" key={`${amount.currency.code ?? "unlabeled"}-${amount.currency.label ?? "unlabeled"}-${amount.amount}`}>
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
    <section className="admin-dashboard__group">
      <h3>{heading}</h3>
      {groups.length === 0 ? (
        <p className="admin-dashboard__empty">{emptyLabel}</p>
      ) : (
        <ul className="admin-dashboard__amounts">
          {groups.map((group) => (
            <li key={`${group.currency.code ?? "unlabeled"}-${group.currency.label ?? "unlabeled"}-${group.amount}`}>
              <MoneyText
                className="admin-dashboard__amount"
                pairLabel={currencyDetail(dictionary, group.currency) ?? undefined}
                size="large"
                value={formatAmount(dictionary, group, locale)}
              />
              <span className="admin-dashboard__facts-secondary">
                <span className="admin-dashboard__count">{group.orderCount}</span> {dictionary.adminDashboardOrderCountLabel}
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

function SourceChip({ dictionary, source }: Readonly<{ dictionary: Dictionary; source: OrderV2Source }>) {
  const variant = source === "LINK" ? "default" : source === "STANDALONE" ? "secondary" : "outline";
  return <Badge variant={variant}>{sourceLabel(dictionary, source)}</Badge>;
}

function sourceBarClass(source: OrderV2Source) {
  if (source === "LINK") return "admin-dashboard__source-bar--link";
  if (source === "STANDALONE") return "admin-dashboard__source-bar--standalone";
  return "admin-dashboard__source-bar--ad-hoc";
}

function UsersStatGrid({ dictionary, view }: Readonly<{ dictionary: Dictionary; view: AdminAnalyticsView }>) {
  return (
    <div className="admin-dashboard__stat-grid admin-dashboard__stat-grid--3">
      <StatCard
        caption={dictionary.adminDashboardPeriodIndependentCaption}
        label={dictionary.adminDashboardUsersRegistered}
        value={view.users.registeredTotal}
      />
      <StatCard
        caption={dictionary.adminDashboardPeriodIndependentCaption}
        label={dictionary.adminDashboardUsersActiveNow}
        value={view.users.activeNow}
      />
      <StatCard
        label={dictionary.adminDashboardUsersDeleted}
        value={
          <span className="inline-flex items-center gap-2">
            <span aria-hidden className="admin-dashboard__danger-dot" />
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
      <CardContent className="admin-dashboard__groups">
        <div>
          <p className="admin-dashboard__empty">{dictionary.adminDashboardOrdersCreated}</p>
          <p className="admin-dashboard__big-stat">{orders.createdInPeriod}</p>
        </div>
        {orders.bySource.length === 0 ? (
          <p className="admin-dashboard__empty">{dictionary.adminDashboardOrdersEmpty}</p>
        ) : (
          <section aria-label={dictionary.adminDashboardOrdersBySource} className="admin-dashboard__group">
            <div className="admin-dashboard__progress" role="img" aria-label={`${dictionary.adminDashboardOrdersBySource}: ${total}`}>
              {sourceRows.map((row) => {
                const pct = total === 0 ? 0 : (row.count / total) * 100;
                return (
                  <div
                    key={row.source}
                    className={`${sourceBarClass(row.source)} ${progressWidthClass(pct)}`}
                  />
                );
              })}
            </div>
            <ul className="admin-dashboard__origin-list">
              {sourceRows.map((row) => (
                <li key={row.source} className="admin-dashboard__origin-row">
                  <SourceChip dictionary={dictionary} source={row.source} />
                  <span className="admin-dashboard__count">{row.count}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {orders.byState.length === 0 ? null : (
          <section className="admin-dashboard__group">
            <h3>{dictionary.adminDashboardByProviderState}</h3>
            <div className="admin-dashboard__state-tags">
              {orders.byState.map((row) => (
                <Badge key={row.state ?? "none"} variant="secondary">
                  {stateLabel(dictionary, row.state)} <span className="admin-dashboard__count">{row.count}</span>
                </Badge>
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
      <CardContent className="admin-dashboard__groups">
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
    <div className="admin-dashboard__funnel-row">
      <div className="admin-dashboard__funnel-labels">
        <span>{label}</span>
        <span className="admin-dashboard__count">{count} · {rate}%</span>
      </div>
      <div className="admin-dashboard__progress admin-dashboard__progress--small">
        <div className={`${cls} ${progressWidthClass(rate)}`} />
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
          <p className="admin-dashboard__empty">{dictionary.adminDashboardFunnelEmpty}</p>
        ) : (
          <div className="admin-dashboard__funnel">
            <FunnelBar
              cls="admin-dashboard__funnel-bar--converted"
              count={funnel.converted}
              label={dictionary.adminDashboardFunnelConverted}
              total={total}
            />
            <FunnelBar
              cls="admin-dashboard__funnel-bar--in-progress"
              count={funnel.inProgress}
              label={dictionary.adminDashboardFunnelInProgress}
              total={total}
            />
            <FunnelBar
              cls="admin-dashboard__funnel-bar--abandoned"
              count={funnel.abandoned}
              label={dictionary.adminDashboardFunnelAbandoned}
              total={total}
            />
            <div className="admin-dashboard__funnel-rates">
              <div>
                <span>{dictionary.adminDashboardFunnelConversionRate}</span>
                <span className="admin-dashboard__count">
                  {funnel.conversionRate === null ? dictionary.adminDashboardRateUnavailable : formatAdminDashboardRate(funnel.conversionRate, locale)}
                </span>
              </div>
              <div>
                <span>{dictionary.adminDashboardFunnelAbandonmentRate}</span>
                <span className="admin-dashboard__count">
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
    <div className="admin-dashboard__stat-grid admin-dashboard__stat-grid--4">
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
          <ol className="admin-dashboard__leaderboard">
            {view.topOwners.map((entry, index) => (
              <li key={entry.owner.username}>
                <Link className="admin-dashboard__leaderboard-row" href="/admin/accounts">
                  <span aria-hidden className="admin-dashboard__rank">{index + 1}</span>
                  <Monogram accessibleName={entry.owner.username} name={entry.owner.username} size="sm" />
                  <span className={`admin-dashboard__leaderboard-name ${entry.owner.deleted ? "admin-dashboard__leaderboard-name--deleted" : ""}`}>
                    {entry.owner.username}
                  </span>
                  {entry.owner.deleted ? (
                    <Badge variant="outline">{dictionary.adminDashboardDeletedOwnerBadge}</Badge>
                  ) : null}
                  <span className="admin-dashboard__count admin-dashboard__leaderboard-metric">{entry.confirmedOrders}</span>
                  <span className="admin-dashboard__leaderboard-metric">
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
          <ol className="admin-dashboard__leaderboard">
            {view.topProducts.map((product) => (
              <li key={`${product.titlePtBr}-${product.titleEn}-${product.confirmedQuantity}`}>
                <div className="admin-dashboard__leaderboard-row admin-dashboard__leaderboard-row--static">
                  <img
                    alt=""
                    aria-hidden
                    className="admin-dashboard__product-thumb"
                    height={32}
                    src="/application-assets/product-fallback.svg"
                    width={32}
                  />
                  <span className="admin-dashboard__leaderboard-name admin-dashboard__leaderboard-name--product">
                    {locale === "pt-BR" ? product.titlePtBr : product.titleEn}
                  </span>
                  <span className="admin-dashboard__count admin-dashboard__leaderboard-metric">×{product.confirmedQuantity}</span>
                  <span className="admin-dashboard__leaderboard-metric">
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
    <div className="admin-dashboard">
      <div className="admin-dashboard__stat-grid admin-dashboard__stat-grid--3">
        <CardSkeleton label={dictionary.adminDashboardUsersHeading} />
        <CardSkeleton label={dictionary.adminDashboardUsersHeading} />
        <CardSkeleton label={dictionary.adminDashboardUsersHeading} />
      </div>
      <div className="admin-dashboard__row admin-dashboard__row--3">
        <TableSkeleton columns={2} label={dictionary.adminDashboardOrdersHeading} rows={4} />
        <TableSkeleton columns={1} label={dictionary.adminDashboardSalesHeading} rows={4} />
        <TableSkeleton columns={1} label={dictionary.adminDashboardFunnelHeading} rows={3} />
      </div>
      <StatGridSkeleton count={4} label={dictionary.adminDashboardLinksProductsHeading} />
      <div className="admin-dashboard__row admin-dashboard__row--2">
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
    <div className="admin-dashboard">
      <UsersStatGrid dictionary={dictionary} view={view} />

      <div className="admin-dashboard__row admin-dashboard__row--3">
        <div className="admin-dashboard__col admin-dashboard__col--5">
          <OrdersCard dictionary={dictionary} view={view} />
        </div>
        <div className="admin-dashboard__col admin-dashboard__col--4">
          <SalesCard dictionary={dictionary} locale={locale} view={view} />
        </div>
        <div className="admin-dashboard__col admin-dashboard__col--3">
          <FunnelCard dictionary={dictionary} locale={locale} view={view} />
        </div>
      </div>

      <LinksProductsStatGrid dictionary={dictionary} view={view} />

      <div className="admin-dashboard__row admin-dashboard__row--2">
        <TopOwnersCard dictionary={dictionary} locale={locale} view={view} />
        <TopProductsCard dictionary={dictionary} locale={locale} view={view} />
      </div>
    </div>
  );
}
