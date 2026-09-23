import {
  OrderV2DetailCard,
  OrderV2UnavailableCard,
} from "@/app/orders/order-v2-views";
import type { LinkLifecycle } from "@/components/ui/status-badge";
import { getAdminPaymentLinkV2DirectoryService } from "@/auth/payment-link-v2-admin-directory";
import { getAdminOrderV2DirectoryService } from "@/orders/order-v2-admin-directory";
import { getOrderV2ViewService } from "@/orders/order-v2-view";

import { requireAdminShellContext } from "../../../shell-context";

// The order's own breadcrumb (via `backLabel`) is the page's only heading;
// no `WorkspaceHeading` duplicates it above.
export default async function AdminOrderV2DetailPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { dictionary, locale, principal } = await requireAdminShellContext();
  const orderId = (await params).id;
  const result = await getOrderV2ViewService().getForAdmin(principal, orderId);

  // The owner-attribution read runs only after the delivered read resolves
  // found; any miss shares the one opaque unavailable outcome.
  const owner = result.kind === "found"
    ? await getAdminOrderV2DirectoryService().readOwnerAttribution(principal, orderId)
    : null;

  // The link card's lifecycle badge and drill-down: resolved through F03's
  // additive identifier lookup, never a new read on the link service. A miss
  // here simply omits the badge; the order itself still renders.
  let link: Readonly<{ href: string; lifecycle: LinkLifecycle }> | undefined;
  if (result.kind === "found" && owner !== null && result.order.paymentLinkV2Identifier !== null) {
    const linkResult = await getAdminPaymentLinkV2DirectoryService().getForAdminByIdentifier(principal, result.order.paymentLinkV2Identifier);
    if (linkResult.kind === "found") {
      link = { href: `/admin/payment-links/v2/${linkResult.link.id}`, lifecycle: linkResult.link.state };
    }
  }

  return result.kind === "found" && owner !== null
    ? (
      <OrderV2DetailCard
        backHref="/admin/orders"
        backLabel={dictionary.orderV2DetailBack}
        dictionary={dictionary}
        link={link}
        locale={locale}
        order={result.order}
        owner={owner}
      />
    )
    : <OrderV2UnavailableCard backHref="/admin/orders" dictionary={dictionary} />;
}
