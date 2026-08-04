import { WorkspaceHeading } from "@/app-shell/workspace-heading";
import {
  OrderV2DetailCard,
  OrderV2UnavailableCard,
} from "@/app/orders/order-v2-views";
import { getAdminOrderV2DirectoryService } from "@/orders/order-v2-admin-directory";
import { getOrderV2ViewService } from "@/orders/order-v2-view";

import { requireAdminShellContext } from "../../../shell-context";

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
          <OrderV2DetailCard
            backHref="/admin/orders"
            backLabel={dictionary.orderV2DetailBack}
            dictionary={dictionary}
            locale={locale}
            order={result.order}
            owner={owner}
          />
        )
        : <OrderV2UnavailableCard backHref="/admin/orders" dictionary={dictionary} />}
    </>
  );
}
