import Link from "next/link";

import { formatProductPrice } from "@/app/admin/product-management";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { getDictionary } from "@/i18n/dictionaries";
import type { SupportedLocale } from "@/i18n/locales";
import type { CheckoutDataPolicy, CustomerSnapshotV1, PaymentLinkOrderState } from "@/orders/payment-link-order";
import type { OrderSummary, OrderView } from "@/orders/order-view";

type Dictionary = ReturnType<typeof getDictionary>;

export function orderStateLabel(dictionary: Dictionary, state: PaymentLinkOrderState) {
  if (state === "CREATED") return dictionary.checkoutStateCreated;
  if (state === "PENDING") return dictionary.checkoutStatePending;
  if (state === "CONFIRMED") return dictionary.checkoutStateConfirmed;
  if (state === "REJECTED") return dictionary.checkoutStateRejected;
  if (state === "CANCELLED") return dictionary.checkoutStateCancelled;
  if (state === "EXPIRED") return dictionary.checkoutStateExpired;
  if (state === "REFUNDED") return dictionary.checkoutStateRefunded;
  return dictionary.checkoutStateIndeterminate;
}

function orderStateBadgeVariant(state: PaymentLinkOrderState): "secondary" | "destructive" | "outline" {
  if (state === "CONFIRMED") return "secondary";
  if (state === "REJECTED") return "destructive";
  return "outline";
}

function orderPolicyLabel(dictionary: Dictionary, policy: CheckoutDataPolicy) {
  if (policy === "NAME_EMAIL") return dictionary.checkoutPolicyNameEmail;
  if (policy === "EMAIL") return dictionary.checkoutPolicyEmail;
  if (policy === "NAME_EMAIL_CPF") return dictionary.checkoutPolicyNameEmailCpf;
  if (policy === "NAME_EMAIL_CPF_ADDRESS") return dictionary.checkoutPolicyNameEmailCpfAddress;
  return dictionary.checkoutPolicyNone;
}

function formatOrderInstant(value: Date, locale: SupportedLocale) {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(value);
}

export function OrderListCard({ detailHref, dictionary, locale, orders }: Readonly<{ detailHref: (orderId: string) => string; dictionary: Dictionary; locale: SupportedLocale; orders: OrderSummary[] }>) {
  return (
    <Card>
      <CardHeader><CardTitle>{dictionary.ordersHeading}</CardTitle><CardDescription>{dictionary.ordersDescription}</CardDescription></CardHeader>
      <CardContent>
        {orders.length === 0 ? <Alert><AlertTitle>{dictionary.ordersEmpty}</AlertTitle><AlertDescription>{dictionary.ordersEmptyDescription}</AlertDescription></Alert> : (
          <div className="admin-account-list">
            {orders.map((order) => (
              <section aria-labelledby={`order-${order.id}`} className="admin-account" key={order.id}>
                <div className="admin-account__facts">
                  <h3 id={`order-${order.id}`}>{locale === "pt-BR" ? order.productTitlePtBr : order.productTitleEn}</h3>
                  <dl>
                    <div><dt>{dictionary.orderState}</dt><dd><Badge variant={orderStateBadgeVariant(order.state)}>{orderStateLabel(dictionary, order.state)}</Badge></dd></div>
                    <div><dt>{dictionary.orderAmount}</dt><dd>{formatProductPrice(order.amount, locale)}</dd></div>
                    <div><dt>{dictionary.orderPaymentLink}</dt><dd>{order.paymentLinkIdentifier}</dd></div>
                    <div><dt>{dictionary.orderCreated}</dt><dd>{formatOrderInstant(order.createdAt, locale)}</dd></div>
                  </dl>
                </div>
                <Button asChild variant="outline"><Link href={detailHref(order.id)}>{dictionary.ordersView}</Link></Button>
              </section>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CustomerFacts({ customer, dictionary }: Readonly<{ customer: CustomerSnapshotV1; dictionary: Dictionary }>) {
  if (!customer.name && !customer.email && !customer.cpf && !customer.address) {
    return <p>{dictionary.checkoutNoCustomerData}</p>;
  }
  const address = customer.address;
  return (
    <dl>
      {customer.name ? <div><dt>{dictionary.checkoutNameLabel}</dt><dd>{customer.name}</dd></div> : null}
      {customer.email ? <div><dt>{dictionary.checkoutEmailLabel}</dt><dd>{customer.email}</dd></div> : null}
      {customer.cpf ? <div><dt>{dictionary.checkoutCpfLabel}</dt><dd>{customer.cpf}</dd></div> : null}
      {address ? (
        <>
          <div><dt>{dictionary.checkoutStreetLabel}</dt><dd>{address.street}, {address.number}</dd></div>
          <div><dt>{dictionary.checkoutDistrictLabel}</dt><dd>{address.district}</dd></div>
          <div><dt>{dictionary.checkoutCityLabel}</dt><dd>{address.city} — {address.stateUf}</dd></div>
          <div><dt>{dictionary.checkoutPostalCodeLabel}</dt><dd>{address.postalCode}</dd></div>
          {address.complement ? <div><dt>{dictionary.checkoutComplementLabel}</dt><dd>{address.complement}</dd></div> : null}
        </>
      ) : null}
    </dl>
  );
}

export function OrderDetailCard({ backHref, dictionary, locale, order }: Readonly<{ backHref: string; dictionary: Dictionary; locale: SupportedLocale; order: OrderView }>) {
  return (
    <>
      <Card>
        <CardHeader><CardTitle>{locale === "pt-BR" ? order.productTitlePtBr : order.productTitleEn}</CardTitle><CardDescription>{order.id}</CardDescription></CardHeader>
        <CardContent>
          <div className="admin-account__facts">
            <dl>
              <div><dt>{dictionary.orderState}</dt><dd><Badge variant={orderStateBadgeVariant(order.state)}>{orderStateLabel(dictionary, order.state)}</Badge></dd></div>
              <div><dt>{dictionary.orderPaymentLink}</dt><dd>{order.paymentLinkIdentifier}</dd></div>
              <div><dt>{dictionary.orderAmount}</dt><dd>{formatProductPrice(order.amount, locale)}</dd></div>
              <div><dt>{dictionary.orderCurrencyPair}</dt><dd>{order.currencyPairLabel}</dd></div>
              <div><dt>{dictionary.checkoutPolicyHeading}</dt><dd>{orderPolicyLabel(dictionary, order.checkoutDataPolicy)}</dd></div>
              <div><dt>{dictionary.orderCreated}</dt><dd>{formatOrderInstant(order.createdAt, locale)}</dd></div>
              <div><dt>{dictionary.orderUpdated}</dt><dd>{formatOrderInstant(order.updatedAt, locale)}</dd></div>
              <div><dt>{dictionary.orderSettled}</dt><dd>{order.settledAt ? formatOrderInstant(order.settledAt, locale) : dictionary.adminNotProvided}</dd></div>
            </dl>
          </div>
          <Separator />
          <div className="admin-account__facts">
            <h2>{dictionary.checkoutCustomerHeading}</h2>
            <CustomerFacts customer={order.customer} dictionary={dictionary} />
          </div>
        </CardContent>
      </Card>
      <Button asChild variant="outline"><Link href={backHref}>{dictionary.orderBackToList}</Link></Button>
    </>
  );
}

export function OrderUnavailableCard({ backHref, dictionary }: Readonly<{ backHref: string; dictionary: Dictionary }>) {
  return (
    <>
      <Alert variant="destructive">
        <AlertTitle>{dictionary.orderUnavailableHeading}</AlertTitle>
        <AlertDescription>{dictionary.orderUnavailableDescription}</AlertDescription>
      </Alert>
      <Button asChild variant="outline"><Link href={backHref}>{dictionary.orderBackToList}</Link></Button>
    </>
  );
}
