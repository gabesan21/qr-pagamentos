import Link from "next/link";

import { orderStateLabel } from "@/app/orders/order-views";
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
  MerchantAnalyticsCurrencyAmount,
  MerchantAnalyticsCurrencyLabel,
  MerchantAnalyticsPeriod,
  MerchantAnalyticsRecentOrder,
  MerchantAnalyticsSalesGroup,
  MerchantAnalyticsView,
} from "@/orders/merchant-analytics";

import { formatCatalogPrice } from "./catalog/price-format";

type Dictionary = ReturnType<typeof getDictionary>;

const DASHBOARD_PERIODS: ReadonlyArray<{
  id: MerchantAnalyticsPeriod;
  label: (dictionary: Dictionary) => string;
}> = [
  { id: "today", label: (dictionary) => dictionary.merchantDashboardPeriodToday },
  { id: "7d", label: (dictionary) => dictionary.merchantDashboardPeriod7d },
  { id: "30d", label: (dictionary) => dictionary.merchantDashboardPeriod30d },
];

export function DashboardPeriodNavigation({
  current,
  dictionary,
}: Readonly<{ current: MerchantAnalyticsPeriod; dictionary: Dictionary }>) {
  return (
    <nav aria-label={dictionary.merchantDashboardPeriodLabel} className="merchant-dashboard__periods">
      {DASHBOARD_PERIODS.map((period) =>
        period.id === current ? (
          <span aria-current="page" className="merchant-dashboard__period merchant-dashboard__period--current" key={period.id}>
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

function currencyDetail(dictionary: Dictionary, currency: MerchantAnalyticsCurrencyLabel) {
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
  groups: ReadonlyArray<MerchantAnalyticsSalesGroup>;
  heading: string;
  locale: SupportedLocale;
}>) {
  return (
    <section className="merchant-dashboard__group">
      <h3>{heading}</h3>
      {groups.length === 0 ? (
        <p className="merchant-dashboard__empty">{emptyLabel}</p>
      ) : (
        <ul className="merchant-dashboard__amounts">
          {groups.map((group) => (
            <li key={`${group.currency.code ?? "unlabeled"}-${group.currency.label ?? "unlabeled"}-${group.amount}`}>
              <span className="merchant-dashboard__amount">{formatAmount(dictionary, group, locale)}</span>
              <span className="merchant-dashboard__facts-secondary">
                {currencyDetail(dictionary, group.currency)}
                {" · "}
                <span className="tabular-nums">{group.orderCount}</span> {dictionary.merchantDashboardOrderCountLabel}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FunnelCard({ dictionary, locale, view }: Readonly<{ dictionary: Dictionary; locale: SupportedLocale; view: MerchantAnalyticsView }>) {
  const { funnel } = view;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{dictionary.merchantDashboardFunnelHeading}</CardTitle>
        <CardDescription>{dictionary.merchantDashboardFunnelDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        {funnel.attempts === 0 ? (
          <p className="merchant-dashboard__empty">{dictionary.merchantDashboardFunnelEmpty}</p>
        ) : (
          <div className="merchant-dashboard__facts">
            <dl>
              <div><dt>{dictionary.merchantDashboardFunnelAttempts}</dt><dd className="tabular-nums">{funnel.attempts}</dd></div>
              <div><dt>{dictionary.merchantDashboardFunnelConverted}</dt><dd className="tabular-nums">{funnel.converted}</dd></div>
              <div><dt>{dictionary.merchantDashboardFunnelAbandoned}</dt><dd className="tabular-nums">{funnel.abandoned}</dd></div>
              <div><dt>{dictionary.merchantDashboardFunnelInProgress}</dt><dd className="tabular-nums">{funnel.inProgress}</dd></div>
              <div>
                <dt>{dictionary.merchantDashboardFunnelConversionRate}</dt>
                <dd className="tabular-nums">
                  {funnel.conversionRate === null ? dictionary.merchantDashboardRateUnavailable : formatDashboardRate(funnel.conversionRate, locale)}
                </dd>
              </div>
              <div>
                <dt>{dictionary.merchantDashboardFunnelAbandonmentRate}</dt>
                <dd className="tabular-nums">
                  {funnel.abandonmentRate === null ? dictionary.merchantDashboardRateUnavailable : formatDashboardRate(funnel.abandonmentRate, locale)}
                </dd>
              </div>
            </dl>
          </div>
        )}
      </CardContent>
    </Card>
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
  return <span className="merchant-dashboard__facts-secondary">{dictionary.merchantDashboardStateUnavailable}</span>;
}

export function MerchantDashboard({
  dictionary,
  locale,
  view,
}: Readonly<{ dictionary: Dictionary; locale: SupportedLocale; view: MerchantAnalyticsView }>) {
  const instant = (value: Date) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(value);
  return (
    <div className="merchant-dashboard">
      <Card>
        <CardHeader>
          <CardTitle>{dictionary.merchantDashboardSalesHeading}</CardTitle>
          <CardDescription>{dictionary.merchantDashboardSalesDescription}</CardDescription>
        </CardHeader>
        <CardContent className="merchant-dashboard__groups">
          <SalesGroups
            dictionary={dictionary}
            emptyLabel={dictionary.merchantDashboardSalesEmpty}
            groups={view.confirmedSales}
            heading={dictionary.merchantDashboardConfirmedSales}
            locale={locale}
          />
          <SalesGroups
            dictionary={dictionary}
            emptyLabel={dictionary.merchantDashboardSalesEmpty}
            groups={view.locallyFinalizedSales}
            heading={dictionary.merchantDashboardLocallyFinalizedSales}
            locale={locale}
          />
        </CardContent>
      </Card>

      <FunnelCard dictionary={dictionary} locale={locale} view={view} />

      <Card>
        <CardHeader>
          <CardTitle>{dictionary.merchantDashboardBestSellersHeading}</CardTitle>
          <CardDescription>{dictionary.merchantDashboardBestSellersDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          {view.bestSellers.length === 0 ? (
            <p className="merchant-dashboard__empty">{dictionary.merchantDashboardBestSellersEmpty}</p>
          ) : (
            <Table>
              <TableCaption>{dictionary.merchantDashboardBestSellersHeading}</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">{dictionary.merchantDashboardBestSellerColumnProduct}</TableHead>
                  <TableHead scope="col">{dictionary.merchantDashboardBestSellerColumnQuantity}</TableHead>
                  <TableHead scope="col">{dictionary.merchantDashboardBestSellerColumnRevenue}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.bestSellers.map((seller) => (
                  <TableRow key={`${seller.titlePtBr}-${seller.titleEn}-${seller.confirmedQuantity}`}>
                    <TableCell>{locale === "pt-BR" ? seller.titlePtBr : seller.titleEn}</TableCell>
                    <TableCell className="tabular-nums">{seller.confirmedQuantity}</TableCell>
                    <TableCell><AmountLines amounts={seller.revenue} dictionary={dictionary} locale={locale} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{dictionary.merchantDashboardLinksHeading}</CardTitle>
          <CardDescription>{dictionary.merchantDashboardLinksDescription}</CardDescription>
        </CardHeader>
        <CardContent className="merchant-dashboard__groups">
          <div className="merchant-dashboard__facts">
            <dl>
              <div><dt>{dictionary.merchantDashboardLinksActiveCount}</dt><dd className="tabular-nums">{view.paymentLinks.activeCount}</dd></div>
            </dl>
          </div>
          {view.paymentLinks.metrics.length === 0 ? (
            <p className="merchant-dashboard__empty">{dictionary.merchantDashboardLinksEmpty}</p>
          ) : (
            <Table>
              <TableCaption>{dictionary.merchantDashboardLinksHeading}</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">{dictionary.merchantDashboardLinkColumnLink}</TableHead>
                  <TableHead scope="col">{dictionary.merchantDashboardLinkColumnAttempts}</TableHead>
                  <TableHead scope="col">{dictionary.merchantDashboardLinkColumnConfirmedOrders}</TableHead>
                  <TableHead scope="col">{dictionary.merchantDashboardLinkColumnVolume}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.paymentLinks.metrics.map((link) => (
                  <TableRow key={link.identifier}>
                    <TableCell>{localizedDescription(locale, link.descriptionPtBr, link.descriptionEn) ?? link.identifier}</TableCell>
                    <TableCell className="tabular-nums">{link.attempts}</TableCell>
                    <TableCell className="tabular-nums">{link.confirmedOrders}</TableCell>
                    <TableCell>
                      {link.confirmedVolume.length === 0 ? (
                        <span className="merchant-dashboard__facts-secondary">{dictionary.merchantDashboardRateUnavailable}</span>
                      ) : (
                        <AmountLines amounts={link.confirmedVolume} dictionary={dictionary} locale={locale} />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{dictionary.merchantDashboardRecentHeading}</CardTitle>
          <CardDescription>{dictionary.merchantDashboardRecentDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          {view.recentActivity.length === 0 ? (
            <p className="merchant-dashboard__empty">{dictionary.merchantDashboardRecentEmpty}</p>
          ) : (
            <Table>
              <TableCaption>{dictionary.merchantDashboardRecentHeading}</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">{dictionary.merchantDashboardRecentColumnOrder}</TableHead>
                  <TableHead scope="col">{dictionary.merchantDashboardRecentColumnSource}</TableHead>
                  <TableHead scope="col">{dictionary.merchantDashboardRecentColumnAmount}</TableHead>
                  <TableHead scope="col">{dictionary.merchantDashboardRecentColumnState}</TableHead>
                  <TableHead scope="col">{dictionary.merchantDashboardRecentColumnCreated}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.recentActivity.map((order) => (
                  <TableRow key={`${order.createdAt.getTime()}-${order.amount}-${order.paymentLinkV2Identifier ?? "direct"}`}>
                    <TableCell>
                      {localizedDescription(locale, order.descriptionPtBr, order.descriptionEn) ?? order.paymentLinkV2Identifier ?? dictionary.merchantDashboardUntitledOrder}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {order.source === "LINK" ? dictionary.merchantDashboardSourceLink : dictionary.merchantDashboardSourceAdHoc}
                      </Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">{formatAmount(dictionary, order, locale)}</TableCell>
                    <TableCell><RecentStateBadge dictionary={dictionary} order={order} /></TableCell>
                    <TableCell className="tabular-nums">{instant(order.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
