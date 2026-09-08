import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MoneyText } from "@/components/ui/money-text";
import { StatusBadge } from "@/components/ui/status-badge";
import type { getDictionary } from "@/i18n/dictionaries";
import {
  ADMIN_ORDER_V2_DIRECTORY_PAGE_SIZE_POLICY,
  ADMIN_ORDER_V2_DIRECTORY_PATH,
  queryAdminOrderV2Directory,
  type AdminOrderV2Summary,
} from "@/orders/order-v2-admin-directory";

type Dictionary = ReturnType<typeof getDictionary>;

// Admin-local card, bound to a single payment link's identifier: it issues one
// bounded read of the delivered administrator order directory (10.2.1)
// filtered by `filter.link`, rendering at most five rows. No mutation, no
// owner-only surface, no field beyond what the delivered directory already
// exposes.
const ASSOCIATED_ORDERS_TAKE = 5;

export async function AssociatedOrdersCard({
  dictionary,
  linkIdentifier,
}: Readonly<{ dictionary: Dictionary; linkIdentifier: string }>) {
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
                      <StatusBadge label={order.state ?? "—"} />
                      {order.currentLocalOutcome !== null ? <StatusBadge label={dictionary.paymentLinkOrderLocalOutcome} tone="info" /> : null}
                    </div>
                    <MoneyText value={order.amount} />
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
