import Link from "next/link";
import { redirect } from "next/navigation";

import { formatCatalogPrice } from "@/app/(merchant)/catalog/price-format";
import { dataDirectoryCopy, DirectoryInvalidFiltersNotice } from "@/app/directory-support";
import { WorkspaceHeading } from "@/app-shell/workspace-heading";
import { getPaymentLinkV2ViewService } from "@/auth/payment-link-v2-view";
import { ArrowLeftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DIRECTORY_INVALID_FILTERS_PARAM,
  DIRECTORY_INVALID_FILTERS_VALUE,
  directoryInvalidFiltersLocation,
} from "@/data-directory/server/notice";
import { DataDirectory, type DataDirectoryColumn, type DataDirectoryState } from "@/data-directory/ui/data-directory";
import type { getDictionary } from "@/i18n/dictionaries";
import type { SupportedLocale } from "@/i18n/locales";
import { queryOwnerOrderV2Directory, type OrderV2DirectoryResult } from "@/orders/order-v2-directory";
import type { OrderV2Summary } from "@/orders/order-v2-view";

import { requireMerchantShellContext } from "../../../../shell-context";
import type { LinksSearchParams } from "../../../directory-query";
import { formatLinkInstant, LinkStateBadge, PaymentLinkV2UnavailableCard } from "../../../link-v2-views";
import { OrderV2LocalOutcomeBadge, OrderV2StateBadge, orderV2SummaryLabel } from "./order-v2-views";

type Dictionary = ReturnType<typeof getDictionary>;

// The parent link's identifier is force-bound server-side: a client-supplied
// `filter.link` is never honored — the first occurrence is replaced in place
// (keeping a canonical URL stable across the rebuild) and the rest are dropped.
function drilldownRequestTarget(searchParams: LinksSearchParams, identifier: string, path: string) {
  const entries: Array<[string, string]> = [];
  let bound = false;
  for (const [key, value] of Object.entries(searchParams)) {
    if (value === undefined) continue;
    // The reserved invalid-filters notice pair is a redirect artifact, not a
    // directory param: dropping it here is what keeps the reset redirect
    // from looping back into another invalid-query resolution.
    if (key === DIRECTORY_INVALID_FILTERS_PARAM) continue;
    const values = typeof value === "string" ? [value] : value;
    for (const item of values) {
      if (key === "filter.link") {
        if (!bound) {
          entries.push(["filter.link", identifier]);
          bound = true;
        }
        continue;
      }
      entries.push([key, item]);
    }
  }
  if (!bound) entries.push(["filter.link", identifier]);
  return `${path}?${new URLSearchParams(entries).toString()}`;
}

function pageUrl(path: string, canonicalQuery: string, cursor: string) {
  const parameters = new URLSearchParams(canonicalQuery);
  parameters.delete("cursor");
  return `${path}?${parameters.toString()}&cursor=${cursor}`;
}

function LinkOrderDirectory({
  dictionary,
  locale,
  path,
  requestTarget,
  result,
}: Readonly<{
  dictionary: Dictionary;
  locale: SupportedLocale;
  path: string;
  requestTarget: string;
  result: Extract<OrderV2DirectoryResult, { status: "ready" }> | null;
}>) {
  const copy = dataDirectoryCopy(dictionary, {
    title: dictionary.paymentLinkOrdersEmpty,
    description: dictionary.paymentLinkOrdersEmptyDescription,
  });
  const columns: readonly DataDirectoryColumn<OrderV2Summary>[] = [
    {
      id: "order",
      label: dictionary.paymentLinkOrderDetailHeading,
      value: (row) => (
        <span className="flex flex-col gap-1">
          <span className="font-mono text-xs">{row.id}</span>
          <span className="text-xs text-muted-foreground">{orderV2SummaryLabel(row, locale)}</span>
        </span>
      ),
    },
    { id: "amount", label: dictionary.orderAmount, numeric: true, value: (row) => <span className="font-mono tabular-nums">{formatCatalogPrice(row.amount, null, locale)}</span> },
    { id: "state", label: dictionary.orderState, value: (row) => <OrderV2StateBadge dictionary={dictionary} state={row.state} /> },
    { id: "outcome", label: dictionary.paymentLinkOrderLocalOutcome, value: (row) => <OrderV2LocalOutcomeBadge dictionary={dictionary} outcome={row.currentLocalOutcome} /> },
    { id: "created", label: dictionary.orderCreated, value: (row) => <span className="text-xs">{formatLinkInstant(row.createdAt, locale)}</span> },
  ];

  if (result === null) {
    return (
      <DataDirectory
        caption={dictionary.paymentLinkOrdersHeading}
        columns={columns}
        copy={copy}
        formAction={path}
        idPrefix="payment-link-v2-orders"
        resetUrl={path}
        retryUrl={path}
        rowKey={(row) => row.id}
        rows={[]}
        state="error"
      />
    );
  }

  const canonicalQuery = requestTarget.slice(requestTarget.indexOf("?") + 1);
  const parameters = new URLSearchParams(canonicalQuery);
  const search = parameters.get("q");
  const filtering = [...parameters.keys()].some((key) => key !== "filter.link" && key !== "pageSize");
  const state: DataDirectoryState = result.rows.length === 0
    ? filtering ? "filtered-empty" : "empty"
    : "ready";

  return (
    <DataDirectory
      actionsLabel={dictionary.paymentLinkDirectoryColumnActions}
      caption={dictionary.paymentLinkOrdersHeading}
      columns={columns}
      copy={copy}
      formAction={path}
      getRowActions={(row) => (
        <Button asChild data-ds-hit-target size="sm" variant="outline">
          <Link href={`${path}/${row.id}`}>{dictionary.ordersView}</Link>
        </Button>
      )}
      getRowHref={(row) => `${path}/${row.id}`}
      idPrefix="payment-link-v2-orders"
      {...(result.nextCursor ? { nextUrl: pageUrl(path, canonicalQuery, result.nextCursor) } : {})}
      pageSize={result.pageSize}
      {...(result.previousCursor ? { previousUrl: pageUrl(path, canonicalQuery, result.previousCursor) } : {})}
      resetUrl={path}
      retryUrl={path}
      rowKey={(row) => row.id}
      rows={result.rows}
      {...(search ? { search } : {})}
      state={state}
    />
  );
}

export default async function PaymentLinkV2OrdersPage({
  params,
  searchParams = Promise.resolve({}),
}: Readonly<{
  params: Promise<{ id: string }>;
  searchParams?: Promise<LinksSearchParams>;
}>) {
  const { dictionary, locale, principal } = await requireMerchantShellContext();
  const id = (await params).id;
  const linkResult = await getPaymentLinkV2ViewService().getForOwner(principal, id);
  if (linkResult.kind !== "found") {
    return (
      <>
        <WorkspaceHeading description={dictionary.paymentLinkDirectoryDescription} eyebrow={dictionary.shellMerchantEyebrow} title={dictionary.shellLinks} />
        <PaymentLinkV2UnavailableCard backHref="/links" dictionary={dictionary} />
      </>
    );
  }

  const link = linkResult.link;
  const path = `/links/v2/${link.id}/orders`;
  const resolvedSearchParams = await searchParams;
  const invalidFiltersNotice = resolvedSearchParams[DIRECTORY_INVALID_FILTERS_PARAM] === DIRECTORY_INVALID_FILTERS_VALUE;
  const requestTarget = drilldownRequestTarget(resolvedSearchParams, link.identifier, path);
  let result: OrderV2DirectoryResult | null = null;
  try {
    result = await queryOwnerOrderV2Directory(requestTarget, path);
  } catch {
    result = null;
  }
  if (result?.status === "redirect") redirect(result.location);
  if (result?.status === "invalid-query") redirect(directoryInvalidFiltersLocation(path));

  return (
    <div className="space-y-4">
      <WorkspaceHeading description={dictionary.paymentLinkOrdersDescription} eyebrow={dictionary.shellMerchantEyebrow} title={dictionary.paymentLinkOrdersHeading} />
      {invalidFiltersNotice ? <DirectoryInvalidFiltersNotice dictionary={dictionary} /> : null}

      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-sm">#{link.identifier}</span>
        <LinkStateBadge dictionary={dictionary} state={link.state} />
        <Button asChild className="ml-auto" data-ds-hit-target size="sm" variant="outline">
          <Link href={`/links/v2/${link.id}`}><ArrowLeftIcon aria-hidden /> {dictionary.paymentLinkBackToDetail}</Link>
        </Button>
      </div>

      <LinkOrderDirectory dictionary={dictionary} locale={locale} path={path} requestTarget={requestTarget} result={result} />
    </div>
  );
}
