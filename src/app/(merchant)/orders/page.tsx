import Link from "next/link";
import { redirect } from "next/navigation";

import { dataDirectoryCopy, DirectoryInvalidFiltersNotice } from "@/app/directory-support";
import {
  formatOrderV2Instant,
  OrderV2PayerFacts,
  OrderV2SourceBadge,
} from "@/app/orders/order-v2-views";
import { orderStateLabel } from "@/app/orders/order-views";
import { WorkspaceHeading } from "@/app-shell/workspace-heading";
import { formatCatalogPrice } from "@/app/(merchant)/catalog/price-format";
import { Button } from "@/components/ui/button";
import { CopyField } from "@/components/ui/copy-field";
import { MoneyText } from "@/components/ui/money-text";
import { LocalOutcomeBadge, ProviderStateBadge, StatusBadge, type LocalOutcome, type ProviderState } from "@/components/ui/status-badge";
import { Separator } from "@/components/ui/separator";
import {
  DIRECTORY_INVALID_FILTERS_PARAM,
  DIRECTORY_INVALID_FILTERS_VALUE,
  directoryInvalidFiltersLocation,
} from "@/data-directory/server/notice";
import { DataDirectory, type DataDirectoryColumn, type DataDirectoryState } from "@/data-directory/ui/data-directory";
import type { getDictionary } from "@/i18n/dictionaries";
import type { SupportedLocale } from "@/i18n/locales";
import { getOrderViewService } from "@/orders/order-view";
import {
  ORDER_V2_DIRECTORY_PAGE_SIZE_POLICY,
  ORDER_V2_DIRECTORY_PATH,
  ORDER_V2_DIRECTORY_STATE_FILTER_VALUES,
  ORDER_V2_DIRECTORY_STATELESS_FILTER_VALUE,
  queryOwnerOrderV2Directory,
  type OrderV2DirectoryResult,
} from "@/orders/order-v2-directory";
import type { OrderV2Summary } from "@/orders/order-v2-view";

import { requireMerchantShellContext } from "../shell-context";
import {
  ORDERS_NOTICE_KEY,
  ordersCanonicalTarget,
  resolveOrdersDirectoryQuery,
  type OrdersSearchParams,
} from "./directory-query";
import { MerchantLegacyOrderTable } from "./legacy-order-table";
import { OrderV2Notice } from "./orders-notices";
import { OrderV2PageSizePreference } from "./page-size-preference";

type Dictionary = ReturnType<typeof getDictionary>;

function firstValue(value: string | readonly string[] | undefined) {
  return typeof value === "string" ? value : value?.[0];
}

function copyLabels(dictionary: Dictionary) {
  return {
    copy: dictionary.orderV2DirectoryCopy,
    pending: dictionary.orderV2DirectoryCopy,
    copied: dictionary.orderV2DirectoryCopied,
    failed: dictionary.orderV2DirectoryCopyFailed,
  };
}

function pageUrl(query: Readonly<{ canonicalFilterQuery: string; pageSize: number }>, cursor: string | undefined) {
  const parameters = [
    query.canonicalFilterQuery,
    query.pageSize === ORDER_V2_DIRECTORY_PAGE_SIZE_POLICY.defaultSize ? "" : `pageSize=${query.pageSize}`,
    cursor ? `cursor=${cursor}` : "",
  ].filter((entry) => entry !== "").join("&");
  return parameters ? `${ORDER_V2_DIRECTORY_PATH}?${parameters}` : ORDER_V2_DIRECTORY_PATH;
}

// The eight registered `state` filter members share the domain badge's
// closed lowercase union exactly; only the stateless member and casing
// differ from the stored `PaymentLinkOrderState` vocabulary. Mirrors the
// administrator directory's local presentation (10.2.1) on the owner scope.
function providerStateLabels(dictionary: Dictionary): Readonly<Record<ProviderState, string>> {
  return {
    created: orderStateLabel(dictionary, "CREATED"),
    pending: orderStateLabel(dictionary, "PENDING"),
    confirmed: orderStateLabel(dictionary, "CONFIRMED"),
    rejected: orderStateLabel(dictionary, "REJECTED"),
    cancelled: orderStateLabel(dictionary, "CANCELLED"),
    expired: orderStateLabel(dictionary, "EXPIRED"),
    indeterminate: orderStateLabel(dictionary, "INDETERMINATE"),
    refunded: orderStateLabel(dictionary, "REFUNDED"),
  };
}

// The registered `state` filter's label, including the explicit stateless
// option the eight `PaymentLinkOrderState` members do not carry.
function orderStateFilterLabel(
  dictionary: Dictionary,
  value: (typeof ORDER_V2_DIRECTORY_STATE_FILTER_VALUES)[number],
) {
  return value === ORDER_V2_DIRECTORY_STATELESS_FILTER_VALUE
    ? dictionary.orderV2DirectoryStateNone
    : orderStateLabel(dictionary, value);
}

// A null provider state has no member in `ProviderState`; it renders through
// the neutral `StatusBadge` instead, same as the state filter's stateless
// option.
function ProviderStateCell({ dictionary, row }: Readonly<{ dictionary: Dictionary; row: OrderV2Summary }>) {
  if (row.state === null) return <StatusBadge label={dictionary.orderV2DirectoryStateNone} tone="neutral" />;
  return <ProviderStateBadge labels={providerStateLabels(dictionary)} state={row.state.toLowerCase() as ProviderState} />;
}

// `LOCAL_CANCELLED` has no member in `LocalOutcome`; it renders through the
// domain-matching danger `StatusBadge` instead, mirroring the tone
// `orderV2OutcomeTone` already assigns it.
function LocalOutcomeCell({ dictionary, row }: Readonly<{ dictionary: Dictionary; row: OrderV2Summary }>) {
  if (row.currentLocalOutcome === null) {
    return <LocalOutcomeBadge labels={{ finalized: dictionary.orderV2DirectoryOutcomeFinalized, "in-progress": dictionary.orderV2DirectoryOutcomeNone, none: dictionary.orderV2DirectoryOutcomeNone } satisfies Readonly<Record<LocalOutcome, string>>} outcome="none" />;
  }
  if (row.currentLocalOutcome.outcome === "LOCAL_CANCELLED") return <StatusBadge label={dictionary.orderV2DirectoryOutcomeCancelled} tone="danger" />;
  return <LocalOutcomeBadge labels={{ finalized: dictionary.orderV2DirectoryOutcomeFinalized, "in-progress": dictionary.orderV2DirectoryOutcomeNone, none: dictionary.orderV2DirectoryOutcomeNone } satisfies Readonly<Record<LocalOutcome, string>>} outcome="finalized" />;
}

function OrderV2Directory({
  dictionary,
  locale,
  page,
  query,
}: Readonly<{
  dictionary: Dictionary;
  locale: SupportedLocale;
  page: Extract<OrderV2DirectoryResult, { status: "ready" }> | null;
  query: Extract<ReturnType<typeof resolveOrdersDirectoryQuery>, { status: "ready" }>;
}>) {
  const copy = dataDirectoryCopy(dictionary, { title: dictionary.orderV2DirectoryEmpty, description: dictionary.orderV2DirectoryEmptyDescription });
  const columns: readonly DataDirectoryColumn<OrderV2Summary>[] = [
    { id: "payer", label: dictionary.orderV2DirectoryColumnPayer, value: (row) => <OrderV2PayerFacts dictionary={dictionary} payer={row.payer} /> },
    { id: "source", label: dictionary.orderV2DirectoryColumnSource, value: (row) => <OrderV2SourceBadge dictionary={dictionary} source={row.source} /> },
    {
      id: "link",
      label: dictionary.orderV2DirectoryColumnLink,
      value: (row) => row.paymentLinkV2Identifier
        ? <CopyField labels={copyLabels(dictionary)} value={row.paymentLinkV2Identifier} variant="compact" />
        : dictionary.orderV2DirectoryLinkNone,
    },
    { id: "state", label: dictionary.orderV2DirectoryColumnState, value: (row) => <ProviderStateCell dictionary={dictionary} row={row} /> },
    { id: "outcome", label: dictionary.orderV2DirectoryColumnOutcome, value: (row) => <LocalOutcomeCell dictionary={dictionary} row={row} /> },
    { id: "amount", label: dictionary.orderV2DirectoryColumnAmount, numeric: true, value: (row) => <MoneyText value={formatCatalogPrice(row.amount, null, locale)} /> },
    { id: "created", label: dictionary.orderV2DirectoryColumnCreated, numeric: true, value: (row) => formatOrderV2Instant(row.createdAt, locale) },
  ];

  const rows = page?.rows ?? [];
  const filtering = Boolean(query.query.q) || Object.keys(query.query.filters).length > 0 || query.cursor !== undefined;
  const state: DataDirectoryState = page === null
    ? "error"
    : rows.length === 0
      ? filtering ? "filtered-empty" : "empty"
      : "ready";

  return (
    <DataDirectory
      actionsLabel={dictionary.orderV2DirectoryColumnActions}
      canonicalFilterQuery={query.query.canonicalFilterQuery}
      caption={dictionary.orderV2DirectoryHeading}
      columns={columns}
      copy={copy}
      emptyAction={{ href: "/links/new", label: dictionary.paymentLinkCreateTitle }}
      filters={[
        {
          name: "source",
          label: dictionary.orderV2DirectoryFilterSource,
          allLabel: dictionary.orderV2DirectoryFilterAllSources,
          ...(firstValue(query.query.filters.source) ? { selected: firstValue(query.query.filters.source) } : {}),
          options: [
            { value: "LINK", label: dictionary.orderV2DirectorySourceLink },
            { value: "AD_HOC", label: dictionary.orderV2DirectorySourceAdHoc },
            { value: "STANDALONE", label: dictionary.orderV2DirectorySourceStandalone },
          ],
        },
        {
          name: "state",
          label: dictionary.orderV2DirectoryFilterState,
          allLabel: dictionary.orderV2DirectoryFilterAllStates,
          ...(firstValue(query.query.filters.state) ? { selected: firstValue(query.query.filters.state) } : {}),
          options: ORDER_V2_DIRECTORY_STATE_FILTER_VALUES.map((value) => ({
            value,
            label: orderStateFilterLabel(dictionary, value),
          })),
        },
        {
          name: "money",
          label: dictionary.orderV2DirectoryFilterMoney,
          allLabel: dictionary.orderV2DirectoryFilterAllMoney,
          ...(firstValue(query.query.filters.money) ? { selected: firstValue(query.query.filters.money) } : {}),
          options: [
            { value: "USD", label: dictionary.orderV2DirectoryMoneyUsd },
            { value: "FIAT", label: dictionary.orderV2DirectoryMoneyFiat },
          ],
        },
      ]}
      formAction={ORDER_V2_DIRECTORY_PATH}
      getRowActions={(row) => (
        <Button asChild data-ds-hit-target variant="outline">
          <Link href={`/orders/v2/${row.id}`}>{dictionary.orderV2DirectoryView}</Link>
        </Button>
      )}
      getRowHref={(row) => `/orders/v2/${row.id}`}
      idPrefix="orders-v2"
      {...(page?.nextCursor ? { nextUrl: pageUrl(query.query, page.nextCursor) } : {})}
      pageSize={query.query.pageSize}
      pageSizes={ORDER_V2_DIRECTORY_PAGE_SIZE_POLICY.sizes}
      {...(page?.previousCursor ? { previousUrl: pageUrl(query.query, page.previousCursor) } : {})}
      resetUrl={ORDER_V2_DIRECTORY_PATH}
      retryUrl={ORDER_V2_DIRECTORY_PATH}
      rowKey={(row) => row.id}
      rows={rows}
      {...(query.query.q ? { search: query.query.q } : {})}
      state={state}
      textFilters={[
        {
          name: "link",
          label: dictionary.orderV2DirectoryFilterLink,
          placeholder: dictionary.orderV2DirectoryFilterLinkPlaceholder,
          ...(firstValue(query.query.filters.link) ? { selected: firstValue(query.query.filters.link) } : {}),
        },
        {
          name: "from",
          label: dictionary.orderV2DirectoryFilterFrom,
          calendarDay: true,
          ...(firstValue(query.query.filters.from) ? { selected: firstValue(query.query.filters.from) } : {}),
        },
        {
          name: "to",
          label: dictionary.orderV2DirectoryFilterTo,
          calendarDay: true,
          ...(firstValue(query.query.filters.to) ? { selected: firstValue(query.query.filters.to) } : {}),
        },
      ]}
    />
  );
}

export default async function MerchantOrdersPage({
  searchParams = Promise.resolve({}),
}: Readonly<{
  searchParams?: Promise<OrdersSearchParams>;
}> = {}) {
  const { dictionary, locale, principal } = await requireMerchantShellContext();
  const resolvedSearchParams = await searchParams;
  const invalidFiltersNotice = resolvedSearchParams[DIRECTORY_INVALID_FILTERS_PARAM] === DIRECTORY_INVALID_FILTERS_VALUE;
  const query = resolveOrdersDirectoryQuery({ searchParams: resolvedSearchParams, principal });
  if (query.status === "redirect") redirect(query.location);
  if (query.status === "invalid-query") redirect(directoryInvalidFiltersLocation(ORDER_V2_DIRECTORY_PATH));

  // The frozen V1 section keeps its exact behavior, including its own failure
  // propagation; only the V2 directory read degrades into the error state.
  const data = await getOrderViewService().listForOwner(principal);
  let page: Extract<OrderV2DirectoryResult, { status: "ready" }> | null = null;
  // The delivered service rejects ungrammatical calendar days after
  // canonicalization; that resolves through the same reset-with-notice route.
  let serviceRedirect: string | null = null;
  try {
    const result = await queryOwnerOrderV2Directory(ordersCanonicalTarget(query));
    if (result.status === "ready") page = result;
    else if (result.status === "invalid-query") serviceRedirect = directoryInvalidFiltersLocation(ORDER_V2_DIRECTORY_PATH);
    else serviceRedirect = result.location;
  } catch {
    page = null;
  }
  if (serviceRedirect !== null) redirect(serviceRedirect);

  return (
    <>
      <WorkspaceHeading description={dictionary.orderV2DirectoryDescription} eyebrow={dictionary.shellMerchantEyebrow} title={dictionary.ordersHeading} />
      {invalidFiltersNotice ? <DirectoryInvalidFiltersNotice dictionary={dictionary} /> : null}
      {query.notice ? <OrderV2Notice dictionary={dictionary} notice={query.notice} /> : null}
      <OrderV2PageSizePreference
        defaultSize={ORDER_V2_DIRECTORY_PAGE_SIZE_POLICY.defaultSize}
        noticeKey={ORDERS_NOTICE_KEY}
        registeredSizes={ORDER_V2_DIRECTORY_PAGE_SIZE_POLICY.sizes}
        selectId="orders-v2-page-size"
        storageKey="qr-orders-v2-page-size"
      />
      <OrderV2Directory dictionary={dictionary} locale={locale} page={page} query={query} />
      <Separator />
      <section aria-labelledby="legacy-orders-heading" className="flex flex-col gap-6">
        <header className="workspace-heading">
          <h2 id="legacy-orders-heading">{dictionary.orderV2DirectoryLegacyHeading}</h2>
          <p>{dictionary.orderV2DirectoryLegacyDescription}</p>
        </header>
        <MerchantLegacyOrderTable detailHref={(orderId) => `/orders/${orderId}`} dictionary={dictionary} locale={locale} orders={data} />
      </section>
    </>
  );
}
