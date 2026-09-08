import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { OrderDetailCard, OrderUnavailableCard } from "@/app/orders/order-views";
import { getAuthorizationService } from "@/auth/authorization";
import { getDictionary } from "@/i18n/dictionaries";
import { getLocalePreferenceService } from "@/i18n/locale-preference";
import { getOrderViewService } from "@/orders/order-view";

// The order's own breadcrumb (via `backLabel`) is the page's only heading; no
// `WorkspaceHeading` duplicates it above (14.5.1 F03).
export default async function OrderDetailPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const principal = await getAuthorizationService().resolve((await cookies()).get("qr_session")?.value);
  if (!principal) redirect("/login");
  if (principal.role === "ADMIN") redirect("/admin");
  const [locale, result] = await Promise.all([
    getLocalePreferenceService().resolve(principal.id),
    getOrderViewService().getForOwner(principal, (await params).id),
  ]);
  const dictionary = getDictionary(locale);

  return result.kind === "found"
    ? <OrderDetailCard backHref="/orders" backLabel={dictionary.orderBackToList} dictionary={dictionary} locale={locale} order={result.order} showV2Details />
    : <OrderUnavailableCard backHref="/orders" dictionary={dictionary} />;
}
