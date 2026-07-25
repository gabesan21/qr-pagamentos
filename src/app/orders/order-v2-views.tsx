import Link from "next/link";

import { CatalogSubmit } from "@/app/(merchant)/catalog/catalog-submit";
import { formatCatalogPrice } from "@/app/(merchant)/catalog/price-format";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
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

export function OrderV2StateBadge({ dictionary, state }: Readonly<{ dictionary: Dictionary; state: OrderV2State | null }>) {
  if (state === "CONFIRMED") return <Badge variant="secondary">{orderV2StateLabel(dictionary, state)}</Badge>;
  if (state === "REJECTED") return <Badge variant="destructive">{orderV2StateLabel(dictionary, state)}</Badge>;
  return <Badge variant="outline">{orderV2StateLabel(dictionary, state)}</Badge>;
}

export function orderV2OutcomeLabel(dictionary: Dictionary, outcome: OrderV2LocalOutcome) {
  return outcome === "LOCAL_FINALIZED" ? dictionary.orderV2DirectoryOutcomeFinalized : dictionary.orderV2DirectoryOutcomeCancelled;
}

export function OrderV2OutcomeBadge({ dictionary, outcome }: Readonly<{ dictionary: Dictionary; outcome: OrderV2Summary["currentLocalOutcome"] }>) {
  if (outcome === null) return <Badge variant="outline">{dictionary.orderV2DirectoryOutcomeNone}</Badge>;
  const variant = outcome.outcome === "LOCAL_CANCELLED" ? "destructive" : "secondary";
  return <Badge variant={variant}>{orderV2OutcomeLabel(dictionary, outcome.outcome)}</Badge>;
}

export function orderV2SourceLabel(dictionary: Dictionary, source: OrderV2Source) {
  return source === "LINK" ? dictionary.orderV2DirectorySourceLink : dictionary.orderV2DirectorySourceAdHoc;
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

function CustomerSnapshot({ customer, dictionary }: Readonly<{ customer: CustomerSnapshotV1; dictionary: Dictionary }>) {
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

function DetailFacts({ dictionary, locale, order }: Readonly<{ dictionary: Dictionary; locale: SupportedLocale; order: OrderV2View }>) {
  return (
    <dl>
      <div><dt>{dictionary.orderV2DirectoryColumnSource}</dt><dd>{orderV2SourceLabel(dictionary, order.source)}</dd></div>
      <div><dt>{dictionary.orderV2DirectoryColumnState}</dt><dd><OrderV2StateBadge dictionary={dictionary} state={order.state} /></dd></div>
      <div>
        <dt>{dictionary.orderV2DirectoryColumnOutcome}</dt>
        <dd>
          <OrderV2OutcomeBadge dictionary={dictionary} outcome={order.currentLocalOutcome} />
          {order.currentLocalOutcome?.note ? <span className="block whitespace-pre-line">{order.currentLocalOutcome.note}</span> : null}
        </dd>
      </div>
      <div><dt>{dictionary.orderV2DirectoryColumnLink}</dt><dd>{order.paymentLinkV2Identifier ?? dictionary.orderV2DirectoryLinkNone}</dd></div>
      <div><dt>{dictionary.orderAmount}</dt><dd className="tabular-nums">{formatCatalogPrice(order.amount, null, locale)}</dd></div>
      <div><dt>{dictionary.checkoutPolicyHeading}</dt><dd>{orderV2PolicyLabel(dictionary, order.checkoutDataPolicy)}</dd></div>
      <div><dt>{dictionary.orderCreated}</dt><dd>{formatOrderV2Instant(order.createdAt, locale)}</dd></div>
      <div><dt>{dictionary.orderUpdated}</dt><dd>{formatOrderV2Instant(order.updatedAt, locale)}</dd></div>
      <div><dt>{dictionary.orderSettled}</dt><dd>{order.settledAt ? formatOrderV2Instant(order.settledAt, locale) : dictionary.adminNotProvided}</dd></div>
    </dl>
  );
}

export function orderV2SummaryTitle(order: OrderV2Summary, locale: SupportedLocale) {
  return (locale === "pt-BR" ? order.descriptionPtBr : order.descriptionEn) ?? order.id;
}

export function OrderV2DetailCard({
  backHref,
  dictionary,
  locale,
  order,
}: Readonly<{
  backHref: string;
  dictionary: Dictionary;
  locale: SupportedLocale;
  order: OrderV2View;
}>) {
  const description = locale === "pt-BR" ? order.descriptionPtBr : order.descriptionEn;
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{orderV2SummaryTitle(order, locale)}</CardTitle>
          <CardDescription>{order.id}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="admin-account__facts">
            <DetailFacts dictionary={dictionary} locale={locale} order={order} />
          </div>
          {description ? (
            <>
              <Separator />
              <div className="admin-account__facts">
                <dl>
                  <div><dt>{dictionary.orderV2DetailDescription}</dt><dd>{description}</dd></div>
                </dl>
              </div>
            </>
          ) : null}
          {order.lines.length > 0 ? (
            <>
              <Separator />
              <div className="admin-account__facts">
                <h2>{dictionary.orderV2DetailLines}</h2>
                <Table>
                  <TableCaption>{dictionary.orderV2DetailLines}</TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">{dictionary.orderV2DetailLine}</TableHead>
                      <TableHead scope="col">{dictionary.orderV2DetailQuantity}</TableHead>
                      <TableHead scope="col">{dictionary.orderV2DetailUnitPrice}</TableHead>
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
            <CustomerSnapshot customer={order.customer} dictionary={dictionary} />
          </div>
        </CardContent>
      </Card>
      <Button asChild data-ds-hit-target variant="outline"><Link href={backHref}>{dictionary.orderV2DetailBack}</Link></Button>
    </>
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
    <>
      <Alert variant="destructive">
        <AlertTitle>{dictionary.orderV2DetailUnavailable}</AlertTitle>
        <AlertDescription>{dictionary.orderV2DetailUnavailableDescription}</AlertDescription>
      </Alert>
      <Button asChild data-ds-hit-target variant="outline"><Link href={backHref}>{dictionary.orderV2DetailBack}</Link></Button>
    </>
  );
}
