import { WorkspaceHeading } from "@/app-shell/workspace-heading";
import { getPaymentLinkV2ViewService } from "@/auth/payment-link-v2-view";
import { getOrderV2ViewService } from "@/orders/order-v2-view";

import { requireMerchantShellContext } from "../../../../../shell-context";
import { PaymentLinkV2UnavailableCard } from "../../../../link-v2-views";
import { OrderV2DrilldownDetailCard, OrderV2DrilldownUnavailableCard } from "../order-v2-views";

export default async function PaymentLinkV2OrderDetailPage({
  params,
}: Readonly<{
  params: Promise<{ id: string; orderId: string }>;
}>) {
  const { dictionary, locale, principal } = await requireMerchantShellContext();
  const { id, orderId } = await params;
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
  const backToOrders = `/links/v2/${link.id}/orders`;
  const orderResult = await getOrderV2ViewService().getForOwner(principal, orderId);

  return (
    <div className="space-y-4">
      <WorkspaceHeading description={dictionary.paymentLinkOrdersDescription} eyebrow={dictionary.shellMerchantEyebrow} title={dictionary.paymentLinkOrderDetailHeading} />
      {orderResult.kind === "found" && orderResult.order.paymentLinkV2Identifier === link.identifier
        ? (
          <OrderV2DrilldownDetailCard
            backHref={backToOrders}
            dictionary={dictionary}
            link={{ identifier: link.identifier, state: link.state }}
            locale={locale}
            order={orderResult.order}
          />
        )
        : <OrderV2DrilldownUnavailableCard backHref={backToOrders} dictionary={dictionary} />}
    </div>
  );
}
