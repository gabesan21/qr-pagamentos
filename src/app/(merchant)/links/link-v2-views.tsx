import Link from "next/link";

import type { PaymentLinkV2DerivedState, PaymentLinkV2View } from "@/auth/payment-link-v2-view";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyField } from "@/components/ui/copy-field";
import { MoneyText } from "@/components/ui/money-text";
import { Monogram } from "@/components/ui/monogram";
import { Separator } from "@/components/ui/separator";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Timeline, type TimelineEntry, type TimelineTone } from "@/components/ui/timeline";
import type { getDictionary } from "@/i18n/dictionaries";
import type { SupportedLocale } from "@/i18n/locales";

import { formatCatalogPrice } from "../catalog/price-format";

type Dictionary = ReturnType<typeof getDictionary>;

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

function copyLabels(dictionary: Dictionary) {
  return {
    copy: dictionary.paymentLinkDirectoryCopy,
    pending: dictionary.paymentLinkDirectoryCopy,
    copied: dictionary.paymentLinkDirectoryCopied,
    failed: dictionary.paymentLinkDirectoryCopyFailed,
  };
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

export function PaymentLinkV2DetailCard({
  backHref,
  backLabel,
  dictionary,
  link,
  locale,
  owner,
  showShareUrl = true,
}: Readonly<{
  backHref: string;
  backLabel?: string;
  dictionary: Dictionary;
  link: PaymentLinkV2View;
  locale: SupportedLocale;
  owner?: Readonly<{ username: string; deletedAt: Date | null }>;
  showShareUrl?: boolean;
}>) {
  const title = linkSummary(link, locale);
  const timeline = buildTimeline(dictionary, link);

  return (
    <div className="space-y-4">
      {backLabel ? <DetailBreadcrumb backHref={backHref} backLabel={backLabel} current={link.identifier} /> : null}
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
          <Card>
            <CardHeader>
              <CardTitle>{dictionary.paymentLinkDirectoryColumnSummary}</CardTitle>
              <CardDescription>{title}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <CopyField labels={copyLabels(dictionary)} truncate={false} value={link.id} />
              <div className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{dictionary.paymentLinkDirectoryIdentifier}</p>
                  <p className="mt-1 font-mono text-xs">{link.identifier}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{dictionary.paymentLinkDirectoryColumnComposition}</p>
                  <p className="mt-1.5 text-sm">{linkKindLabel(dictionary, link.compositionKind)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{dictionary.paymentLinkDirectoryColumnType}</p>
                  <p className="mt-1.5 text-sm">{linkTypeLabel(dictionary, link.linkType)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{dictionary.paymentLinkDirectoryCreated}</p>
                  <p className="mt-1 font-mono text-xs">{formatLinkInstant(link.createdAt, locale)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{dictionary.paymentLinkDirectoryUpdated}</p>
                  <p className="mt-1 font-mono text-xs">{formatLinkInstant(link.updatedAt, locale)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{dictionary.paymentLinkDirectoryColumnExpiry}</p>
                  <p className="mt-1 font-mono text-xs">{link.expiresAt ? formatLinkInstant(link.expiresAt, locale) : dictionary.adminPaymentLinkNoExpiry}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{dictionary.paymentLinkDirectoryCurrencyPair}</p>
                  <p className="mt-1.5 text-sm">{link.currencyPairLabel}</p>
                </div>
              </div>
              {owner ? (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{dictionary.adminPaymentLinkV2DetailOwnerHeading}</p>
                    <div className="mt-2 flex items-center gap-3">
                      <Monogram name={owner.username} />
                      <span className="text-sm font-medium">{owner.username}</span>
                      {owner.deletedAt !== null ? <Badge variant="outline">{dictionary.adminPaymentLinkV2DirectoryOwnerDeleted}</Badge> : null}
                    </div>
                    <Button asChild className="mt-3" data-ds-hit-target variant="outline">
                      <Link href="/admin/accounts">{dictionary.adminPaymentLinkV2DetailOwnerAccount}</Link>
                    </Button>
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>

          {link.compositionKind === "FIXED_AMOUNT" ? (
            <Card>
              <CardHeader>
                <CardTitle>{dictionary.paymentLinkDirectoryAmount}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <MoneyText className="justify-start" pairLabel={link.currencyPairLabel} size="large" value={link.amount ? formatCatalogPrice(link.amount, null, locale) : "—"} />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>{dictionary.paymentLinkDirectoryLines}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Table>
                  <TableCaption>{dictionary.paymentLinkDirectoryLines}</TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">{dictionary.paymentLinkDirectoryColumnSummary}</TableHead>
                      <TableHead className="text-right" scope="col">{dictionary.paymentLinkDirectoryQuantity}</TableHead>
                      <TableHead className="text-right" scope="col">{dictionary.paymentLinkDirectoryUnitPrice}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {link.lines.map((line) => (
                      <TableRow key={line.position}>
                        <TableCell>{locale === "pt-BR" ? line.titlePtBr : line.titleEn}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{line.quantity}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{formatCatalogPrice(line.unitPrice, null, locale)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4 lg:col-span-4">
          <Card>
            <CardHeader>
              <CardTitle>{dictionary.paymentLinkDirectoryColumnState}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{dictionary.paymentLinkDirectoryColumnState}</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <LinkStateBadge dictionary={dictionary} state={link.state} />
                  <time className="font-mono text-xs text-muted-foreground">{formatLinkInstant(link.updatedAt, locale)}</time>
                </div>
              </div>
              <Separator />
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{dictionary.paymentLinkDirectoryColumnOrders}</p>
                <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">{link.orderCount}</p>
              </div>
            </CardContent>
          </Card>

          {showShareUrl ? (
            <Card>
              <CardHeader>
                <CardTitle>{dictionary.paymentLinkDirectoryShareUrl}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <CopyField labels={copyLabels(dictionary)} truncate={false} value={link.sharePath} />
                <Button asChild data-ds-hit-target variant="outline">
                  <Link href={link.sharePath}>{dictionary.paymentLinkDirectoryShareOpen}</Link>
                </Button>
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
          <Link href={backHref}>{dictionary.paymentLinkDirectoryBack}</Link>
        </Button>
      ) : null}
    </div>
  );
}

export function PaymentLinkV2UnavailableCard({ backHref, dictionary }: Readonly<{ backHref: string; dictionary: Dictionary }>) {
  return (
    <div className="space-y-4">
      <Alert variant="destructive">
        <AlertTitle>{dictionary.paymentLinkDirectoryUnavailable}</AlertTitle>
        <AlertDescription>{dictionary.paymentLinkDirectoryUnavailableDescription}</AlertDescription>
      </Alert>
      <Button asChild data-ds-hit-target variant="outline"><Link href={backHref}>{dictionary.paymentLinkDirectoryBack}</Link></Button>
    </div>
  );
}
