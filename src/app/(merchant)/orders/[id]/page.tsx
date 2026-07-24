import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { OrderDetailCard, OrderUnavailableCard } from "@/app/orders/order-views";
import { WorkspaceHeading } from "@/app-shell/workspace-heading";
import { getAuthorizationService } from "@/auth/authorization";
import { getDictionary } from "@/i18n/dictionaries";
import { getLocalePreferenceService } from "@/i18n/locale-preference";
import { getOrderViewService } from "@/orders/order-view";

export default async function OrderDetailPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const principal = await getAuthorizationService().resolve((await cookies()).get("qr_session")?.value);
  if (!principal) redirect("/login");
  if (principal.role === "ADMIN") redirect("/admin");
  const [locale, result] = await Promise.all([
    getLocalePreferenceService().resolve(principal.id),
    getOrderViewService().getForOwner(principal, (await params).id),
  ]);
  const dictionary = getDictionary(locale);

  return (
    <>
      <WorkspaceHeading description={dictionary.ordersDescription} eyebrow={dictionary.shellMerchantEyebrow} title={dictionary.ordersHeading} />
      {result.kind === "found"
        ? <OrderDetailCard backHref="/orders" dictionary={dictionary} locale={locale} order={result.order} />
        : <OrderUnavailableCard backHref="/orders" dictionary={dictionary} />}
    </>
  );
}
