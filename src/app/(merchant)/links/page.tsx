import Link from "next/link";
import { redirect } from "next/navigation";
import { ListOrderedIcon, PlusIcon, Share2Icon } from "lucide-react";

import { OwnerPaymentLinkManagement } from "@/app/admin/payment-link-management";
import { dataDirectoryCopy, DirectoryInvalidFiltersNotice } from "@/app/directory-support";
import { WorkspaceHeading } from "@/app-shell/workspace-heading";
import { getPaymentLinkService } from "@/auth/payment-link";
import {
  getPaymentLinkV2DirectoryAdapter,
  PAYMENT_LINK_V2_DERIVED_STATES,
  type PaymentLinkV2DirectoryRow,
} from "@/auth/payment-link-v2-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyField } from "@/components/ui/copy-field";
import { Separator } from "@/components/ui/separator";
import {
  queryMerchantDirectory,
  type DirectoryOrderField,
  type DirectoryPage,
} from "@/data-directory/server/directory-page";
import {
  DIRECTORY_INVALID_FILTERS_PARAM,
  DIRECTORY_INVALID_FILTERS_VALUE,
  directoryInvalidFiltersLocation,
} from "@/data-directory/server/notice";
import { DataDirectory, type DataDirectoryColumn, type DataDirectoryState } from "@/data-directory/ui/data-directory";
import type { getDictionary } from "@/i18n/dictionaries";
import type { SupportedLocale } from "@/i18n/locales";

import { requireMerchantShellContext } from "../shell-context";
import {
  LINKS_DIRECTORY_ID,
  LINKS_DIRECTORY_ORDER_ID,
  LINKS_DIRECTORY_PATH,
  resolveLinksDirectoryQuery,
  type LinksSearchParams,
} from "./directory-query";
import { PaymentLinkV2Notice } from "./links-notices";
import { copyLabels, formatLinkInstant, LinkStateBadge, linkKindLabel, linkSummary, linkTypeLabel } from "./link-v2-views";

type Dictionary = ReturnType<typeof getDictionary>;

const DIRECTORY_ORDER: readonly DirectoryOrderField<PaymentLinkV2DirectoryRow>[] = [
  { id: "createdAt", direction: "desc", value: (row) => row.createdAt.getTime() },
  { id: "id", direction: "desc", value: (row) => row.id, keyRole: "UNIQUE_IMMUTABLE_ID" },
];

function firstValue(value: string | readonly string[] | undefined) {
  return typeof value === "string" ? value : value?.[0];
}

function pageUrl(query: Readonly<{ canonicalFilterQuery: string; pageSize: number }>, cursor: string | undefined) {
  const parameters = [
    query.canonicalFilterQuery,
    query.pageSize === 25 ? "" : `pageSize=${query.pageSize}`,
    cursor ? `cursor=${cursor}` : "",
  ].filter((entry) => entry !== "").join("&");
  return parameters ? `${LINKS_DIRECTORY_PATH}?${parameters}` : LINKS_DIRECTORY_PATH;
}

function PaymentLinkDirectory({
  dictionary,
  locale,
  page,
  query,
}: Readonly<{
  dictionary: Dictionary;
  locale: SupportedLocale;
  page: DirectoryPage<PaymentLinkV2DirectoryRow> | null;
  query: Extract<ReturnType<typeof resolveLinksDirectoryQuery>, { status: "ready" }>;
}>) {
  const copy = dataDirectoryCopy(dictionary, {
    title: dictionary.paymentLinkDirectoryEmpty,
    description: dictionary.paymentLinkDirectoryEmptyDescription,
  });
  const columns: readonly DataDirectoryColumn<PaymentLinkV2DirectoryRow>[] = [
    {
      id: "identifier",
      label: dictionary.paymentLinkDirectoryColumnIdentifier,
      value: (row) => <CopyField labels={copyLabels(dictionary)} truncate value={row.identifier} />,
    },
    {
      id: "summary",
      label: dictionary.paymentLinkDirectoryColumnSummary,
      value: (row) => <span className="text-sm text-muted-foreground line-clamp-2">{linkSummary(row, locale)}</span>,
    },
    {
      id: "composition",
      label: dictionary.paymentLinkDirectoryColumnComposition,
      value: (row) => <Badge variant="outline">{linkKindLabel(dictionary, row.compositionKind)}</Badge>,
    },
    {
      id: "type",
      label: dictionary.paymentLinkDirectoryColumnType,
      value: (row) => <Badge variant="outline">{linkTypeLabel(dictionary, row.linkType)}</Badge>,
    },
    {
      id: "state",
      label: dictionary.paymentLinkDirectoryColumnState,
      value: (row) => <LinkStateBadge dictionary={dictionary} state={row.state} />,
    },
    {
      id: "dates",
      label: dictionary.paymentLinkDirectoryColumnDates,
      value: (row) => (
        <div className="text-xs leading-4">
          <div>{formatLinkInstant(row.createdAt, locale)}</div>
          <div className="text-muted-foreground">{row.expiresAt ? formatLinkInstant(row.expiresAt, locale) : dictionary.adminPaymentLinkNoExpiry}</div>
        </div>
      ),
    },
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
      caption={dictionary.paymentLinkDirectoryHeading}
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
      ]}
      formAction={LINKS_DIRECTORY_PATH}
      getRowActions={(row) => (
        <span className="flex flex-wrap gap-2">
          <Button asChild data-ds-hit-target size="icon" variant="outline">
            <a aria-label={dictionary.paymentLinkDirectoryShareOpen} href={row.sharePath}><Share2Icon aria-hidden /></a>
          </Button>
          <Button asChild data-ds-hit-target variant="outline">
            <Link href={`/links/v2/${row.id}`}>{dictionary.paymentLinkDirectoryView}</Link>
          </Button>
          <Button asChild data-ds-hit-target size="icon" variant="outline">
            <Link aria-label={dictionary.paymentLinkOrdersView} href={`/links/v2/${row.id}/orders`}><ListOrderedIcon aria-hidden /></Link>
          </Button>
        </span>
      )}
      getRowHref={(row) => `/links/v2/${row.id}`}
      idPrefix="payment-links-v2"
      {...(page?.nextCursor ? { nextUrl: pageUrl(query.query, page.nextCursor) } : {})}
      pageSize={query.query.pageSize}
      {...(page?.previousCursor ? { previousUrl: pageUrl(query.query, page.previousCursor) } : {})}
      resetUrl={LINKS_DIRECTORY_PATH}
      retryUrl={LINKS_DIRECTORY_PATH}
      rowKey={(row) => row.id}
      rows={rows}
      {...(query.query.q ? { search: query.query.q } : {})}
      state={state}
    />
  );
}

export default async function MerchantLinksPage({
  searchParams = Promise.resolve({}),
}: Readonly<{
  searchParams?: Promise<LinksSearchParams>;
}> = {}) {
  const { dictionary, locale, principal } = await requireMerchantShellContext();
  const resolvedSearchParams = await searchParams;
  const invalidFiltersNotice = resolvedSearchParams[DIRECTORY_INVALID_FILTERS_PARAM] === DIRECTORY_INVALID_FILTERS_VALUE;
  const query = resolveLinksDirectoryQuery({ searchParams: resolvedSearchParams, principal });
  if (query.status === "redirect") redirect(query.location);
  if (query.status === "invalid-query") redirect(directoryInvalidFiltersLocation(LINKS_DIRECTORY_PATH));

  // The frozen V1 section keeps its exact behavior, including its own failure
  // propagation; only the V2 directory read degrades into the error state.
  const data = await getPaymentLinkService().listForOwner(principal);
  let page: DirectoryPage<PaymentLinkV2DirectoryRow> | null = null;
  try {
    page = await queryMerchantDirectory({
      principal,
      directory: LINKS_DIRECTORY_ID,
      orderId: LINKS_DIRECTORY_ORDER_ID,
      order: DIRECTORY_ORDER,
      filters: { ...query.query.filters, ...(query.query.q ? { q: query.query.q } : {}) },
      canonicalFilterQuery: query.query.canonicalFilterQuery,
      pageSize: query.query.pageSize,
      ...(query.cursor ? { cursor: query.cursor } : {}),
      adapter: getPaymentLinkV2DirectoryAdapter(),
    });
  } catch {
    page = null;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <WorkspaceHeading description={dictionary.paymentLinkDirectoryDescription} eyebrow={dictionary.shellMerchantEyebrow} title={dictionary.shellLinks} />
        <Button asChild data-ds-hit-target>
          <Link href="/links/new"><PlusIcon aria-hidden /> {dictionary.paymentLinkCreateTitle}</Link>
        </Button>
      </div>
      {invalidFiltersNotice ? <DirectoryInvalidFiltersNotice dictionary={dictionary} /> : null}
      {query.notice ? <PaymentLinkV2Notice dictionary={dictionary} notice={query.notice} /> : null}
      <PaymentLinkDirectory dictionary={dictionary} locale={locale} page={page} query={query} />
      <Separator />
      <section aria-labelledby="legacy-payment-links-heading" className="flex flex-col gap-6">
        <header className="workspace-heading">
          <h2 id="legacy-payment-links-heading">{dictionary.paymentLinkDirectoryLegacyHeading}</h2>
          <p>{dictionary.paymentLinkDirectoryLegacyDescription}</p>
        </header>
        <OwnerPaymentLinkManagement data={data} dictionary={dictionary} locale={locale} />
      </section>
    </div>
  );
}
