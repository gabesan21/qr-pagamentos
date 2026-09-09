import Link from "next/link";
import { redirect } from "next/navigation";

import {
  copyLabels,
  formatLinkInstant,
  linkKindLabel,
  linkTypeLabel,
} from "@/app/(merchant)/links/link-v2-views";
import { WorkspaceHeading } from "@/app-shell/workspace-heading";
import { dataDirectoryCopy, DirectoryInvalidFiltersNotice } from "@/app/directory-support";
import {
  ADMIN_PAYMENT_LINK_V2_DIRECTORY_PAGE_SIZE_POLICY,
  ADMIN_PAYMENT_LINK_V2_DIRECTORY_PATH,
  queryAdminPaymentLinkV2Directory,
  type AdminPaymentLinkV2DirectoryResult,
  type AdminPaymentLinkV2DirectoryRow,
} from "@/auth/payment-link-v2-admin-directory";
import { PAYMENT_LINK_V2_DERIVED_STATES } from "@/auth/payment-link-v2-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyField } from "@/components/ui/copy-field";
import { MoneyText } from "@/components/ui/money-text";
import { Monogram } from "@/components/ui/monogram";
import { LinkLifecycleBadge, type LinkLifecycle } from "@/components/ui/status-badge";
import {
  DIRECTORY_INVALID_FILTERS_PARAM,
  DIRECTORY_INVALID_FILTERS_VALUE,
  directoryInvalidFiltersLocation,
} from "@/data-directory/server/notice";
import { DataDirectory, type DataDirectoryColumn, type DataDirectoryState } from "@/data-directory/ui/data-directory";
import type { getDictionary } from "@/i18n/dictionaries";
import type { SupportedLocale } from "@/i18n/locales";

import { requireAdminShellContext } from "../shell-context";
import {
  adminPaymentLinksCanonicalTarget,
  resolveAdminPaymentLinksDirectoryQuery,
  type AdminPaymentLinksSearchParams,
} from "./directory-query";

type Dictionary = ReturnType<typeof getDictionary>;

function firstValue(value: string | readonly string[] | undefined) {
  return typeof value === "string" ? value : value?.[0];
}

function pageUrl(query: Readonly<{ canonicalFilterQuery: string; pageSize: number }>, cursor: string | undefined) {
  const parameters = [
    query.canonicalFilterQuery,
    query.pageSize === ADMIN_PAYMENT_LINK_V2_DIRECTORY_PAGE_SIZE_POLICY.defaultSize ? "" : `pageSize=${query.pageSize}`,
    cursor ? `cursor=${cursor}` : "",
  ].filter((entry) => entry !== "").join("&");
  return parameters ? `${ADMIN_PAYMENT_LINK_V2_DIRECTORY_PATH}?${parameters}` : ADMIN_PAYMENT_LINK_V2_DIRECTORY_PATH;
}

// The owner attribution cell: the interim target is the delivered accounts
// surface (10.3.3 repoints it to the per-user profile); a soft-deleted owner
// keeps its rows and gains the localized non-color deleted badge. The link is
// a ghost button so the control keeps the design-system hit target in the cell.
function OwnerCell({ dictionary, owner }: Readonly<{ dictionary: Dictionary; owner: AdminPaymentLinkV2DirectoryRow["owner"] }>) {
  return (
    <div className="flex items-center gap-3">
      <Monogram name={owner.username} />
      <Button asChild className="px-0" data-ds-hit-target variant="ghost">
        <Link href="/admin/accounts">{owner.username}</Link>
      </Button>
      {owner.deletedAt !== null ? <Badge variant="outline">{dictionary.adminPaymentLinkV2DirectoryOwnerDeleted}</Badge> : null}
    </div>
  );
}

// `PaymentLinkV2DerivedState` and `LinkLifecycle` share the exact closed
// vocabulary; only the caller-supplied localized labels differ per surface.
function lifecycleLabels(dictionary: Dictionary): Readonly<Record<LinkLifecycle, string>> {
  return {
    active: dictionary.paymentLinkDirectoryStateActive,
    inactive: dictionary.paymentLinkDirectoryStateInactive,
    expired: dictionary.paymentLinkDirectoryStateExpired,
    paid: dictionary.paymentLinkDirectoryStatePaid,
  };
}

// Fixed-amount links render the redacted pair-labelled amount; product-line
// links render the localized line count instead — never a stored total.
function AmountOrProductsCell({ dictionary, row }: Readonly<{ dictionary: Dictionary; row: AdminPaymentLinkV2DirectoryRow }>) {
  if (row.compositionKind === "FIXED_AMOUNT") {
    return <MoneyText pairLabel={row.currencyPairLabel} value={row.amount ?? "—"} />;
  }
  return <span className="font-mono tabular-nums">{dictionary.paymentLinkDirectoryProductsCount.replace("{count}", String(row.lines.length))}</span>;
}

// Created date with the expiry beneath it, styled in the danger tone once the
// row's read-time state is `expired`.
function CreatedCell({ dictionary, locale, row }: Readonly<{ dictionary: Dictionary; locale: SupportedLocale; row: AdminPaymentLinkV2DirectoryRow }>) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono tabular-nums">{formatLinkInstant(row.createdAt, locale)}</span>
      <span className={row.state === "expired" ? "font-mono text-xs tabular-nums text-danger" : "font-mono text-xs tabular-nums text-muted-foreground"}>
        {row.expiresAt ? formatLinkInstant(row.expiresAt, locale) : dictionary.adminPaymentLinkNoExpiry}
      </span>
    </div>
  );
}

function AdminPaymentLinkV2Directory({
  dictionary,
  locale,
  page,
  query,
}: Readonly<{
  dictionary: Dictionary;
  locale: SupportedLocale;
  page: Extract<AdminPaymentLinkV2DirectoryResult, { status: "ready" }> | null;
  query: Extract<ReturnType<typeof resolveAdminPaymentLinksDirectoryQuery>, { status: "ready" }>;
}>) {
  const copy = dataDirectoryCopy(dictionary, {
    title: dictionary.adminPaymentLinkV2DirectoryEmpty,
    description: dictionary.adminPaymentLinkV2DirectoryEmptyDescription,
  });
  const lifecycleLabelSet = lifecycleLabels(dictionary);
  const columns: readonly DataDirectoryColumn<AdminPaymentLinkV2DirectoryRow>[] = [
    {
      id: "identifier",
      label: dictionary.paymentLinkDirectoryColumnIdentifier,
      value: (row) => <CopyField labels={copyLabels(dictionary)} value={row.identifier} variant="compact" />,
    },
    { id: "merchant", label: dictionary.adminPaymentLinkV2DirectoryColumnOwner, value: (row) => <OwnerCell dictionary={dictionary} owner={row.owner} /> },
    { id: "composition", label: dictionary.paymentLinkDirectoryColumnComposition, value: (row) => <Badge variant="outline">{linkKindLabel(dictionary, row.compositionKind)}</Badge> },
    { id: "type", label: dictionary.paymentLinkDirectoryColumnType, value: (row) => <Badge variant="outline">{linkTypeLabel(dictionary, row.linkType)}</Badge> },
    { id: "state", label: dictionary.paymentLinkDirectoryColumnState, value: (row) => <LinkLifecycleBadge labels={lifecycleLabelSet} lifecycle={row.state} /> },
    { id: "amount", label: dictionary.paymentLinkDirectoryAmount, numeric: true, value: (row) => <AmountOrProductsCell dictionary={dictionary} row={row} /> },
    { id: "orders", label: dictionary.paymentLinkDirectoryColumnOrders, numeric: true, value: (row) => <span className="font-mono tabular-nums">{row.orderCount}</span> },
    { id: "created", label: dictionary.paymentLinkDirectoryCreated, numeric: true, value: (row) => <CreatedCell dictionary={dictionary} locale={locale} row={row} /> },
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
      actionsLabel={dictionary.paymentLinkDirectoryColumnActions}
      canonicalFilterQuery={query.query.canonicalFilterQuery}
      caption={dictionary.adminPaymentLinkV2DirectoryHeading}
      columns={columns}
      copy={copy}
      filters={[
        {
          name: "state",
          label: dictionary.paymentLinkDirectoryFilterState,
          allLabel: dictionary.paymentLinkDirectoryFilterAllStates,
          ...(firstValue(query.query.filters.state) ? { selected: firstValue(query.query.filters.state) } : {}),
          options: PAYMENT_LINK_V2_DERIVED_STATES.map((value) => ({
            value,
            label: value === "active"
              ? dictionary.paymentLinkDirectoryStateActive
              : value === "inactive"
                ? dictionary.paymentLinkDirectoryStateInactive
                : value === "expired"
                  ? dictionary.paymentLinkDirectoryStateExpired
                  : dictionary.paymentLinkDirectoryStatePaid,
          })),
        },
        {
          name: "type",
          label: dictionary.paymentLinkDirectoryFilterType,
          allLabel: dictionary.paymentLinkDirectoryFilterAllTypes,
          ...(firstValue(query.query.filters.type) ? { selected: firstValue(query.query.filters.type) } : {}),
          options: [
            { value: "SINGLE_USE", label: dictionary.adminPaymentLinkSingleUse },
            { value: "REUSABLE", label: dictionary.adminPaymentLinkReusable },
          ],
        },
        {
          name: "kind",
          label: dictionary.paymentLinkDirectoryFilterKind,
          allLabel: dictionary.paymentLinkDirectoryFilterAllKinds,
          ...(firstValue(query.query.filters.kind) ? { selected: firstValue(query.query.filters.kind) } : {}),
          options: [
            { value: "PRODUCT_LINES", label: dictionary.paymentLinkDirectoryKindProductLines },
            { value: "FIXED_AMOUNT", label: dictionary.paymentLinkDirectoryKindFixedAmount },
          ],
        },
        {
          name: "money",
          label: dictionary.paymentLinkDirectoryFilterMoney,
          allLabel: dictionary.paymentLinkDirectoryFilterAllMoney,
          ...(firstValue(query.query.filters.money) ? { selected: firstValue(query.query.filters.money) } : {}),
          options: [
            { value: "USD", label: dictionary.paymentLinkDirectoryMoneyUsd },
            { value: "FIAT", label: dictionary.paymentLinkDirectoryMoneyFiat },
          ],
        },
      ]}
      formAction={ADMIN_PAYMENT_LINK_V2_DIRECTORY_PATH}
      getRowActions={(row) => (
        <Button asChild data-ds-hit-target variant="outline">
          <Link href={`/admin/payment-links/v2/${row.id}`}>{dictionary.paymentLinkDirectoryView}</Link>
        </Button>
      )}
      getRowHref={(row) => `/admin/payment-links/v2/${row.id}`}
      idPrefix="admin-payment-links-v2"
      {...(page?.nextCursor ? { nextUrl: pageUrl(query.query, page.nextCursor) } : {})}
      pageSize={query.query.pageSize}
      pageSizes={ADMIN_PAYMENT_LINK_V2_DIRECTORY_PAGE_SIZE_POLICY.sizes}
      {...(page?.previousCursor ? { previousUrl: pageUrl(query.query, page.previousCursor) } : {})}
      resetUrl={ADMIN_PAYMENT_LINK_V2_DIRECTORY_PATH}
      retryUrl={ADMIN_PAYMENT_LINK_V2_DIRECTORY_PATH}
      rowKey={(row) => row.id}
      rows={rows}
      {...(query.query.q ? { search: query.query.q } : {})}
      state={state}
      textFilters={[
        {
          name: "merchant",
          label: dictionary.paymentLinkDirectoryFilterMerchant,
          ...(firstValue(query.query.filters.merchant) ? { selected: firstValue(query.query.filters.merchant) } : {}),
        },
        {
          name: "from",
          label: dictionary.paymentLinkDirectoryFilterFrom,
          calendarDay: true,
          ...(firstValue(query.query.filters.from) ? { selected: firstValue(query.query.filters.from) } : {}),
        },
        {
          name: "to",
          label: dictionary.paymentLinkDirectoryFilterTo,
          calendarDay: true,
          ...(firstValue(query.query.filters.to) ? { selected: firstValue(query.query.filters.to) } : {}),
        },
      ]}
    />
  );
}

// The administrator global Commerce V2 payment-link directory is V2-only and
// read-only: no administrator V1 link projection exists, and V1 links remain
// merchant-managed through the frozen V1 surfaces.
export default async function AdminPaymentLinksPage({
  searchParams = Promise.resolve({}),
}: Readonly<{
  searchParams?: Promise<AdminPaymentLinksSearchParams>;
}> = {}) {
  const { dictionary, locale, principal } = await requireAdminShellContext();
  const params = await searchParams;
  const invalidFiltersNotice = params[DIRECTORY_INVALID_FILTERS_PARAM] === DIRECTORY_INVALID_FILTERS_VALUE;
  const query = resolveAdminPaymentLinksDirectoryQuery({ searchParams: params, principal });
  if (query.status === "redirect") redirect(query.location);
  if (query.status === "invalid-query") redirect(directoryInvalidFiltersLocation(ADMIN_PAYMENT_LINK_V2_DIRECTORY_PATH));

  let page: Extract<AdminPaymentLinkV2DirectoryResult, { status: "ready" }> | null = null;
  let serviceRedirect: string | null = null;
  try {
    const result = await queryAdminPaymentLinkV2Directory(adminPaymentLinksCanonicalTarget(query));
    // The delivered service rejects ungrammatical calendar days after
    // canonicalization; that is the same zero-I/O invalid-query state, routed
    // the same way as a page-level invalid query.
    if (result.status === "ready") page = result;
    else if (result.status === "invalid-query") serviceRedirect = directoryInvalidFiltersLocation(ADMIN_PAYMENT_LINK_V2_DIRECTORY_PATH);
    else serviceRedirect = result.location;
  } catch {
    page = null;
  }
  if (serviceRedirect !== null) redirect(serviceRedirect);

  return (
    <>
      <WorkspaceHeading description={dictionary.adminPaymentLinkV2DirectoryDescription} eyebrow={dictionary.shellAdminEyebrow} title={dictionary.shellAdminLinksTitle} />
      {invalidFiltersNotice ? <DirectoryInvalidFiltersNotice dictionary={dictionary} /> : null}
      <AdminPaymentLinkV2Directory dictionary={dictionary} locale={locale} page={page} query={query} />
    </>
  );
}
