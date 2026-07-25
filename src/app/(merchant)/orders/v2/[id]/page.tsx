import { WorkspaceHeading } from "@/app-shell/workspace-heading";
import {
  OrderV2CommentsCard,
  OrderV2DetailCard,
  OrderV2OutcomeCard,
  OrderV2UnavailableCard,
} from "@/app/orders/order-v2-views";
import { getOrderV2ViewService } from "@/orders/order-v2-view";

import { requireMerchantShellContext } from "../../../shell-context";

export default async function OrderV2DetailPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { dictionary, locale, principal } = await requireMerchantShellContext();
  const result = await getOrderV2ViewService().getForOwner(principal, (await params).id);

  return (
    <>
      <WorkspaceHeading description={dictionary.orderV2DirectoryDescription} eyebrow={dictionary.shellMerchantEyebrow} title={dictionary.ordersHeading} />
      {result.kind === "found"
        ? (
          <>
            <OrderV2DetailCard backHref="/orders" dictionary={dictionary} locale={locale} order={result.order} />
            <OrderV2CommentsCard dictionary={dictionary} locale={locale} order={result.order} />
            <OrderV2OutcomeCard dictionary={dictionary} order={result.order} />
          </>
        )
        : <OrderV2UnavailableCard backHref="/orders" dictionary={dictionary} />}
    </>
  );
}
