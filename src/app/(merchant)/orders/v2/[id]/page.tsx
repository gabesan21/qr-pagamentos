import { WorkspaceHeading } from "@/app-shell/workspace-heading";
import {
  OrderV2CommentsCard,
  OrderV2DetailCard,
  OrderV2OutcomeCard,
  OrderV2UnavailableCard,
} from "@/app/orders/order-v2-views";
import { getOrderV2ViewService } from "@/orders/order-v2-view";

import { requireMerchantShellContext } from "../../../shell-context";
import { ORDERS_NOTICE_KEY, ORDERS_NOTICE_VALUES, type OrdersNotice, type OrdersSearchParams } from "../../directory-query";
import { OrderV2Notice } from "../../orders-notices";

// The detail page reuses the directory's closed `orders-v2` notice set so a
// forged or stale value never widens what this page announces; anything
// outside `ORDERS_NOTICE_VALUES` renders no notice at all.
function resolveOrderV2DetailNotice(value: OrdersSearchParams[string]): OrdersNotice | null {
  const raw = typeof value === "string" ? value : undefined;
  return raw !== undefined && (ORDERS_NOTICE_VALUES as readonly string[]).includes(raw) ? (raw as OrdersNotice) : null;
}

export default async function OrderV2DetailPage({
  params,
  searchParams = Promise.resolve({}),
}: Readonly<{ params: Promise<{ id: string }>; searchParams?: Promise<OrdersSearchParams> }>) {
  const { dictionary, locale, principal } = await requireMerchantShellContext();
  const result = await getOrderV2ViewService().getForOwner(principal, (await params).id);
  const notice = resolveOrderV2DetailNotice((await searchParams)[ORDERS_NOTICE_KEY]);

  return (
    <>
      <WorkspaceHeading description={dictionary.orderV2DirectoryDescription} eyebrow={dictionary.shellMerchantEyebrow} title={dictionary.ordersHeading} />
      {notice ? <OrderV2Notice dictionary={dictionary} notice={notice} /> : null}
      {result.kind === "found"
        ? (
          <>
            <OrderV2DetailCard backHref="/orders" backLabel={dictionary.orderV2DetailBack} dictionary={dictionary} locale={locale} order={result.order} />
            <div className="grid gap-4 lg:grid-cols-12">
              <div className="space-y-4 lg:col-span-8">
                <OrderV2CommentsCard dictionary={dictionary} locale={locale} order={result.order} />
                <OrderV2OutcomeCard dictionary={dictionary} order={result.order} />
              </div>
            </div>
          </>
        )
        : <OrderV2UnavailableCard backHref="/orders" dictionary={dictionary} />}
    </>
  );
}
