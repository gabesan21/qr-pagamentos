import { OrderDetailCard, OrderUnavailableCard } from "@/app/orders/order-views";
import { WorkspaceHeading } from "@/app-shell/workspace-heading";
import { getOrderViewService } from "@/orders/order-view";

import { requireAdminShellContext } from "../../shell-context";

export default async function AdminOrderDetailPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { dictionary, locale, principal } = await requireAdminShellContext();
  const result = await getOrderViewService().getForAdmin(principal, (await params).id);

  return (
    <>
      <WorkspaceHeading description={dictionary.ordersDescription} eyebrow={dictionary.shellAdminEyebrow} title={dictionary.ordersHeading} />
      {result.kind === "found"
        ? (
          <OrderDetailCard
            backHref="/admin/orders"
            backLabel={dictionary.orderBackToList}
            dictionary={dictionary}
            locale={locale}
            order={result.order}
          />
        )
        : <OrderUnavailableCard backHref="/admin/orders" dictionary={dictionary} />}
    </>
  );
}
