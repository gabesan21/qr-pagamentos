import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { OrderListCard } from "@/app/orders/order-views";
import { getAuthorizationService } from "@/auth/authorization";
import { Button } from "@/components/ui/button";
import { getDictionary } from "@/i18n/dictionaries";
import { getLocalePreferenceService } from "@/i18n/locale-preference";
import { getOrderViewService } from "@/orders/order-view";

export default async function OrdersPage() {
  const principal = await getAuthorizationService().resolve((await cookies()).get("qr_session")?.value);
  if (!principal) redirect("/login");
  const [locale, orders] = await Promise.all([
    getLocalePreferenceService().resolve(principal.id),
    getOrderViewService().listForOwner(principal),
  ]);
  const dictionary = getDictionary(locale);
  return (
    <main className="admin-shell">
      <header className="receipt-rail">
        <span className="receipt-rail__label">QR Pagamentos</span>
        <h1>{dictionary.ordersHeading}</h1>
        <nav aria-label={dictionary.ordersHeading} className="admin-navigation">
          <Button asChild variant="outline"><Link href="/">{dictionary.adminHome}</Link></Button>
        </nav>
      </header>
      <p className="admin-shell__intro">{dictionary.ordersDescription}</p>
      <OrderListCard detailHref={(orderId) => `/orders/${orderId}`} dictionary={dictionary} locale={locale} orders={orders} />
    </main>
  );
}
