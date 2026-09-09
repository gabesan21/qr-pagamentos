import Link from "next/link";
import type { ReactNode } from "react";

import type { PaymentLinkV2DerivedState, PaymentLinkV2LineSummary, PaymentLinkV2View } from "@/auth/payment-link-v2-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyField } from "@/components/ui/copy-field";
import { EmptyState } from "@/components/ui/empty-state";
import { MoneyText } from "@/components/ui/money-text";
import { Monogram } from "@/components/ui/monogram";
import { Separator } from "@/components/ui/separator";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Timeline, type TimelineEntry, type TimelineTone } from "@/components/ui/timeline";
import type { getDictionary } from "@/i18n/dictionaries";
import type { SupportedLocale } from "@/i18n/locales";

import { formatCatalogPrice } from "../catalog/price-format";
import { linkMoneyMultiply, linkMoneySum } from "./link-money";

type Dictionary = ReturnType<typeof getDictionary>;

// The base `PaymentLinkV2View` line carries no availability fact; the
// owner-only `findForOwner` projection adds it per line. Optional here keeps
// this shared file accepting both the owner detail (available always set)
// and the administrator's redacted reuse (field absent) with zero prop drift
// for either caller.
type PaymentLinkV2DetailLine = PaymentLinkV2LineSummary & Readonly<{ available?: boolean }>;

type PaymentLinkV2DetailLink = Omit<PaymentLinkV2View, "lines"> & Readonly<{ lines: ReadonlyArray<PaymentLinkV2DetailLine> }>;

export function formatLinkInstant(value: Date, locale: SupportedLocale) {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(value);
}

export function linkStateLabel(dictionary: Dictionary, state: PaymentLinkV2DerivedState) {
  if (state === "inactive") return dictionary.paymentLinkDirectoryStateInactive;
  if (state === "expired") return dictionary.paymentLinkDirectoryStateExpired;
  if (state === "paid") return dictionary.paymentLinkDirectoryStatePaid;
  return dictionary.paymentLinkDirectoryStateActive;
}

function linkStateTone(state: PaymentLinkV2DerivedState): StatusTone {
  if (state === "expired") return "danger";
  if (state === "inactive") return "neutral";
  if (state === "paid") return "success";
  return "info";
}

function toTimelineTone(tone: StatusTone): TimelineTone {
  if (tone === "neutral") return "default";
  if (tone === "warning") return "info";
  return tone;
}

export function LinkStateBadge({ dictionary, state }: Readonly<{ dictionary: Dictionary; state: PaymentLinkV2DerivedState }>) {
  return <StatusBadge label={linkStateLabel(dictionary, state)} tone={linkStateTone(state)} />;
}

export function linkTypeLabel(dictionary: Dictionary, linkType: PaymentLinkV2View["linkType"]) {
  return linkType === "SINGLE_USE" ? dictionary.adminPaymentLinkSingleUse : dictionary.adminPaymentLinkReusable;
}

export function linkKindLabel(dictionary: Dictionary, kind: PaymentLinkV2View["compositionKind"]) {
  return kind === "PRODUCT_LINES" ? dictionary.paymentLinkDirectoryKindProductLines : dictionary.paymentLinkDirectoryKindFixedAmount;
}

// Directory summary: the localized fixed-amount description, or the first
// ordered line title with a locale-neutral remainder count.
export function linkSummary(link: PaymentLinkV2View, locale: SupportedLocale) {
  if (link.compositionKind === "FIXED_AMOUNT") {
    return (locale === "pt-BR" ? link.descriptionPtBr : link.descriptionEn) ?? link.identifier;
  }
  const [first, ...rest] = link.lines;
  if (!first) return link.identifier;
  const title = locale === "pt-BR" ? first.titlePtBr : first.titleEn;
  return rest.length > 0 ? `${title} +${rest.length}` : title;
}

export function copyLabels(dictionary: Dictionary) {
  return {
    copy: dictionary.paymentLinkDirectoryCopy,
    pending: dictionary.paymentLinkDirectoryCopy,
    copied: dictionary.paymentLinkDirectoryCopied,
    failed: dictionary.paymentLinkDirectoryCopyFailed,
  };
}

function DetailBreadcrumb({ backHref, backLabel, current }: Readonly<{ backHref: string; backLabel: string; current: string }>) {
  return (
    <nav aria-label="breadcrumb" className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
      <Link className="inline-flex min-h-11 items-center text-foreground underline-offset-4 hover:underline" href={backHref}>{backLabel}</Link>
      <span aria-hidden>›</span>
      <span className="font-mono text-foreground">#{current}</span>
    </nav>
  );
}

function buildTimeline(dictionary: Dictionary, link: PaymentLinkV2View): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    {
      id: "created",
      title: dictionary.paymentLinkDirectoryCreated,
      formattedAt: formatLinkInstant(link.createdAt, "en"),
      dateTime: link.createdAt.toISOString(),
      tone: "info",
    },
  ];
  entries.push({
    id: "state",
    title: `${dictionary.paymentLinkDirectoryColumnState}: ${linkStateLabel(dictionary, link.state)}`,
    formattedAt: formatLinkInstant(link.updatedAt, "en"),
    dateTime: link.updatedAt.toISOString(),
    tone: toTimelineTone(linkStateTone(link.state)),
  });
  if (link.expiresAt) {
    entries.push({
      id: "expires",
      title: dictionary.paymentLinkDirectoryColumnExpiry,
      formattedAt: formatLinkInstant(link.expiresAt, "en"),
      dateTime: link.expiresAt.toISOString(),
      tone: "default",
    });
  }
  return entries;
}

function LinkPairChip({ label }: Readonly<{ label: string }>) {
  return (
    <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
      {label}
    </span>
  );
}

function SummaryCard({
  dictionary,
  link,
  locale,
}: Readonly<{ dictionary: Dictionary; link: PaymentLinkV2View; locale: SupportedLocale }>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{dictionary.paymentLinkDetailSummary}</CardTitle>
        <CardDescription>{linkSummary(link, locale)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border bg-muted/50 p-3">
            <p className="text-xs font-semibold uppercase text-muted-foreground">PT-BR</p>
            <p className="mt-1 text-sm">{link.descriptionPtBr ?? "—"}</p>
          </div>
          <div className="rounded-md border bg-muted/50 p-3">
            <p className="text-xs font-semibold uppercase text-muted-foreground">EN</p>
            <p className="mt-1 text-sm">{link.descriptionEn ?? "—"}</p>
          </div>
        </div>
        <Separator />
        <div className="grid gap-2 border-t border-border pt-3 text-xs text-muted-foreground sm:grid-cols-3">
          <div>
            <p>{dictionary.paymentLinkDirectoryCreated}</p>
            <p className="font-mono text-foreground">{formatLinkInstant(link.createdAt, locale)}</p>
          </div>
          <div>
            <p>{dictionary.paymentLinkDirectoryUpdated}</p>
            <p className="font-mono text-foreground">{formatLinkInstant(link.updatedAt, locale)}</p>
          </div>
          <div>
            <p>{dictionary.paymentLinkDirectoryColumnExpiry}</p>
            <p className="font-mono text-foreground">{link.expiresAt ? formatLinkInstant(link.expiresAt, locale) : dictionary.adminPaymentLinkNoExpiry}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CompositionCard({
  dictionary,
  link,
  locale,
}: Readonly<{ dictionary: Dictionary; link: PaymentLinkV2DetailLink; locale: SupportedLocale }>) {
  if (link.compositionKind === "FIXED_AMOUNT") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{dictionary.paymentLinkDirectoryAmount}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">{dictionary.paymentLinkDetailFixedAmount}</span>
            <MoneyText className="justify-start" pairLabel={link.currencyPairLabel} size="large" value={link.amount ? formatCatalogPrice(link.amount, null, locale) : "—"} />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Exact-decimal line totals and subtotal: BigInt micro-units end to end,
  // never `Number()` on a money amount.
  const lineTotals = link.lines.map((line) => linkMoneyMultiply(line.unitPrice, line.quantity));
  const subtotal = linkMoneySum(lineTotals);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{dictionary.paymentLinkDirectoryLines}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Table>
          <TableCaption className="sr-only">{dictionary.paymentLinkDirectoryLines}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{dictionary.paymentLinkDirectoryColumnSummary}</TableHead>
              <TableHead className="text-right" scope="col">{dictionary.paymentLinkDirectoryQuantity}</TableHead>
              <TableHead className="text-right" scope="col">{dictionary.paymentLinkDirectoryUnitPrice}</TableHead>
              <TableHead className="text-right" scope="col">{dictionary.paymentLinkDetailLineTotal}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {link.lines.map((line, index) => (
              <TableRow key={line.position}>
                <TableCell>
                  {locale === "pt-BR" ? line.titlePtBr : line.titleEn}
                  {line.available === false ? (
                    <Badge className="ml-2" variant="outline">{dictionary.paymentLinkDetailLineUnavailable}</Badge>
                  ) : null}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">{line.quantity}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{formatCatalogPrice(line.unitPrice, null, locale)}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{formatCatalogPrice(lineTotals[index], null, locale)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between border-t border-border pt-3">
          <span className="text-sm font-medium text-muted-foreground">{dictionary.paymentLinkDetailSubtotal}</span>
          <MoneyText className="justify-start" pairLabel={link.currencyPairLabel} size="large" value={formatCatalogPrice(subtotal, null, locale)} />
        </div>
      </CardContent>
    </Card>
  );
}

function OrdersSummaryCard({
  confirmed,
  dictionary,
  link,
  total,
  volume,
}: Readonly<{
  confirmed: number;
  dictionary: Dictionary;
  link: PaymentLinkV2View;
  total: number;
  volume: string;
}>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{dictionary.paymentLinkDetailOrdersSummary}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">{dictionary.paymentLinkDetailOrdersTotal}</dt>
            <dd className="font-mono tabular-nums">{total}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">{dictionary.paymentLinkDetailOrdersConfirmed}</dt>
            <dd className="font-mono tabular-nums">{confirmed}</dd>
          </div>
          <div className="flex items-center justify-between border-t border-border pt-2">
            <dt className="text-muted-foreground">{dictionary.paymentLinkDetailOrdersVolume}</dt>
            <dd><MoneyText className="justify-start" pairLabel={link.currencyPairLabel} value={volume} /></dd>
          </div>
        </dl>
        <Button asChild className="w-full" data-ds-hit-target variant="outline">
          <Link href={`/links/v2/${link.id}/orders`}>{dictionary.paymentLinkOrdersView}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function PublicUrlCard({ dictionary, link }: Readonly<{ dictionary: Dictionary; link: PaymentLinkV2View }>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{dictionary.paymentLinkDetailPublicUrl}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <CopyField labels={copyLabels(dictionary)} truncate={false} value={link.sharePath} />
        <LinkPairChip label={link.currencyPairLabel} />
      </CardContent>
    </Card>
  );
}

function OwnerCard({
  dictionary,
  owner,
}: Readonly<{
  dictionary: Dictionary;
  owner: Readonly<{ username: string; deletedAt: Date | null }>;
}>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{dictionary.adminPaymentLinkV2DetailOwnerHeading}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Monogram name={owner.username} />
          <span className="text-sm font-medium">{owner.username}</span>
          {owner.deletedAt !== null ? <Badge variant="outline">{dictionary.adminPaymentLinkV2DirectoryOwnerDeleted}</Badge> : null}
        </div>
        <Button asChild className="w-full" data-ds-hit-target variant="outline">
          <Link href="/admin/accounts">{dictionary.adminPaymentLinkV2DetailOwnerAccount}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function TimelineCard({ dictionary, link }: Readonly<{ dictionary: Dictionary; link: PaymentLinkV2View }>) {
  const timeline = buildTimeline(dictionary, link);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{dictionary.orderV2DetailChronology}</CardTitle>
      </CardHeader>
      <CardContent>
        <Timeline entries={timeline} />
      </CardContent>
    </Card>
  );
}

export function PaymentLinkV2DetailCard({
  actions,
  backHref,
  backLabel,
  dictionary,
  link,
  locale,
  orders,
  owner,
  showShareUrl = true,
}: Readonly<{
  // Owner-only action row (open checkout, edit, new version, view orders,
  // lifecycle control): renders directly under the header badge row, above
  // the summary/composition grid. The administrator reuse never passes it.
  actions?: ReactNode;
  backHref: string;
  backLabel?: string;
  dictionary: Dictionary;
  link: PaymentLinkV2DetailLink;
  locale: SupportedLocale;
  orders?: Readonly<{ total: number; confirmed: number; volume: string }>;
  owner?: Readonly<{ username: string; deletedAt: Date | null }>;
  showShareUrl?: boolean;
}>) {
  return (
    <div className="space-y-4">
      {backLabel ? <DetailBreadcrumb backHref={backHref} backLabel={backLabel} current={link.identifier} /> : null}

      <div className="flex flex-wrap items-center gap-3">
        <CopyField labels={copyLabels(dictionary)} truncate={false} value={link.identifier} />
        <LinkStateBadge dictionary={dictionary} state={link.state} />
        <Badge variant="outline">{linkTypeLabel(dictionary, link.linkType)}</Badge>
        <Badge variant="outline">{linkKindLabel(dictionary, link.compositionKind)}</Badge>
      </div>

      {actions}

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
          <SummaryCard dictionary={dictionary} link={link} locale={locale} />
          <CompositionCard dictionary={dictionary} link={link} locale={locale} />
        </div>

        <div className="space-y-4 lg:col-span-4">
          {owner ? <OwnerCard dictionary={dictionary} owner={owner} /> : null}
          {showShareUrl ? <PublicUrlCard dictionary={dictionary} link={link} /> : null}
          {orders ? <OrdersSummaryCard confirmed={orders.confirmed} dictionary={dictionary} link={link} total={orders.total} volume={orders.volume} /> : null}
          <TimelineCard dictionary={dictionary} link={link} />
        </div>
      </div>

      {!backLabel ? (
        <Button asChild data-ds-hit-target variant="outline">
          <Link href={backHref}>{dictionary.paymentLinkDirectoryBack}</Link>
        </Button>
      ) : null}
    </div>
  );
}

export function PaymentLinkV2UnavailableCard({ backHref, dictionary }: Readonly<{ backHref: string; dictionary: Dictionary }>) {
  return (
    <EmptyState
      action={<Button asChild data-ds-hit-target variant="outline"><Link href={backHref}>{dictionary.paymentLinkDirectoryBack}</Link></Button>}
      body={dictionary.paymentLinkDirectoryUnavailableDescription}
      illustration="unavailable"
      kind="unavailable"
      title={dictionary.paymentLinkDirectoryUnavailable}
    />
  );
}
