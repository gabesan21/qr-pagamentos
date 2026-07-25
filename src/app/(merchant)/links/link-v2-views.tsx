import Link from "next/link";

import type { PaymentLinkV2DerivedState, PaymentLinkV2View } from "@/auth/payment-link-v2-view";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { getDictionary } from "@/i18n/dictionaries";
import type { SupportedLocale } from "@/i18n/locales";

import { formatCatalogPrice } from "../catalog/price-format";
import { ShareLinkCopy } from "./share-copy";

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

export function LinkStateBadge({ dictionary, state }: Readonly<{ dictionary: Dictionary; state: PaymentLinkV2DerivedState }>) {
  if (state === "expired") return <Badge variant="destructive">{linkStateLabel(dictionary, state)}</Badge>;
  if (state === "inactive") return <Badge variant="outline">{linkStateLabel(dictionary, state)}</Badge>;
  return <Badge variant="secondary">{linkStateLabel(dictionary, state)}</Badge>;
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

function DetailFacts({ dictionary, link, locale }: Readonly<{ dictionary: Dictionary; link: PaymentLinkV2View; locale: SupportedLocale }>) {
  return (
    <dl>
      <div><dt>{dictionary.paymentLinkDirectoryIdentifier}</dt><dd>{link.identifier}</dd></div>
      <div><dt>{dictionary.paymentLinkDirectoryColumnState}</dt><dd><LinkStateBadge dictionary={dictionary} state={link.state} /></dd></div>
      <div><dt>{dictionary.paymentLinkDirectoryColumnComposition}</dt><dd>{linkKindLabel(dictionary, link.compositionKind)}</dd></div>
      <div><dt>{dictionary.paymentLinkDirectoryColumnType}</dt><dd>{linkTypeLabel(dictionary, link.linkType)}</dd></div>
      <div><dt>{dictionary.paymentLinkDirectoryColumnOrders}</dt><dd className="tabular-nums">{link.orderCount}</dd></div>
      <div><dt>{dictionary.paymentLinkDirectoryCurrencyPair}</dt><dd>{link.currencyPairLabel}</dd></div>
      <div><dt>{dictionary.paymentLinkDirectoryColumnExpiry}</dt><dd>{link.expiresAt ? formatLinkInstant(link.expiresAt, locale) : dictionary.adminPaymentLinkNoExpiry}</dd></div>
      <div><dt>{dictionary.paymentLinkDirectoryCreated}</dt><dd>{formatLinkInstant(link.createdAt, locale)}</dd></div>
      <div><dt>{dictionary.paymentLinkDirectoryUpdated}</dt><dd>{formatLinkInstant(link.updatedAt, locale)}</dd></div>
      <div>
        <dt>{dictionary.paymentLinkDirectoryShareUrl}</dt>
        <dd className="flex flex-wrap items-center gap-3">
          <span className="break-all">{link.sharePath}</span>
          <ShareLinkCopy
            copiedLabel={dictionary.paymentLinkDirectoryCopied}
            copyLabel={dictionary.paymentLinkDirectoryCopy}
            failedLabel={dictionary.paymentLinkDirectoryCopyFailed}
            value={link.sharePath}
          />
        </dd>
      </div>
    </dl>
  );
}

export function PaymentLinkV2DetailCard({
  backHref,
  dictionary,
  link,
  locale,
}: Readonly<{
  backHref: string;
  dictionary: Dictionary;
  link: PaymentLinkV2View;
  locale: SupportedLocale;
}>) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{linkSummary(link, locale)}</CardTitle>
          <CardDescription>{link.id}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="admin-account__facts">
            <DetailFacts dictionary={dictionary} link={link} locale={locale} />
          </div>
          <Separator />
          {link.compositionKind === "FIXED_AMOUNT" ? (
            <div className="admin-account__facts">
              <dl>
                <div><dt>{dictionary.paymentLinkDirectoryAmount}</dt><dd className="tabular-nums">{link.amount ? formatCatalogPrice(link.amount, null, locale) : link.amount}</dd></div>
              </dl>
            </div>
          ) : (
            <div className="admin-account__facts">
              <h2>{dictionary.paymentLinkDirectoryLines}</h2>
              <Table>
                <TableCaption>{dictionary.paymentLinkDirectoryLines}</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">{dictionary.paymentLinkDirectoryColumnSummary}</TableHead>
                    <TableHead scope="col">{dictionary.paymentLinkDirectoryQuantity}</TableHead>
                    <TableHead scope="col">{dictionary.paymentLinkDirectoryUnitPrice}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {link.lines.map((line) => (
                    <TableRow key={line.position}>
                      <TableCell>{locale === "pt-BR" ? line.titlePtBr : line.titleEn}</TableCell>
                      <TableCell className="tabular-nums">{line.quantity}</TableCell>
                      <TableCell className="tabular-nums">{formatCatalogPrice(line.unitPrice, null, locale)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      <Button asChild variant="outline"><Link href={backHref}>{dictionary.paymentLinkDirectoryBack}</Link></Button>
    </>
  );
}

export function PaymentLinkV2UnavailableCard({ backHref, dictionary }: Readonly<{ backHref: string; dictionary: Dictionary }>) {
  return (
    <>
      <Alert variant="destructive">
        <AlertTitle>{dictionary.paymentLinkDirectoryUnavailable}</AlertTitle>
        <AlertDescription>{dictionary.paymentLinkDirectoryUnavailableDescription}</AlertDescription>
      </Alert>
      <Button asChild variant="outline"><Link href={backHref}>{dictionary.paymentLinkDirectoryBack}</Link></Button>
    </>
  );
}
