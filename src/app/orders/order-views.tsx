import Link from "next/link";

import { formatProductPrice } from "@/app/admin/product-management";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyField } from "@/components/ui/copy-field";
import { EmptyState } from "@/components/ui/empty-state";
import { MoneyText } from "@/components/ui/money-text";
import { Monogram } from "@/components/ui/monogram";
import { Separator } from "@/components/ui/separator";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { Timeline, type TimelineEntry } from "@/components/ui/timeline";
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

function orderStateTone(state: PaymentLinkOrderState): StatusTone {
  if (state === "CONFIRMED") return "success";
  if (state === "REJECTED" || state === "CANCELLED" || state === "EXPIRED") return "danger";
  if (state === "PENDING" || state === "INDETERMINATE") return "info";
  return "neutral";
}

export function OrderStateBadge({ dictionary, state }: Readonly<{ dictionary: Dictionary; state: PaymentLinkOrderState }>) {
  return <StatusBadge label={orderStateLabel(dictionary, state)} tone={orderStateTone(state)} />;
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

function copyLabels(dictionary: Dictionary) {
  return {
    copy: dictionary.orderV2DirectoryCopy,
    pending: dictionary.orderV2DirectoryCopy,
    copied: dictionary.orderV2DirectoryCopied,
    failed: dictionary.orderV2DirectoryCopyFailed,
  };
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
                    <div><dt>{dictionary.orderState}</dt><dd><OrderStateBadge dictionary={dictionary} state={order.state} /></dd></div>
                    <div><dt>{dictionary.orderAmount}</dt><dd><MoneyText value={formatProductPrice(order.amount, locale)} /></dd></div>
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

function FieldRow({ dictionary, label, value }: Readonly<{ dictionary: Dictionary; label: string; value: string | null | undefined }>) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      {value ? <CopyField labels={copyLabels(dictionary)} truncate={false} value={value} /> : <span className="text-sm text-muted-foreground">—</span>}
    </div>
  );
}

function CustomerFacts({ customer, dictionary }: Readonly<{ customer: CustomerSnapshotV1; dictionary: Dictionary }>) {
  if (!customer.name && !customer.email && !customer.cpf && !customer.address) {
    return <p>{dictionary.checkoutNoCustomerData}</p>;
  }
  const address = customer.address;
  return (
    <div className="divide-y">
      <FieldRow dictionary={dictionary} label={dictionary.checkoutNameLabel} value={customer.name} />
      <FieldRow dictionary={dictionary} label={dictionary.checkoutEmailLabel} value={customer.email} />
      <FieldRow dictionary={dictionary} label={dictionary.checkoutCpfLabel} value={customer.cpf} />
      {address ? (
        <FieldRow
          dictionary={dictionary}
          label={dictionary.checkoutAddressLegend}
          value={`${address.street}, ${address.number}${address.complement ? ` — ${address.complement}` : ""} — ${address.district}, ${address.city} — ${address.stateUf}, ${address.postalCode}`}
        />
      ) : <FieldRow dictionary={dictionary} label={dictionary.checkoutAddressLegend} value={null} />}
    </div>
  );
}

function DetailBreadcrumb({ backHref, backLabel, current }: Readonly<{ backHref: string; backLabel: string; current: string }>) {
  return (
    <nav aria-label="breadcrumb" className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <Link className="inline-flex min-h-11 items-center text-foreground underline-offset-4 hover:underline" href={backHref}>{backLabel}</Link>
      <span aria-hidden>›</span>
      <span className="font-mono text-foreground">#{current}</span>
    </nav>
  );
}

function buildTimeline(dictionary: Dictionary, order: OrderView): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    {
      id: "created",
      title: dictionary.orderCreated,
      formattedAt: formatOrderInstant(order.createdAt, "en"),
      dateTime: order.createdAt.toISOString(),
      tone: "info",
    },
  ];
  entries.push({
    id: "state",
    title: `${dictionary.orderState}: ${orderStateLabel(dictionary, order.state)}`,
    formattedAt: formatOrderInstant(order.updatedAt, "en"),
    dateTime: order.updatedAt.toISOString(),
    tone: orderStateTone(order.state) === "success" ? "success" : orderStateTone(order.state) === "danger" ? "danger" : "default",
  });
  if (order.settledAt) {
    entries.push({
      id: "settled",
      title: dictionary.orderSettled,
      formattedAt: formatOrderInstant(order.settledAt, "en"),
      dateTime: order.settledAt.toISOString(),
      tone: "success",
    });
  }
  return entries;
}

export function OrderDetailCard({
  backHref,
  backLabel,
  dictionary,
  locale,
  order,
  owner,
  showV2Details,
}: Readonly<{
  backHref: string;
  backLabel?: string;
  dictionary: Dictionary;
  locale: SupportedLocale;
  order: OrderView;
  owner?: Readonly<{ username: string; deletedAt: Date | null }>;
  showV2Details?: boolean;
}>) {
  const title = locale === "pt-BR" ? order.productTitlePtBr : order.productTitleEn;
  const timeline = buildTimeline(dictionary, order);

  return (
    <div className="space-y-4">
      {backLabel ? <DetailBreadcrumb backHref={backHref} backLabel={backLabel} current={order.id} /> : null}
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
          <Card>
            <CardHeader>
              <CardTitle>{dictionary.orderProduct}</CardTitle>
              <CardDescription>{title}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <CopyField labels={copyLabels(dictionary)} truncate={false} value={order.id} />
              <div className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{dictionary.orderCreated}</p>
                  <p className="mt-1 font-mono text-xs">{formatOrderInstant(order.createdAt, locale)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{dictionary.orderUpdated}</p>
                  <p className="mt-1 font-mono text-xs">{formatOrderInstant(order.updatedAt, locale)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{dictionary.orderSettled}</p>
                  <p className="mt-1 font-mono text-xs">{order.settledAt ? formatOrderInstant(order.settledAt, locale) : dictionary.adminNotProvided}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{dictionary.checkoutPolicyHeading}</p>
                  <p className="mt-1.5 text-sm">{orderPolicyLabel(dictionary, order.checkoutDataPolicy)}</p>
                </div>
                {showV2Details ? (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{dictionary.orderV2DirectoryColumnSource}</p>
                    <div className="mt-1.5">
                      <StatusBadge label={dictionary.orderV2DirectorySourceLink} tone="success" />
                    </div>
                  </div>
                ) : null}
              </div>
              {owner ? (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{dictionary.adminOrderV2DetailOwnerHeading}</p>
                    <div className="mt-2 flex items-center gap-3">
                      <Monogram name={owner.username} />
                      <span className="text-sm font-medium">{owner.username}</span>
                      {owner.deletedAt !== null ? <Badge variant="outline">{dictionary.adminOrderV2DirectoryOwnerDeleted}</Badge> : null}
                    </div>
                    <Button asChild className="mt-3" data-ds-hit-target variant="outline">
                      <Link href="/admin/accounts">{dictionary.adminOrderV2DetailOwnerAccount}</Link>
                    </Button>
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{dictionary.orderAmount}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <MoneyText className="justify-start" pairLabel={order.currencyPairLabel} size="large" value={formatProductPrice(order.amount, locale)} />
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
        </div>

        <div className="space-y-4 lg:col-span-4">
          <Card>
            <CardHeader>
              <CardTitle>{dictionary.orderState}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {showV2Details ? null : (
                <>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{dictionary.orderPaymentLink}</p>
                    <div className="mt-1.5">
                      <CopyField labels={copyLabels(dictionary)} truncate={false} value={order.paymentLinkIdentifier} />
                    </div>
                  </div>
                  <Separator />
                </>
              )}
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{dictionary.orderState}</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <OrderStateBadge dictionary={dictionary} state={order.state} />
                  <time className="font-mono text-xs text-muted-foreground">{formatOrderInstant(order.updatedAt, locale)}</time>
                </div>
              </div>
            </CardContent>
          </Card>

          {showV2Details ? (
            <Card>
              <CardHeader>
                <CardTitle>{dictionary.orderPaymentLink}</CardTitle>
              </CardHeader>
              <CardContent>
                <CopyField labels={copyLabels(dictionary)} truncate={false} value={order.paymentLinkIdentifier} />
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>{dictionary.orderV2DetailChronology}</CardTitle>
            </CardHeader>
            <CardContent>
              <Timeline entries={timeline} />
            </CardContent>
          </Card>
        </div>
      </div>

      {!backLabel ? (
        <Button asChild data-ds-hit-target variant="outline">
          <Link href={backHref}>{dictionary.orderBackToList}</Link>
        </Button>
      ) : null}
    </div>
  );
}

export function OrderUnavailableCard({ backHref, dictionary }: Readonly<{ backHref: string; dictionary: Dictionary }>) {
  return (
    <EmptyState
      action={<Button asChild data-ds-hit-target variant="outline"><Link href={backHref}>{dictionary.orderBackToList}</Link></Button>}
      body={dictionary.orderUnavailableDescription}
      illustration="unavailable"
      kind="unavailable"
      title={dictionary.orderUnavailableHeading}
    />
  );
}
