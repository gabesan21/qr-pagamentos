import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { OrderListCard } from "@/app/orders/order-views";
import { ForbiddenError, UnauthenticatedError, getAuthorizationService } from "@/auth/authorization";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
    <main className="admin-shell">
      <header className="receipt-rail">
        <span className="receipt-rail__label">QR Pagamentos / admin</span>
        <h1>{dictionary.ordersHeading}</h1>
        <div className="receipt-rail__facts">
          <span>{actor.username}</span>
          <Badge variant="outline">{dictionary.adminAdministrator}</Badge>
        </div>
        <nav aria-label={dictionary.adminNavigationLabel} className="admin-navigation">
          <Button asChild variant="outline"><Link href="/admin">{dictionary.adminHeading}</Link></Button>
        </nav>
      </header>
      <p className="admin-shell__intro">{dictionary.ordersDescription}</p>
      <OrderListCard detailHref={(orderId) => `/admin/orders/${orderId}`} dictionary={dictionary} locale={locale} orders={orders} />
    </main>
  );
}
