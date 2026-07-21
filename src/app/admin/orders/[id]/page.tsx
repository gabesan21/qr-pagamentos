import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { OrderDetailCard, OrderUnavailableCard } from "@/app/orders/order-views";
import { ForbiddenError, UnauthenticatedError, getAuthorizationService } from "@/auth/authorization";
import { getDictionary } from "@/i18n/dictionaries";
import { getLocalePreferenceService } from "@/i18n/locale-preference";
import { getOrderViewService } from "@/orders/order-view";

export default async function AdminOrderDetailPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  let actor;
  try {
    actor = await getAuthorizationService().requireAdmin((await cookies()).get("qr_session")?.value);
  } catch (error) {
    if (error instanceof ForbiddenError) redirect("/");
    if (error instanceof UnauthenticatedError) redirect("/login");
    throw error;
  }
  const [locale, result] = await Promise.all([
    getLocalePreferenceService().resolve(actor.id),
    getOrderViewService().getForAdmin(actor, (await params).id),
  ]);
  const dictionary = getDictionary(locale);
  return (
    <main className="admin-shell">
      <header className="receipt-rail"><span className="receipt-rail__label">QR Pagamentos / admin</span><h1>{dictionary.ordersHeading}</h1></header>
      {result.kind === "found"
        ? <OrderDetailCard backHref="/admin/orders" dictionary={dictionary} locale={locale} order={result.order} />
        : <OrderUnavailableCard backHref="/admin/orders" dictionary={dictionary} />}
    </main>
  );
}
