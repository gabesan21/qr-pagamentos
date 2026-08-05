import Link from "next/link";

import { formatCatalogPrice } from "@/app/(merchant)/catalog/price-format";
import { orderStateLabel } from "@/app/orders/order-views";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyField } from "@/components/ui/copy-field";
import { MoneyText } from "@/components/ui/money-text";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { getDictionary } from "@/i18n/dictionaries";
import type { SupportedLocale } from "@/i18n/locales";
import type { CheckoutDataPolicy, CustomerSnapshotV1 } from "@/orders/payment-link-order";
import type { OrderV2LocalOutcomeView, OrderV2Summary, OrderV2View } from "@/orders/order-v2-view";
import type { OrderV2State } from "@/orders/order-v2";

import { copyLabels, formatLinkInstant, LinkStateBadge } from "../../../link-v2-views";
import type { PaymentLinkV2DerivedState } from "@/auth/payment-link-v2-view";

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
    <dl className="space-y-2 text-sm">
      {customer.name ? <div className="flex items-center justify-between gap-3"><dt className="text-muted-foreground">{dictionary.checkoutNameLabel}</dt><dd>{customer.name}</dd></div> : null}
      {customer.email ? <div className="flex items-center justify-between gap-3"><dt className="text-muted-foreground">{dictionary.checkoutEmailLabel}</dt><dd>{customer.email}</dd></div> : null}
      {customer.cpf ? <div className="flex items-center justify-between gap-3"><dt className="text-muted-foreground">{dictionary.checkoutCpfLabel}</dt><dd>{customer.cpf}</dd></div> : null}
      {address ? (
        <>
          <div className="flex items-center justify-between gap-3"><dt className="text-muted-foreground">{dictionary.checkoutStreetLabel}</dt><dd>{address.street}, {address.number}</dd></div>
          <div className="flex items-center justify-between gap-3"><dt className="text-muted-foreground">{dictionary.checkoutDistrictLabel}</dt><dd>{address.district}</dd></div>
          <div className="flex items-center justify-between gap-3"><dt className="text-muted-foreground">{dictionary.checkoutCityLabel}</dt><dd>{address.city} — {address.stateUf}</dd></div>
          <div className="flex items-center justify-between gap-3"><dt className="text-muted-foreground">{dictionary.checkoutPostalCodeLabel}</dt><dd>{address.postalCode}</dd></div>
          {address.complement ? <div className="flex items-center justify-between gap-3"><dt className="text-muted-foreground">{dictionary.checkoutComplementLabel}</dt><dd>{address.complement}</dd></div> : null}
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
  link,
  locale,
  order,
}: Readonly<{
  backHref: string;
  dictionary: Dictionary;
  link: { identifier: string; state: PaymentLinkV2DerivedState };
  locale: SupportedLocale;
  order: OrderV2View;
}>) {
  const title = orderV2SummaryLabel(order, locale);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <CopyField labels={copyLabels(dictionary)} truncate={false} value={order.id} />
        <OrderV2StateBadge dictionary={dictionary} state={order.state} />
        <OrderV2LocalOutcomeBadge dictionary={dictionary} outcome={order.currentLocalOutcome} />
        <Button asChild className="ml-auto" data-ds-hit-target size="sm" variant="outline">
          <Link href={backHref}>{dictionary.paymentLinkOrderBackToOrders}</Link>
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
          <Card>
            <CardHeader>
              <CardTitle>{title}</CardTitle>
              {title !== order.id ? <CardDescription>{order.id}</CardDescription> : null}
            </CardHeader>
            <CardContent className="space-y-4">
              {order.lines.length > 0 ? (
                <Table>
                  <TableCaption className="sr-only">{dictionary.paymentLinkDirectoryLines}</TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">{dictionary.paymentLinkOrderLinePosition}</TableHead>
                      <TableHead className="text-right" scope="col">{dictionary.paymentLinkDirectoryQuantity}</TableHead>
                      <TableHead className="text-right" scope="col">{dictionary.paymentLinkDirectoryUnitPrice}</TableHead>
                      <TableHead className="text-right" scope="col">{dictionary.paymentLinkDetailLineTotal}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {order.lines.map((line) => {
                      const total = Number(line.unitPrice) * line.quantity;
                      return (
                        <TableRow key={line.position}>
                          <TableCell className="font-mono tabular-nums">{line.position}</TableCell>
                          <TableCell className="text-right font-mono tabular-nums">{line.quantity}</TableCell>
                          <TableCell className="text-right font-mono tabular-nums">{formatCatalogPrice(line.unitPrice, null, locale)}</TableCell>
                          <TableCell className="text-right font-mono tabular-nums">{formatCatalogPrice(String(total), null, locale)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">{dictionary.paymentLinkDetailFixedAmount}</span>
                  <MoneyText className="justify-start" value={formatCatalogPrice(order.amount, null, locale)} />
                </div>
              )}
              <div className="flex items-center justify-between border-t border-border pt-3">
                <span className="text-sm font-medium text-muted-foreground">{dictionary.paymentLinkDetailSubtotal}</span>
                <MoneyText className="justify-start" size="large" value={formatCatalogPrice(order.amount, null, locale)} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{dictionary.checkoutCustomerHeading}</CardTitle>
            </CardHeader>
            <CardContent>
              <CustomerFacts customer={order.customer} dictionary={dictionary} />
            </CardContent>
          </Card>

          {order.comments.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>{dictionary.paymentLinkOrderComments}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {order.comments.map((comment) => (
                  <figure className="border-b border-border pb-3 last:border-0 last:pb-0" key={comment.id}>
                    <blockquote className="text-sm">{comment.body}</blockquote>
                    <figcaption className="mt-1 text-xs text-muted-foreground">{formatLinkInstant(comment.createdAt, locale)}</figcaption>
                  </figure>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4 lg:col-span-4">
          <Card>
            <CardHeader>
              <CardTitle>{dictionary.paymentLinkOrderDetailState}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">{dictionary.orderState}</dt>
                  <dd><OrderV2StateBadge dictionary={dictionary} state={order.state} /></dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">{dictionary.paymentLinkOrderLocalOutcome}</dt>
                  <dd className="flex flex-wrap items-center gap-2">
                    <OrderV2LocalOutcomeBadge dictionary={dictionary} outcome={order.currentLocalOutcome} />
                    {order.currentLocalOutcome?.note ? <span className="text-sm">{order.currentLocalOutcome.note}</span> : null}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">{dictionary.orderPaymentLink}</dt>
                  <dd className="flex items-center gap-2">
                    <CopyField labels={copyLabels(dictionary)} value={link.identifier} />
                    <LinkStateBadge dictionary={dictionary} state={link.state} />
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">{dictionary.checkoutPolicyHeading}</dt>
                  <dd>{orderPolicyLabel(dictionary, order.checkoutDataPolicy)}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{dictionary.paymentLinkOrderDetailTimestamps}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">{dictionary.orderCreated}</span>
                <span>{formatLinkInstant(order.createdAt, locale)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">{dictionary.orderUpdated}</span>
                <span>{formatLinkInstant(order.updatedAt, locale)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">{dictionary.orderSettled}</span>
                <span>{order.settledAt ? formatLinkInstant(order.settledAt, locale) : dictionary.adminNotProvided}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Button asChild data-ds-hit-target variant="outline">
        <Link href={backHref}>{dictionary.paymentLinkOrderBackToOrders}</Link>
      </Button>
    </div>
  );
}

export function OrderV2DrilldownUnavailableCard({ backHref, dictionary }: Readonly<{ backHref: string; dictionary: Dictionary }>) {
  return (
    <div className="space-y-4">
      <Alert variant="destructive">
        <AlertTitle>{dictionary.orderUnavailableHeading}</AlertTitle>
        <AlertDescription>{dictionary.orderUnavailableDescription}</AlertDescription>
      </Alert>
      <Button asChild data-ds-hit-target variant="outline"><Link href={backHref}>{dictionary.paymentLinkOrderBackToOrders}</Link></Button>
    </div>
  );
}
