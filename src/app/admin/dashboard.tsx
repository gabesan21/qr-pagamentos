import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
              <span className="admin-dashboard__amount">{formatAmount(dictionary, group, locale)}</span>
              <span className="admin-dashboard__facts-secondary">
                {currencyDetail(dictionary, group.currency)}
                {" · "}
                <span className="admin-dashboard__count">{group.orderCount}</span> {dictionary.adminDashboardOrderCountLabel}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FactList({ facts }: Readonly<{ facts: ReadonlyArray<Readonly<{ label: string; value: number | string }>> }>) {
  return (
    <div className="admin-dashboard__facts">
      <dl>
        {facts.map((fact) => (
          <div key={fact.label}><dt>{fact.label}</dt><dd className="admin-dashboard__count">{fact.value}</dd></div>
        ))}
      </dl>
    </div>
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

function UsersCard({ dictionary, view }: Readonly<{ dictionary: Dictionary; view: AdminAnalyticsView }>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{dictionary.adminDashboardUsersHeading}</CardTitle>
        <CardDescription>{dictionary.adminDashboardUsersDescription}</CardDescription>
      </CardHeader>
      <CardContent className="admin-dashboard__groups">
        <FactList facts={[
          { label: dictionary.adminDashboardUsersRegistered, value: view.users.registeredTotal },
          { label: dictionary.adminDashboardUsersActiveNow, value: view.users.activeNow },
          { label: dictionary.adminDashboardUsersDeleted, value: view.users.deletedTotal },
        ]} />
        <p className="admin-dashboard__caption">{dictionary.adminDashboardPeriodIndependentCaption}</p>
      </CardContent>
    </Card>
  );
}

function OrdersCard({ dictionary, view }: Readonly<{ dictionary: Dictionary; view: AdminAnalyticsView }>) {
  const { orders } = view;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{dictionary.adminDashboardOrdersHeading}</CardTitle>
        <CardDescription>{dictionary.adminDashboardOrdersDescription}</CardDescription>
      </CardHeader>
      <CardContent className="admin-dashboard__groups">
        <FactList facts={[{ label: dictionary.adminDashboardOrdersCreated, value: orders.createdInPeriod }]} />
        {orders.bySource.length === 0 ? (
          <p className="admin-dashboard__empty">{dictionary.adminDashboardOrdersEmpty}</p>
        ) : (
          <>
            <section className="admin-dashboard__group">
              <h3>{dictionary.adminDashboardOrdersBySource}</h3>
              <FactList facts={orders.bySource.map((row) => ({ label: sourceLabel(dictionary, row.source), value: row.count }))} />
            </section>
            <section className="admin-dashboard__group">
              <h3>{dictionary.adminDashboardOrdersByState}</h3>
              <FactList facts={orders.byState.map((row) => ({ label: stateLabel(dictionary, row.state), value: row.count }))} />
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function FunnelCard({ dictionary, locale, view }: Readonly<{ dictionary: Dictionary; locale: SupportedLocale; view: AdminAnalyticsView }>) {
  const { funnel } = view;
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
          <FactList facts={[
            { label: dictionary.adminDashboardFunnelAttempts, value: funnel.attempts },
            { label: dictionary.adminDashboardFunnelConverted, value: funnel.converted },
            { label: dictionary.adminDashboardFunnelAbandoned, value: funnel.abandoned },
            { label: dictionary.adminDashboardFunnelInProgress, value: funnel.inProgress },
            {
              label: dictionary.adminDashboardFunnelConversionRate,
              value: funnel.conversionRate === null ? dictionary.adminDashboardRateUnavailable : formatAdminDashboardRate(funnel.conversionRate, locale),
            },
            {
              label: dictionary.adminDashboardFunnelAbandonmentRate,
              value: funnel.abandonmentRate === null ? dictionary.adminDashboardRateUnavailable : formatAdminDashboardRate(funnel.abandonmentRate, locale),
            },
          ]} />
        )}
      </CardContent>
    </Card>
  );
}

function LinksProductsCard({ dictionary, view }: Readonly<{ dictionary: Dictionary; view: AdminAnalyticsView }>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{dictionary.adminDashboardLinksProductsHeading}</CardTitle>
        <CardDescription>{dictionary.adminDashboardLinksProductsDescription}</CardDescription>
      </CardHeader>
      <CardContent className="admin-dashboard__groups">
        <FactList facts={[
          { label: dictionary.adminDashboardLinksTotal, value: view.paymentLinks.total },
          { label: dictionary.adminDashboardLinksActive, value: view.paymentLinks.activeCount },
          { label: dictionary.adminDashboardProductsActive, value: view.products.activeCount },
          { label: dictionary.adminDashboardProductsArchived, value: view.products.archivedCount },
        ]} />
        <p className="admin-dashboard__caption">{dictionary.adminDashboardPeriodIndependentCaption}</p>
      </CardContent>
    </Card>
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
          <p className="admin-dashboard__empty">{dictionary.adminDashboardTopOwnersEmpty}</p>
        ) : (
          <Table>
            <TableCaption>{dictionary.adminDashboardTopOwnersHeading}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{dictionary.adminDashboardTopOwnerColumnOwner}</TableHead>
                <TableHead scope="col">{dictionary.adminDashboardTopOwnerColumnOrders}</TableHead>
                <TableHead scope="col">{dictionary.adminDashboardTopOwnerColumnVolume}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {view.topOwners.map((entry) => (
                <TableRow key={entry.owner.username}>
                  <TableCell>
                    {entry.owner.username}
                    {entry.owner.deleted ? <> <Badge variant="outline">{dictionary.adminDashboardDeletedOwnerBadge}</Badge></> : null}
                  </TableCell>
                  <TableCell className="admin-dashboard__count">{entry.confirmedOrders}</TableCell>
                  <TableCell><AmountLines amounts={entry.confirmedVolume} dictionary={dictionary} locale={locale} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
          <p className="admin-dashboard__empty">{dictionary.adminDashboardTopProductsEmpty}</p>
        ) : (
          <Table>
            <TableCaption>{dictionary.adminDashboardTopProductsHeading}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{dictionary.adminDashboardTopProductColumnProduct}</TableHead>
                <TableHead scope="col">{dictionary.adminDashboardTopProductColumnQuantity}</TableHead>
                <TableHead scope="col">{dictionary.adminDashboardTopProductColumnRevenue}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {view.topProducts.map((product) => (
                <TableRow key={`${product.titlePtBr}-${product.titleEn}-${product.confirmedQuantity}`}>
                  <TableCell>{locale === "pt-BR" ? product.titlePtBr : product.titleEn}</TableCell>
                  <TableCell className="admin-dashboard__count">{product.confirmedQuantity}</TableCell>
                  <TableCell><AmountLines amounts={product.revenue} dictionary={dictionary} locale={locale} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export function AdminDashboard({
  dictionary,
  locale,
  view,
}: Readonly<{ dictionary: Dictionary; locale: SupportedLocale; view: AdminAnalyticsView }>) {
  return (
    <div className="admin-dashboard">
      <UsersCard dictionary={dictionary} view={view} />
      <OrdersCard dictionary={dictionary} view={view} />

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

      <FunnelCard dictionary={dictionary} locale={locale} view={view} />
      <LinksProductsCard dictionary={dictionary} view={view} />
      <TopOwnersCard dictionary={dictionary} locale={locale} view={view} />
      <TopProductsCard dictionary={dictionary} locale={locale} view={view} />
    </div>
  );
}
