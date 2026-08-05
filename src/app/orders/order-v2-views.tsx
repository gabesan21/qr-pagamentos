import Link from "next/link";

import { CatalogSubmit } from "@/app/(merchant)/catalog/catalog-submit";
import { formatCatalogPrice } from "@/app/(merchant)/catalog/price-format";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyField } from "@/components/ui/copy-field";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MoneyText } from "@/components/ui/money-text";
import { Monogram } from "@/components/ui/monogram";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Timeline, type TimelineEntry } from "@/components/ui/timeline";
import type { getDictionary } from "@/i18n/dictionaries";
import type { SupportedLocale } from "@/i18n/locales";
import type { OrderV2CommentView, OrderV2Summary, OrderV2View } from "@/orders/order-v2-view";
import type { OrderV2LocalOutcome, OrderV2Source, OrderV2State } from "@/orders/order-v2";
import type { CheckoutDataPolicy, CustomerSnapshotV1 } from "@/orders/payment-link-order";

import { orderStateLabel } from "./order-views";

type Dictionary = ReturnType<typeof getDictionary>;

// Commerce V2 order views (8.3.3): server-rendered list/detail facts, the
// comment thread, and the guarded local-outcome forms. Currency pair UUIDs,
// line product UUIDs, and internal lifecycle fields never render.

export function formatOrderV2Instant(value: Date, locale: SupportedLocale) {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(value);
}

export function orderV2StateLabel(dictionary: Dictionary, state: OrderV2State | null) {
  return state === null ? dictionary.orderV2DirectoryStateNone : orderStateLabel(dictionary, state);
}

export function orderV2StateTone(state: OrderV2State | null): "danger" | "info" | "neutral" | "success" {
  if (state === "CONFIRMED") return "success";
  if (state === "REJECTED") return "danger";
  if (state === "PENDING") return "info";
  return "neutral";
}

export function OrderV2StateBadge({ dictionary, state }: Readonly<{ dictionary: Dictionary; state: OrderV2State | null }>) {
  return <StatusBadge label={orderV2StateLabel(dictionary, state)} tone={orderV2StateTone(state)} />;
}

export function orderV2OutcomeLabel(dictionary: Dictionary, outcome: OrderV2LocalOutcome) {
  return outcome === "LOCAL_FINALIZED" ? dictionary.orderV2DirectoryOutcomeFinalized : dictionary.orderV2DirectoryOutcomeCancelled;
}

export function orderV2OutcomeTone(outcome: OrderV2LocalOutcome): "danger" | "info" | "neutral" | "success" {
  if (outcome === "LOCAL_FINALIZED") return "success";
  if (outcome === "LOCAL_CANCELLED") return "danger";
  return "neutral";
}

export function OrderV2OutcomeBadge({ dictionary, outcome }: Readonly<{ dictionary: Dictionary; outcome: OrderV2Summary["currentLocalOutcome"] }>) {
  if (outcome === null) return <StatusBadge label={dictionary.orderV2DirectoryOutcomeNone} tone="neutral" />;
  return <StatusBadge label={orderV2OutcomeLabel(dictionary, outcome.outcome)} tone={orderV2OutcomeTone(outcome.outcome)} />;
}

export function orderV2SourceLabel(dictionary: Dictionary, source: OrderV2Source) {
  return source === "LINK" ? dictionary.orderV2DirectorySourceLink : dictionary.orderV2DirectorySourceAdHoc;
}

function orderV2SourceTone(source: OrderV2Source): "info" | "neutral" | "success" {
  if (source === "LINK") return "success";
  if (source === "AD_HOC") return "info";
  return "neutral";
}

export function OrderV2SourceBadge({ dictionary, source }: Readonly<{ dictionary: Dictionary; source: OrderV2Source }>) {
  return <StatusBadge label={orderV2SourceLabel(dictionary, source)} tone={orderV2SourceTone(source)} />;
}

function orderV2PolicyLabel(dictionary: Dictionary, policy: CheckoutDataPolicy) {
  if (policy === "NAME_EMAIL") return dictionary.checkoutPolicyNameEmail;
  if (policy === "EMAIL") return dictionary.checkoutPolicyEmail;
  if (policy === "NAME_EMAIL_CPF") return dictionary.checkoutPolicyNameEmailCpf;
  if (policy === "NAME_EMAIL_CPF_ADDRESS") return dictionary.checkoutPolicyNameEmailCpfAddress;
  return dictionary.checkoutPolicyNone;
}

// The policy-exact payer tuple, most identifying fact first.
export function OrderV2PayerFacts({ dictionary, payer }: Readonly<{ dictionary: Dictionary; payer: CustomerSnapshotV1 }>) {
  const facts = [payer.name, payer.email, payer.cpf].filter((fact): fact is string => fact !== null);
  if (facts.length === 0) return <span>{dictionary.orderV2DirectoryPayerNone}</span>;
  return (
    <span className="flex flex-col">
      {facts.map((fact) => <span key={fact}>{fact}</span>)}
    </span>
  );
}

function FieldRow({ dictionary, label, value }: Readonly<{ dictionary: Dictionary; label: string; value: string | null | undefined }>) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      {value ? <CopyField labels={{ copy: dictionary.orderV2DirectoryCopy, pending: dictionary.orderV2DirectoryCopy, copied: dictionary.orderV2DirectoryCopied, failed: dictionary.orderV2DirectoryCopyFailed }} truncate={false} value={value} /> : <span className="text-sm text-muted-foreground">—</span>}
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

function buildTimeline(dictionary: Dictionary, order: OrderV2View) {
  const entries: TimelineEntry[] = [
    {
      id: "created",
      title: dictionary.orderCreated,
      formattedAt: formatOrderV2Instant(order.createdAt, "en"),
      dateTime: order.createdAt.toISOString(),
      tone: "info",
    },
  ];
  if (order.state !== null) {
    entries.push({
      id: "provider",
      title: `${dictionary.orderV2DetailProviderState}: ${orderV2StateLabel(dictionary, order.state)}`,
      formattedAt: formatOrderV2Instant(order.updatedAt, "en"),
      dateTime: order.updatedAt.toISOString(),
      tone: orderV2StateTone(order.state) === "success" ? "success" : orderV2StateTone(order.state) === "danger" ? "danger" : "default",
    });
  }
  if (order.currentLocalOutcome !== null) {
    entries.push({
      id: "outcome",
      title: `${dictionary.orderV2DetailLocalOutcome}: ${orderV2OutcomeLabel(dictionary, order.currentLocalOutcome.outcome)}`,
      formattedAt: formatOrderV2Instant(order.currentLocalOutcome.createdAt, "en"),
      dateTime: order.currentLocalOutcome.createdAt.toISOString(),
      tone: order.currentLocalOutcome.outcome === "LOCAL_FINALIZED" ? "success" : "info",
      body: order.currentLocalOutcome.note ?? undefined,
    });
  }
  return entries;
}

export function orderV2SummaryTitle(order: OrderV2Summary, locale: SupportedLocale) {
  return (locale === "pt-BR" ? order.descriptionPtBr : order.descriptionEn) ?? order.id;
}

export function OrderV2DetailCard({
  backHref,
  backLabel,
  dictionary,
  locale,
  order,
  owner,
}: Readonly<{
  backHref: string;
  backLabel?: string;
  dictionary: Dictionary;
  locale: SupportedLocale;
  order: OrderV2View;
  owner?: Readonly<{ username: string; deletedAt: Date | null }>;
}>) {
  const title = orderV2SummaryTitle(order, locale);
  const timeline = buildTimeline(dictionary, order);
  const lineTotal = (quantity: number, unitPrice: string) => {
    const [integer, fraction = ""] = unitPrice.split(".");
    const value = (BigInt(integer) * BigInt(10 ** 6) + BigInt(fraction.padEnd(6, "0").slice(0, 6))) * BigInt(quantity);
    const whole = value / BigInt(10 ** 6);
    const frac = (value % BigInt(10 ** 6)).toString().padStart(6, "0").replace(/0+$/, "");
    return `${whole}${frac ? `.${frac}` : ""}`;
  };

  return (
    <div className="space-y-4">
      {backLabel ? <DetailBreadcrumb backHref={backHref} backLabel={backLabel} current={order.id} /> : null}
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
          <Card>
            <CardHeader>
              <CardTitle>{dictionary.orderV2DetailSummary}</CardTitle>
              <CardDescription>{title}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <CopyField
                labels={{ copy: dictionary.orderV2DirectoryCopy, pending: dictionary.orderV2DirectoryCopy, copied: dictionary.orderV2DirectoryCopied, failed: dictionary.orderV2DirectoryCopyFailed }}
                truncate={false}
                value={order.id}
              />
              <div className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{dictionary.orderCreated}</p>
                  <p className="mt-1 font-mono text-xs">{formatOrderV2Instant(order.createdAt, locale)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{dictionary.orderUpdated}</p>
                  <p className="mt-1 font-mono text-xs">{formatOrderV2Instant(order.updatedAt, locale)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{dictionary.orderSettled}</p>
                  <p className="mt-1 font-mono text-xs">{order.settledAt ? formatOrderV2Instant(order.settledAt, locale) : dictionary.adminNotProvided}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{dictionary.checkoutPolicyHeading}</p>
                  <p className="mt-1.5 text-sm">{orderV2PolicyLabel(dictionary, order.checkoutDataPolicy)}</p>
                </div>
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
              <CardTitle>{dictionary.orderV2DetailAmount}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <MoneyText className="justify-start" size="large" value={formatCatalogPrice(order.amount, null, locale)} />
              {order.lines.length > 0 ? (
                <>
                  <Separator />
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{dictionary.orderV2DetailLines}</p>
                  <Table>
                    <TableCaption>{dictionary.orderV2DetailLines}</TableCaption>
                    <TableHeader>
                      <TableRow>
                        <TableHead scope="col">{dictionary.orderV2DetailLine}</TableHead>
                        <TableHead className="text-right" scope="col">{dictionary.orderV2DetailQuantity}</TableHead>
                        <TableHead className="text-right" scope="col">{dictionary.orderV2DetailUnitPrice}</TableHead>
                        <TableHead className="text-right" scope="col">{dictionary.orderV2DetailLineTotal}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {order.lines.map((line) => (
                        <TableRow key={line.position}>
                          <TableCell className="font-mono">{line.position}</TableCell>
                          <TableCell className="text-right font-mono tabular-nums">{line.quantity}</TableCell>
                          <TableCell className="text-right font-mono tabular-nums">{formatCatalogPrice(line.unitPrice, null, locale)}</TableCell>
                          <TableCell className="text-right font-mono tabular-nums">{formatCatalogPrice(lineTotal(line.quantity, line.unitPrice), null, locale)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="flex items-center justify-between border-t pt-3">
                    <span className="text-sm font-medium">{dictionary.orderV2DetailTotal}</span>
                    <MoneyText size="large" value={formatCatalogPrice(order.amount, null, locale)} />
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{dictionary.orderV2DetailPayer}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="divide-y">
                <FieldRow dictionary={dictionary} label={dictionary.checkoutNameLabel} value={order.customer.name} />
                <FieldRow dictionary={dictionary} label={dictionary.checkoutEmailLabel} value={order.customer.email} />
                <FieldRow dictionary={dictionary} label={dictionary.checkoutCpfLabel} value={order.customer.cpf} />
                {order.customer.address ? (
                  <FieldRow
                    dictionary={dictionary}
                    label={dictionary.checkoutAddressLegend}
                    value={`${order.customer.address.street}, ${order.customer.address.number}${order.customer.address.complement ? ` — ${order.customer.address.complement}` : ""}`}
                  />
                ) : <FieldRow dictionary={dictionary} label={dictionary.checkoutAddressLegend} value={null} />}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 lg:col-span-4">
          <Card>
            <CardHeader>
              <CardTitle>{dictionary.orderV2DetailState}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{dictionary.orderV2DetailProviderState}</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <OrderV2StateBadge dictionary={dictionary} state={order.state} />
                  <time className="font-mono text-xs text-muted-foreground">{formatOrderV2Instant(order.updatedAt, locale)}</time>
                </div>
              </div>
              <Separator />
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{dictionary.orderV2DetailLocalOutcome}</p>
                <div className="mt-1.5">
                  <OrderV2OutcomeBadge dictionary={dictionary} outcome={order.currentLocalOutcome} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{dictionary.orderV2DetailRecordedByMerchant}</p>
              </div>
              <Separator />
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{dictionary.orderV2DirectoryColumnSource}</p>
                <div className="mt-1.5">
                  <OrderV2SourceBadge dictionary={dictionary} source={order.source} />
                </div>
              </div>
            </CardContent>
          </Card>

          {order.paymentLinkV2Identifier ? (
            <Card>
              <CardHeader>
                <CardTitle>{dictionary.orderV2DetailLinkCard}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <CopyField
                  labels={{ copy: dictionary.orderV2DirectoryCopy, pending: dictionary.orderV2DirectoryCopy, copied: dictionary.orderV2DirectoryCopied, failed: dictionary.orderV2DirectoryCopyFailed }}
                  truncate={false}
                  value={order.paymentLinkV2Identifier}
                />
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
          <Link href={backHref}>{dictionary.orderV2DetailBack}</Link>
        </Button>
      ) : null}
    </div>
  );
}

function CommentEntry({
  comment,
  dictionary,
  locale,
  orderId,
}: Readonly<{
  comment: OrderV2CommentView;
  dictionary: Dictionary;
  locale: SupportedLocale;
  orderId: string;
}>) {
  return (
    <article className="flex flex-col gap-3 border-b border-border pb-4 last:border-b-0 last:pb-0">
      <p className="m-0 whitespace-pre-line">{comment.body}</p>
      <p className="m-0 text-sm text-muted-foreground">
        {formatOrderV2Instant(comment.createdAt, locale)}
        {comment.editedAt ? ` · ${dictionary.orderV2CommentEdited} ${formatOrderV2Instant(comment.editedAt, locale)}` : ""}
      </p>
      <details>
        <summary>{dictionary.orderV2CommentEditAction}</summary>
        <form action={`/orders-v2/${orderId}`} className="flex flex-col gap-3 pt-3" method="post">
          <Input name="action" type="hidden" value="edit-comment" />
          <Input name="commentId" type="hidden" value={comment.id} />
          <Input name="commentVersion" type="hidden" value={comment.version} />
          <Field>
            <FieldLabel htmlFor={`comment-edit-${comment.id}`}>{dictionary.orderV2CommentEditAction}</FieldLabel>
            <Textarea data-ds-hit-target defaultValue={comment.body} id={`comment-edit-${comment.id}`} maxLength={2000} minLength={1} name="body" required />
          </Field>
          <div className="flex flex-wrap gap-3">
            <CatalogSubmit label={dictionary.orderV2CommentEditSubmit} tone="secondary" />
          </div>
        </form>
      </details>
    </article>
  );
}

export function OrderV2CommentsCard({
  dictionary,
  locale,
  order,
}: Readonly<{
  dictionary: Dictionary;
  locale: SupportedLocale;
  order: OrderV2View;
}>) {
  return (
    <Card>
      <CardHeader><CardTitle>{dictionary.orderV2CommentsHeading}</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-5">
        {order.comments.length === 0 ? <p>{dictionary.orderV2CommentsEmpty}</p> : (
          <div className="flex flex-col gap-4">
            {order.comments.map((comment) => (
              <CommentEntry comment={comment} dictionary={dictionary} key={comment.id} locale={locale} orderId={order.id} />
            ))}
          </div>
        )}
        <form action={`/orders-v2/${order.id}`} className="flex flex-col gap-3" method="post">
          <Input name="action" type="hidden" value="append-comment" />
          <Field>
            <FieldLabel htmlFor="comment-append-body">{dictionary.orderV2CommentAddLabel}</FieldLabel>
            <Textarea data-ds-hit-target id="comment-append-body" maxLength={2000} minLength={1} name="body" required />
          </Field>
          <div className="flex flex-wrap gap-3">
            <CatalogSubmit label={dictionary.orderV2CommentAddSubmit} />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function OutcomeForm({
  confirm,
  description,
  dictionary,
  label,
  order,
  outcome,
  tone,
}: Readonly<{
  confirm: string;
  description: string;
  dictionary: Dictionary;
  label: string;
  order: OrderV2View;
  outcome: OrderV2LocalOutcome;
  tone: "secondary" | "destructive";
}>) {
  return (
    <details>
      <summary>{confirm}</summary>
      <Alert variant="warning">
        <AlertTitle>{confirm}</AlertTitle>
        <AlertDescription>{description}</AlertDescription>
      </Alert>
      <form action={`/orders-v2/${order.id}`} className="flex flex-col gap-3 pt-3" method="post">
        <Input name="action" type="hidden" value="set-outcome" />
        <Input name="version" type="hidden" value={order.lifecycleVersion} />
        <Input name="outcome" type="hidden" value={outcome} />
        <Field>
          <FieldLabel htmlFor={`outcome-note-${outcome}`}>{dictionary.orderV2OutcomeNoteLabel}</FieldLabel>
          <Textarea data-ds-hit-target id={`outcome-note-${outcome}`} maxLength={2000} name="note" />
        </Field>
        <div className="flex flex-wrap gap-3">
          <CatalogSubmit label={label} tone={tone} />
        </div>
      </form>
    </details>
  );
}

// The local outcome is append-only history under the lifecycle CAS; it never
// writes, masks, or shadows the payment state, so both actions stay available.
export function OrderV2OutcomeCard({
  dictionary,
  order,
}: Readonly<{
  dictionary: Dictionary;
  order: OrderV2View;
}>) {
  return (
    <Card>
      <CardHeader><CardTitle>{dictionary.orderV2OutcomeHeading}</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-5">
        <OutcomeForm
          confirm={dictionary.orderV2OutcomeFinalizeConfirm}
          description={dictionary.orderV2OutcomeFinalizeDescription}
          dictionary={dictionary}
          label={dictionary.orderV2OutcomeFinalize}
          order={order}
          outcome="LOCAL_FINALIZED"
          tone="secondary"
        />
        <OutcomeForm
          confirm={dictionary.orderV2OutcomeCancelConfirm}
          description={dictionary.orderV2OutcomeCancelDescription}
          dictionary={dictionary}
          label={dictionary.orderV2OutcomeCancel}
          order={order}
          outcome="LOCAL_CANCELLED"
          tone="destructive"
        />
      </CardContent>
    </Card>
  );
}

export function OrderV2UnavailableCard({ backHref, dictionary }: Readonly<{ backHref: string; dictionary: Dictionary }>) {
  return (
    <EmptyState
      action={<Button asChild data-ds-hit-target variant="outline"><Link href={backHref}>{dictionary.orderV2DetailBack}</Link></Button>}
      body={dictionary.orderV2DetailUnavailableDescription}
      illustration="unavailable"
      kind="unavailable"
      title={dictionary.orderV2DetailUnavailable}
    />
  );
}
