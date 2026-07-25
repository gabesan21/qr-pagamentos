import Link from "next/link";

import { formatCatalogPrice } from "@/app/(merchant)/catalog/price-format";
import { orderStateLabel } from "@/app/orders/order-views";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { getDictionary } from "@/i18n/dictionaries";
import type { SupportedLocale } from "@/i18n/locales";
import type { CheckoutDataPolicy, CustomerSnapshotV1 } from "@/orders/payment-link-order";
import type { OrderV2LocalOutcomeView, OrderV2Summary, OrderV2View } from "@/orders/order-v2-view";
import type { OrderV2State } from "@/orders/order-v2";

import { formatLinkInstant } from "../../../link-v2-views";

type Dictionary = ReturnType<typeof getDictionary>;

// Row summary: the localized fixed-amount snapshot description, or the
// immutable order id when the composition carries no description.
export function orderV2SummaryLabel(order: OrderV2Summary, locale: SupportedLocale) {
  return (locale === "pt-BR" ? order.descriptionPtBr : order.descriptionEn) ?? order.id;
}

export function OrderV2StateBadge({ dictionary, state }: Readonly<{ dictionary: Dictionary; state: OrderV2State | null }>) {
  if (state === null) return <>{dictionary.adminNotProvided}</>;
  const variant = state === "CONFIRMED" ? "secondary" : state === "REJECTED" ? "destructive" : "outline";
  return <Badge variant={variant}>{orderStateLabel(dictionary, state)}</Badge>;
}

export function OrderV2LocalOutcomeBadge({ dictionary, outcome }: Readonly<{ dictionary: Dictionary; outcome: OrderV2LocalOutcomeView | null }>) {
  if (outcome === null) return <>{dictionary.adminNotProvided}</>;
  const label = outcome.outcome === "LOCAL_FINALIZED"
    ? dictionary.paymentLinkOrderOutcomeFinalized
    : dictionary.paymentLinkOrderOutcomeCancelled;
  return <Badge variant="outline">{label}</Badge>;
}

function orderPolicyLabel(dictionary: Dictionary, policy: CheckoutDataPolicy) {
  if (policy === "NAME_EMAIL") return dictionary.checkoutPolicyNameEmail;
  if (policy === "EMAIL") return dictionary.checkoutPolicyEmail;
  if (policy === "NAME_EMAIL_CPF") return dictionary.checkoutPolicyNameEmailCpf;
  if (policy === "NAME_EMAIL_CPF_ADDRESS") return dictionary.checkoutPolicyNameEmailCpfAddress;
  return dictionary.checkoutPolicyNone;
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

// Read-only drilldown detail: the immutable monetary snapshot, state, local
// outcome, policy-exact customer snapshot, lines, and comments. Mutations stay
// with 8.3.2/8.3.3; the snapshotted currency-pair UUIDs are never rendered.
export function OrderV2DrilldownDetailCard({
  backHref,
  dictionary,
  linkIdentifier,
  locale,
  order,
}: Readonly<{
  backHref: string;
  dictionary: Dictionary;
  linkIdentifier: string;
  locale: SupportedLocale;
  order: OrderV2View;
}>) {
  const title = orderV2SummaryLabel(order, locale);
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {title !== order.id ? <CardDescription>{order.id}</CardDescription> : null}
        </CardHeader>
        <CardContent>
          <div className="admin-account__facts">
            <dl>
              <div><dt>{dictionary.orderState}</dt><dd><OrderV2StateBadge dictionary={dictionary} state={order.state} /></dd></div>
              <div>
                <dt>{dictionary.paymentLinkOrderLocalOutcome}</dt>
                <dd className="flex flex-wrap items-center gap-3">
                  <OrderV2LocalOutcomeBadge dictionary={dictionary} outcome={order.currentLocalOutcome} />
                  {order.currentLocalOutcome?.note ? <span>{order.currentLocalOutcome.note}</span> : null}
                </dd>
              </div>
              <div><dt>{dictionary.orderAmount}</dt><dd className="tabular-nums">{formatCatalogPrice(order.amount, null, locale)}</dd></div>
              <div><dt>{dictionary.orderPaymentLink}</dt><dd>{linkIdentifier}</dd></div>
              <div><dt>{dictionary.checkoutPolicyHeading}</dt><dd>{orderPolicyLabel(dictionary, order.checkoutDataPolicy)}</dd></div>
              <div><dt>{dictionary.orderCreated}</dt><dd>{formatLinkInstant(order.createdAt, locale)}</dd></div>
              <div><dt>{dictionary.orderUpdated}</dt><dd>{formatLinkInstant(order.updatedAt, locale)}</dd></div>
              <div><dt>{dictionary.orderSettled}</dt><dd>{order.settledAt ? formatLinkInstant(order.settledAt, locale) : dictionary.adminNotProvided}</dd></div>
            </dl>
          </div>
          {order.lines.length > 0 ? (
            <>
              <Separator />
              <div className="admin-account__facts">
                <h2>{dictionary.paymentLinkDirectoryLines}</h2>
                <Table>
                  <TableCaption>{dictionary.paymentLinkDirectoryLines}</TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">{dictionary.paymentLinkOrderLinePosition}</TableHead>
                      <TableHead scope="col">{dictionary.paymentLinkDirectoryQuantity}</TableHead>
                      <TableHead scope="col">{dictionary.paymentLinkDirectoryUnitPrice}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {order.lines.map((line) => (
                      <TableRow key={line.position}>
                        <TableCell className="tabular-nums">{line.position}</TableCell>
                        <TableCell className="tabular-nums">{line.quantity}</TableCell>
                        <TableCell className="tabular-nums">{formatCatalogPrice(line.unitPrice, null, locale)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : null}
          <Separator />
          <div className="admin-account__facts">
            <h2>{dictionary.checkoutCustomerHeading}</h2>
            <CustomerFacts customer={order.customer} dictionary={dictionary} />
          </div>
          {order.comments.length > 0 ? (
            <>
              <Separator />
              <div className="admin-account__facts">
                <h2>{dictionary.paymentLinkOrderComments}</h2>
                {order.comments.map((comment) => (
                  <figure key={comment.id}>
                    <blockquote>{comment.body}</blockquote>
                    <figcaption>{formatLinkInstant(comment.createdAt, locale)}</figcaption>
                  </figure>
                ))}
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>
      <Button asChild variant="outline"><Link href={backHref}>{dictionary.paymentLinkOrderBackToOrders}</Link></Button>
    </>
  );
}

export function OrderV2DrilldownUnavailableCard({ backHref, dictionary }: Readonly<{ backHref: string; dictionary: Dictionary }>) {
  return (
    <>
      <Alert variant="destructive">
        <AlertTitle>{dictionary.orderUnavailableHeading}</AlertTitle>
        <AlertDescription>{dictionary.orderUnavailableDescription}</AlertDescription>
      </Alert>
      <Button asChild variant="outline"><Link href={backHref}>{dictionary.paymentLinkOrderBackToOrders}</Link></Button>
    </>
  );
}
