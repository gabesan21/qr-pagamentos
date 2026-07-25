import Link from "next/link";
import { redirect } from "next/navigation";

import { OrderListCard } from "@/app/orders/order-views";
import {
  formatOrderV2Instant,
  OrderV2OutcomeBadge,
  OrderV2PayerFacts,
  OrderV2StateBadge,
  orderV2SourceLabel,
} from "@/app/orders/order-v2-views";
import { WorkspaceHeading } from "@/app-shell/workspace-heading";
import { formatCatalogPrice } from "@/app/(merchant)/catalog/price-format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { DataDirectory, type DataDirectoryColumn, type DataDirectoryState } from "@/data-directory/ui/data-directory";
import type { getDictionary } from "@/i18n/dictionaries";
import type { SupportedLocale } from "@/i18n/locales";
import { getOrderViewService } from "@/orders/order-view";
import {
  ORDER_V2_DIRECTORY_PAGE_SIZE_POLICY,
  ORDER_V2_DIRECTORY_PATH,
  queryOwnerOrderV2Directory,
  type OrderV2DirectoryResult,
} from "@/orders/order-v2-directory";
import type { OrderV2Summary } from "@/orders/order-v2-view";

import { requireMerchantShellContext } from "../shell-context";
import { ordersDirectoryCopy } from "./directory-copy";
import {
  ORDERS_NOTICE_KEY,
  ordersCanonicalTarget,
  resolveOrdersDirectoryQuery,
  type OrdersSearchParams,
} from "./directory-query";
import { OrderV2Notice } from "./orders-notices";
import { OrderV2PageSizePreference } from "./page-size-preference";

type Dictionary = ReturnType<typeof getDictionary>;

function firstValue(value: string | readonly string[] | undefined) {
  return typeof value === "string" ? value : value?.[0];
}

function pageUrl(query: Readonly<{ canonicalFilterQuery: string; pageSize: number }>, cursor: string | undefined) {
  const parameters = [
    query.canonicalFilterQuery,
    query.pageSize === ORDER_V2_DIRECTORY_PAGE_SIZE_POLICY.defaultSize ? "" : `pageSize=${query.pageSize}`,
    cursor ? `cursor=${cursor}` : "",
  ].filter((entry) => entry !== "").join("&");
  return parameters ? `${ORDER_V2_DIRECTORY_PATH}?${parameters}` : ORDER_V2_DIRECTORY_PATH;
}

function OrderV2Directory({
  dictionary,
  locale,
  page,
  query,
  serviceInvalid = false,
}: Readonly<{
  dictionary: Dictionary;
  locale: SupportedLocale;
  page: Extract<OrderV2DirectoryResult, { status: "ready" }> | null;
  query: Extract<ReturnType<typeof resolveOrdersDirectoryQuery>, { status: "ready" | "invalid-query" }>;
  serviceInvalid?: boolean;
}>) {
  const copy = ordersDirectoryCopy(dictionary);
  const columns: readonly DataDirectoryColumn<OrderV2Summary>[] = [
    { id: "payer", label: dictionary.orderV2DirectoryColumnPayer, value: (row) => <OrderV2PayerFacts dictionary={dictionary} payer={row.payer} /> },
    { id: "source", label: dictionary.orderV2DirectoryColumnSource, value: (row) => <Badge variant="outline">{orderV2SourceLabel(dictionary, row.source)}</Badge> },
    { id: "link", label: dictionary.orderV2DirectoryColumnLink, value: (row) => row.paymentLinkV2Identifier ?? dictionary.orderV2DirectoryLinkNone },
    { id: "state", label: dictionary.orderV2DirectoryColumnState, value: (row) => <OrderV2StateBadge dictionary={dictionary} state={row.state} /> },
    { id: "outcome", label: dictionary.orderV2DirectoryColumnOutcome, value: (row) => <OrderV2OutcomeBadge dictionary={dictionary} outcome={row.currentLocalOutcome} /> },
    { id: "amount", label: dictionary.orderV2DirectoryColumnAmount, numeric: true, value: (row) => formatCatalogPrice(row.amount, null, locale) },
    { id: "created", label: dictionary.orderV2DirectoryColumnCreated, numeric: true, value: (row) => formatOrderV2Instant(row.createdAt, locale) },
  ];

  if (query.status === "invalid-query" || serviceInvalid) {
    return (
      <DataDirectory
        caption={dictionary.orderV2DirectoryHeading}
        columns={columns}
        copy={copy}
        formAction={ORDER_V2_DIRECTORY_PATH}
        idPrefix="orders-v2"
        resetUrl={ORDER_V2_DIRECTORY_PATH}
        rowKey={(row) => row.id}
        rows={[]}
        state="invalid-query"
      />
    );
  }

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
      caption={dictionary.orderV2DirectoryHeading}
      columns={columns}
      copy={copy}
      filters={[
        {
          name: "source",
          label: dictionary.orderV2DirectoryFilterSource,
          allLabel: dictionary.orderV2DirectoryFilterAllSources,
          ...(firstValue(query.query.filters.source) ? { selected: firstValue(query.query.filters.source) } : {}),
          options: [
            { value: "LINK", label: dictionary.orderV2DirectorySourceLink },
            { value: "AD_HOC", label: dictionary.orderV2DirectorySourceAdHoc },
          ],
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
  const query = resolveOrdersDirectoryQuery({ searchParams: await searchParams, principal });
  if (query.status === "redirect") redirect(query.location);

  // The frozen V1 section keeps its exact behavior, including its own failure
  // propagation; only the V2 directory read degrades into the error state.
  const data = await getOrderViewService().listForOwner(principal);
  let page: Extract<OrderV2DirectoryResult, { status: "ready" }> | null = null;
  // The delivered service rejects ungrammatical calendar days after
  // canonicalization; that is the same zero-I/O invalid-query state.
  let serviceInvalid = false;
  let serviceRedirect: string | null = null;
  if (query.status === "ready") {
    try {
      const result = await queryOwnerOrderV2Directory(ordersCanonicalTarget(query));
      if (result.status === "ready") page = result;
      else if (result.status === "invalid-query") serviceInvalid = true;
      else serviceRedirect = result.location;
    } catch {
      page = null;
    }
  }
  if (serviceRedirect !== null) redirect(serviceRedirect);

  return (
    <>
      <WorkspaceHeading description={dictionary.orderV2DirectoryDescription} eyebrow={dictionary.shellMerchantEyebrow} title={dictionary.ordersHeading} />
      {query.status === "ready" && query.notice ? <OrderV2Notice dictionary={dictionary} notice={query.notice} /> : null}
      {query.status === "ready" ? (
        <OrderV2PageSizePreference
          defaultSize={ORDER_V2_DIRECTORY_PAGE_SIZE_POLICY.defaultSize}
          noticeKey={ORDERS_NOTICE_KEY}
          registeredSizes={ORDER_V2_DIRECTORY_PAGE_SIZE_POLICY.sizes}
          selectId="orders-v2-page-size"
          storageKey="qr-orders-v2-page-size"
        />
      ) : null}
      <OrderV2Directory dictionary={dictionary} locale={locale} page={page} query={query} serviceInvalid={serviceInvalid} />
      <Separator />
      <section aria-labelledby="legacy-orders-heading" className="flex flex-col gap-6">
        <header className="workspace-heading">
          <h2 id="legacy-orders-heading">{dictionary.orderV2DirectoryLegacyHeading}</h2>
          <p>{dictionary.orderV2DirectoryLegacyDescription}</p>
        </header>
        <OrderListCard detailHref={(orderId) => `/orders/${orderId}`} dictionary={dictionary} locale={locale} orders={data} />
      </section>
    </>
  );
}
