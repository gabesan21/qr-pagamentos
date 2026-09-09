import { OrderDetailCard, OrderUnavailableCard } from "@/app/orders/order-views";
import { getOrderViewService } from "@/orders/order-view";

import { requireAdminShellContext } from "../../shell-context";

// The order's own breadcrumb (via `backLabel`) is the page's only heading;
// no `WorkspaceHeading` duplicates it above.
export default async function AdminOrderDetailPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { dictionary, locale, principal } = await requireAdminShellContext();
  const result = await getOrderViewService().getForAdmin(principal, (await params).id);

  return result.kind === "found"
    ? (
      <OrderDetailCard
        backHref="/admin/orders"
        backLabel={dictionary.orderBackToList}
        dictionary={dictionary}
        locale={locale}
        order={result.order}
      />
    )
    : <OrderUnavailableCard backHref="/admin/orders" dictionary={dictionary} />;
}
