import Link from "next/link";

import { formatCatalogPrice } from "@/app/(merchant)/catalog/price-format";
import { orderStateLabel } from "@/app/orders/order-views";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MoneyText } from "@/components/ui/money-text";
import { LocalOutcomeBadge, ProviderStateBadge, StatusBadge, type LocalOutcome, type ProviderState } from "@/components/ui/status-badge";
import type { getDictionary } from "@/i18n/dictionaries";
import type { SupportedLocale } from "@/i18n/locales";
import {
  ADMIN_ORDER_V2_DIRECTORY_PAGE_SIZE_POLICY,
  ADMIN_ORDER_V2_DIRECTORY_PATH,
  queryAdminOrderV2Directory,
  type AdminOrderV2Summary,
} from "@/orders/order-v2-admin-directory";

type Dictionary = ReturnType<typeof getDictionary>;

// Mirrors the admin orders directory's own provider-state label map
// (src/app/admin/orders/page.tsx): same eight `PaymentLinkOrderState`
// members, same localized labels, kept local because the directory page
// does not export it.
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

// A null provider state has no member in `ProviderState`; render it through
// the neutral `StatusBadge` instead, mirroring the directory page's own
// `ProviderStateCell`.
function ProviderStateCell({ dictionary, order }: Readonly<{ dictionary: Dictionary; order: AdminOrderV2Summary }>) {
  if (order.state === null) return <StatusBadge label={dictionary.orderV2DirectoryStateNone} tone="neutral" />;
  return <ProviderStateBadge labels={providerStateLabels(dictionary)} state={order.state.toLowerCase() as ProviderState} />;
}

const localOutcomeLabels = (dictionary: Dictionary) =>
  ({
    finalized: dictionary.orderV2DirectoryOutcomeFinalized,
    "in-progress": dictionary.orderV2DirectoryOutcomeNone,
    none: dictionary.orderV2DirectoryOutcomeNone,
  }) satisfies Readonly<Record<LocalOutcome, string>>;

// `LOCAL_CANCELLED` has no member in `LocalOutcome`; render it through the
// domain-matching danger `StatusBadge` instead, mirroring the directory
// page's own `LocalOutcomeCell`.
function LocalOutcomeCell({ dictionary, order }: Readonly<{ dictionary: Dictionary; order: AdminOrderV2Summary }>) {
  if (order.currentLocalOutcome === null) {
    return <LocalOutcomeBadge labels={localOutcomeLabels(dictionary)} outcome="none" />;
  }
  if (order.currentLocalOutcome.outcome === "LOCAL_CANCELLED") return <StatusBadge label={dictionary.orderV2DirectoryOutcomeCancelled} tone="danger" />;
  return <LocalOutcomeBadge labels={localOutcomeLabels(dictionary)} outcome="finalized" />;
}

// Admin-local card, bound to a single payment link's identifier: it issues one
// bounded read of the delivered administrator order directory (10.2.1)
// filtered by `filter.link`, rendering at most five rows. No mutation, no
// owner-only surface, no field beyond what the delivered directory already
// exposes.
const ASSOCIATED_ORDERS_TAKE = 5;

export async function AssociatedOrdersCard({
  dictionary,
  linkIdentifier,
  locale,
}: Readonly<{ dictionary: Dictionary; linkIdentifier: string; locale: SupportedLocale }>) {
  const requestTarget = `${ADMIN_ORDER_V2_DIRECTORY_PATH}?filter.link=${encodeURIComponent(linkIdentifier)}&pageSize=${ADMIN_ORDER_V2_DIRECTORY_PAGE_SIZE_POLICY.sizes[0]}`;
  let rows: readonly AdminOrderV2Summary[] = [];
  try {
    const result = await queryAdminOrderV2Directory(requestTarget);
    if (result.status === "ready") rows = result.rows;
  } catch {
    rows = [];
  }
  const visible = rows.slice(0, ASSOCIATED_ORDERS_TAKE);
  const viewAllHref = `${ADMIN_ORDER_V2_DIRECTORY_PATH}?filter.link=${encodeURIComponent(linkIdentifier)}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{dictionary.adminPaymentLinkOrdersCardHeading}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {visible.length === 0
          ? <p className="text-sm text-muted-foreground">{dictionary.adminPaymentLinkOrdersCardEmpty}</p>
          : (
            <ul className="space-y-3">
              {visible.map((order) => (
                <li className="flex items-center justify-between gap-3 rounded-md border border-border p-3" key={order.id}>
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <ProviderStateCell dictionary={dictionary} order={order} />
                      <LocalOutcomeCell dictionary={dictionary} order={order} />
                    </div>
                    <MoneyText value={formatCatalogPrice(order.amount, null, locale)} />
                  </div>
                  <Button asChild data-ds-hit-target variant="outline">
                    <Link href={`/admin/orders/v2/${order.id}`}>{dictionary.adminPaymentLinkOrdersCardViewOrder}</Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        <Button asChild className="w-full" data-ds-hit-target variant="outline">
          <Link href={viewAllHref}>{dictionary.adminPaymentLinkOrdersCardViewAll}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
