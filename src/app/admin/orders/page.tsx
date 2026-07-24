import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { OrderListCard } from "@/app/orders/order-views";
import { ForbiddenError, UnauthenticatedError, getAuthorizationService } from "@/auth/authorization";
import { WorkspaceHeading } from "@/app-shell/workspace-heading";
import { getDictionary } from "@/i18n/dictionaries";
import { getLocalePreferenceService } from "@/i18n/locale-preference";
import { getOrderViewService } from "@/orders/order-view";

export default async function AdminOrdersPage() {
  let actor;
  try {
    actor = await getAuthorizationService().requireAdmin((await cookies()).get("qr_session")?.value);
  } catch (error) {
    if (error instanceof ForbiddenError) redirect("/");
    if (error instanceof UnauthenticatedError) redirect("/login");
    throw error;
  }
  const [locale, orders] = await Promise.all([
    getLocalePreferenceService().resolve(actor.id),
    getOrderViewService().listForAdmin(actor),
  ]);
  const dictionary = getDictionary(locale);
  return (
    <>
      <WorkspaceHeading description={dictionary.ordersDescription} eyebrow={dictionary.shellAdminEyebrow} title={dictionary.ordersHeading} />
      <OrderListCard detailHref={(orderId) => `/admin/orders/${orderId}`} dictionary={dictionary} locale={locale} orders={orders} />
    </>
  );
}
