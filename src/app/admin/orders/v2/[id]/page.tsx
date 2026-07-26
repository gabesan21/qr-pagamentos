import Link from "next/link";

import { WorkspaceHeading } from "@/app-shell/workspace-heading";
import {
  OrderV2DetailCard,
  OrderV2UnavailableCard,
} from "@/app/orders/order-v2-views";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { getDictionary } from "@/i18n/dictionaries";
import {
  getAdminOrderV2DirectoryService,
  type AdminOrderV2Owner,
} from "@/orders/order-v2-admin-directory";
import { getOrderV2ViewService } from "@/orders/order-v2-view";

import { requireAdminShellContext } from "../../../shell-context";

type Dictionary = ReturnType<typeof getDictionary>;

// Administrator owner attribution on the read-only V2 detail: the same
// interim /admin/accounts navigation and localized deleted badge as the
// directory owner cell.
function OwnerAttributionCard({ dictionary, owner }: Readonly<{ dictionary: Dictionary; owner: AdminOrderV2Owner }>) {
  return (
    <Card>
      <CardHeader><CardTitle>{dictionary.adminOrderV2DetailOwnerHeading}</CardTitle></CardHeader>
      <CardContent>
        <p>
          {owner.username}
          {owner.deletedAt !== null ? <> <Badge variant="outline">{dictionary.adminOrderV2DirectoryOwnerDeleted}</Badge></> : null}
        </p>
        <Button asChild data-ds-hit-target variant="outline"><Link href="/admin/accounts">{dictionary.adminOrderV2DetailOwnerAccount}</Link></Button>
      </CardContent>
    </Card>
  );
}

export default async function AdminOrderV2DetailPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { dictionary, locale, principal } = await requireAdminShellContext();
  const orderId = (await params).id;
  const result = await getOrderV2ViewService().getForAdmin(principal, orderId);

  // The owner-attribution read runs only after the delivered read resolves
  // found; any miss shares the one opaque unavailable outcome.
  const owner = result.kind === "found"
    ? await getAdminOrderV2DirectoryService().readOwnerAttribution(principal, orderId)
    : null;

  return (
    <>
      <WorkspaceHeading description={dictionary.adminOrderV2DirectoryDescription} eyebrow={dictionary.shellAdminEyebrow} title={dictionary.ordersHeading} />
      {result.kind === "found" && owner !== null
        ? (
          <>
            <OrderV2DetailCard backHref="/admin/orders" dictionary={dictionary} locale={locale} order={result.order} />
            <OwnerAttributionCard dictionary={dictionary} owner={owner} />
          </>
        )
        : <OrderV2UnavailableCard backHref="/admin/orders" dictionary={dictionary} />}
    </>
  );
}
