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
import { dataDirectoryCopy, DirectoryInvalidFiltersNotice } from "@/app/directory-support";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyField } from "@/components/ui/copy-field";
import { MoneyText } from "@/components/ui/money-text";
import { Monogram } from "@/components/ui/monogram";
import { Separator } from "@/components/ui/separator";
import {
  DIRECTORY_INVALID_FILTERS_PARAM,
  DIRECTORY_INVALID_FILTERS_VALUE,
  directoryInvalidFiltersLocation,
} from "@/data-directory/server/notice";
import { DataDirectory, type DataDirectoryColumn, type DataDirectoryState } from "@/data-directory/ui/data-directory";
import type { getDictionary } from "@/i18n/dictionaries";
import type { SupportedLocale } from "@/i18n/locales";
import {
  ADMIN_ORDER_V2_DIRECTORY_PAGE_SIZE_POLICY,
  ADMIN_ORDER_V2_DIRECTORY_PATH,
  queryAdminOrderV2Directory,
  type AdminOrderV2DirectoryResult,
  type AdminOrderV2Summary,
} from "@/orders/order-v2-admin-directory";
import { getOrderViewService } from "@/orders/order-view";

import { requireAdminShellContext } from "../shell-context";
import {
  adminOrdersCanonicalTarget,
  resolveAdminOrdersDirectoryQuery,
  type AdminOrdersSearchParams,
} from "./directory-query";

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
    query.pageSize === ADMIN_ORDER_V2_DIRECTORY_PAGE_SIZE_POLICY.defaultSize ? "" : `pageSize=${query.pageSize}`,
    cursor ? `cursor=${cursor}` : "",
  ].filter((entry) => entry !== "").join("&");
  return parameters ? `${ADMIN_ORDER_V2_DIRECTORY_PATH}?${parameters}` : ADMIN_ORDER_V2_DIRECTORY_PATH;
}

// The owner attribution cell: the interim target is the delivered accounts
// surface (10.3.3 repoints it to the per-user profile); a soft-deleted owner
// keeps its rows and gains the localized non-color deleted badge. The link is
// a ghost button so the control keeps the design-system hit target in the cell.
function OwnerCell({ dictionary, owner }: Readonly<{ dictionary: Dictionary; owner: AdminOrderV2Summary["owner"] }>) {
  return (
    <div className="flex items-center gap-3">
      <Monogram name={owner.username} />
      <Button asChild className="px-0" data-ds-hit-target variant="ghost">
        <Link href="/admin/accounts">{owner.username}</Link>
      </Button>
      {owner.deletedAt !== null ? <Badge variant="outline">{dictionary.adminOrderV2DirectoryOwnerDeleted}</Badge> : null}
    </div>
  );
}

function AdminOrderV2Directory({
  dictionary,
  locale,
  page,
  query,
}: Readonly<{
  dictionary: Dictionary;
  locale: SupportedLocale;
  page: Extract<AdminOrderV2DirectoryResult, { status: "ready" }> | null;
  query: Extract<ReturnType<typeof resolveAdminOrdersDirectoryQuery>, { status: "ready" }>;
}>) {
  const copy = dataDirectoryCopy(dictionary, {
    title: dictionary.adminOrderV2DirectoryEmpty,
    description: dictionary.adminOrderV2DirectoryEmptyDescription,
  });
  const columns: readonly DataDirectoryColumn<AdminOrderV2Summary>[] = [
    { id: "owner", label: dictionary.adminOrderV2DirectoryColumnOwner, value: (row) => <OwnerCell dictionary={dictionary} owner={row.owner} /> },
    { id: "payer", label: dictionary.orderV2DirectoryColumnPayer, value: (row) => <OrderV2PayerFacts dictionary={dictionary} payer={row.payer} /> },
    { id: "source", label: dictionary.orderV2DirectoryColumnSource, value: (row) => <Badge variant="outline">{orderV2SourceLabel(dictionary, row.source)}</Badge> },
    {
      id: "link",
      label: dictionary.orderV2DirectoryColumnLink,
      value: (row) => row.paymentLinkV2Identifier
        ? <CopyField labels={copyLabels(dictionary)} truncate={false} value={row.paymentLinkV2Identifier} />
        : dictionary.orderV2DirectoryLinkNone,
    },
    { id: "state", label: dictionary.orderV2DirectoryColumnState, value: (row) => <OrderV2StateBadge dictionary={dictionary} state={row.state} /> },
    { id: "outcome", label: dictionary.orderV2DirectoryColumnOutcome, value: (row) => <OrderV2OutcomeBadge dictionary={dictionary} outcome={row.currentLocalOutcome} /> },
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
      caption={dictionary.adminOrderV2DirectoryHeading}
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
      formAction={ADMIN_ORDER_V2_DIRECTORY_PATH}
      getRowActions={(row) => (
        <Button asChild data-ds-hit-target variant="outline">
          <Link href={`/admin/orders/v2/${row.id}`}>{dictionary.orderV2DirectoryView}</Link>
        </Button>
      )}
      getRowHref={(row) => `/admin/orders/v2/${row.id}`}
      idPrefix="admin-orders-v2"
      {...(page?.nextCursor ? { nextUrl: pageUrl(query.query, page.nextCursor) } : {})}
      pageSize={query.query.pageSize}
      pageSizes={ADMIN_ORDER_V2_DIRECTORY_PAGE_SIZE_POLICY.sizes}
      {...(page?.previousCursor ? { previousUrl: pageUrl(query.query, page.previousCursor) } : {})}
      resetUrl={ADMIN_ORDER_V2_DIRECTORY_PATH}
      retryUrl={ADMIN_ORDER_V2_DIRECTORY_PATH}
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

export default async function AdminOrdersPage({
  searchParams = Promise.resolve({}),
}: Readonly<{
  searchParams?: Promise<AdminOrdersSearchParams>;
}> = {}) {
  const { dictionary, locale, principal } = await requireAdminShellContext();
  const params = await searchParams;
  const invalidFiltersNotice = params[DIRECTORY_INVALID_FILTERS_PARAM] === DIRECTORY_INVALID_FILTERS_VALUE;
  const query = resolveAdminOrdersDirectoryQuery({ searchParams: params, principal });
  if (query.status === "redirect") redirect(query.location);
  if (query.status === "invalid-query") redirect(directoryInvalidFiltersLocation(ADMIN_ORDER_V2_DIRECTORY_PATH));

  // The frozen V1 ledger keeps its exact behavior, including its own failure
  // propagation; only the V2 directory read degrades into the error state.
  const data = await getOrderViewService().listForAdmin(principal);
  let page: Extract<AdminOrderV2DirectoryResult, { status: "ready" }> | null = null;
  let serviceRedirect: string | null = null;
  try {
    const result = await queryAdminOrderV2Directory(adminOrdersCanonicalTarget(query));
    // The delivered service rejects ungrammatical calendar days after
    // canonicalization; that is the same zero-I/O invalid-query state, routed
    // the same way as a page-level invalid query.
    if (result.status === "ready") page = result;
    else if (result.status === "invalid-query") serviceRedirect = directoryInvalidFiltersLocation(ADMIN_ORDER_V2_DIRECTORY_PATH);
    else serviceRedirect = result.location;
  } catch {
    page = null;
  }
  if (serviceRedirect !== null) redirect(serviceRedirect);

  return (
    <>
      <WorkspaceHeading description={dictionary.adminOrderV2DirectoryDescription} eyebrow={dictionary.shellAdminEyebrow} title={dictionary.ordersHeading} />
      {invalidFiltersNotice ? <DirectoryInvalidFiltersNotice dictionary={dictionary} /> : null}
      <AdminOrderV2Directory dictionary={dictionary} locale={locale} page={page} query={query} />
      <Separator />
      <section aria-labelledby="legacy-orders-heading">
        <header className="workspace-heading">
          <h2 id="legacy-orders-heading">{dictionary.orderV2DirectoryLegacyHeading}</h2>
          <p>{dictionary.orderV2DirectoryLegacyDescription}</p>
        </header>
        <OrderListCard detailHref={(orderId) => `/admin/orders/${orderId}`} dictionary={dictionary} locale={locale} orders={data} />
      </section>
    </>
  );
}
