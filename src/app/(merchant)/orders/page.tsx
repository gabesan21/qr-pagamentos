import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { OrderListCard } from "@/app/orders/order-views";
import { WorkspaceHeading } from "@/app-shell/workspace-heading";
import { getAuthorizationService } from "@/auth/authorization";
import { getDictionary } from "@/i18n/dictionaries";
import { getLocalePreferenceService } from "@/i18n/locale-preference";
import { getOrderViewService } from "@/orders/order-view";

export default async function OrdersPage() {
  const principal = await getAuthorizationService().resolve((await cookies()).get("qr_session")?.value);
  if (!principal) redirect("/login");
  if (principal.role === "ADMIN") redirect("/admin");
  const [locale, orders] = await Promise.all([
    getLocalePreferenceService().resolve(principal.id),
    getOrderViewService().listForOwner(principal),
  ]);
  const dictionary = getDictionary(locale);

  return (
    <>
      <WorkspaceHeading description={dictionary.ordersDescription} eyebrow={dictionary.shellMerchantEyebrow} title={dictionary.ordersHeading} />
      <OrderListCard detailHref={(orderId) => `/orders/${orderId}`} dictionary={dictionary} locale={locale} orders={orders} />
    </>
  );
}
