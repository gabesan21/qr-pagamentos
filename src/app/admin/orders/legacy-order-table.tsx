import Link from "next/link";

import { formatProductPrice } from "@/app/admin/product-management";
import { formatOrderV2Instant } from "@/app/orders/order-v2-views";
import { orderStateLabel } from "@/app/orders/order-views";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CopyField } from "@/components/ui/copy-field";
import { EmptyState } from "@/components/ui/empty-state";
import { MoneyText } from "@/components/ui/money-text";
import { ProviderStateBadge, type ProviderState } from "@/components/ui/status-badge";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { getDictionary } from "@/i18n/dictionaries";
import type { SupportedLocale } from "@/i18n/locales";
import type { OrderSummary } from "@/orders/order-view";
import type { PaymentLinkOrderState } from "@/orders/payment-link-order";

type Dictionary = ReturnType<typeof getDictionary>;

function copyLabels(dictionary: Dictionary) {
  return {
    copy: dictionary.orderV2DirectoryCopy,
    pending: dictionary.orderV2DirectoryCopy,
    copied: dictionary.orderV2DirectoryCopied,
    failed: dictionary.orderV2DirectoryCopyFailed,
  };
}

// The eight V1 states are the same closed vocabulary the admin V2 directory
// registers on its `state` filter; only the casing differs between the
// stored enum and the domain badge's lowercase union.
function providerStateLabels(dictionary: Dictionary): Readonly<Record<ProviderState, string>> {
  return {
    created: orderStateLabel(dictionary, "CREATED"),
    pending: orderStateLabel(dictionary, "PENDING"),
    confirmed: orderStateLabel(dictionary, "CONFIRMED"),
    rejected: orderStateLabel(dictionary, "REJECTED"),
    cancelled: orderStateLabel(dictionary, "CANCELLED"),
    expired: orderStateLabel(dictionary, "EXPIRED"),
    indeterminate: orderStateLabel(dictionary, "INDETERMINATE"),
    refunded: orderStateLabel(dictionary, "REFUNDED"),
  };
}

function legacyStateValue(state: PaymentLinkOrderState): ProviderState {
  return state.toLowerCase() as ProviderState;
}

// Admin-local, read-only presentation of the byte-frozen V1 ledger
// (`src/orders/order-view.ts`, `src/app/orders/order-views.tsx`): no new
// service, query, or mutation — just the directory's own wide-table /
// card-list look, so the legacy section reads like a continuation of the V2
// directory above it instead of a different composition.
export function AdminLegacyOrderTable({
  detailHref,
  dictionary,
  locale,
  orders,
}: Readonly<{
  detailHref: (orderId: string) => string;
  dictionary: Dictionary;
  locale: SupportedLocale;
  orders: readonly OrderSummary[];
}>) {
  if (orders.length === 0) {
    return (
      <EmptyState
        body={dictionary.orderV2DirectoryEmptyDescription}
        illustration="orders"
        kind="empty"
        title={dictionary.orderV2DirectoryEmpty}
      />
    );
  }
  const labels = providerStateLabels(dictionary);
  return (
    <>
      <div aria-label={dictionary.orderV2DirectoryLegacyHeading} className="hidden min-w-0 md:block" role="region">
        <Table>
          <TableCaption>{dictionary.orderV2DirectoryLegacyHeading}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{dictionary.orderV2DetailDescription}</TableHead>
              <TableHead scope="col">{dictionary.orderV2DirectoryColumnLink}</TableHead>
              <TableHead scope="col">{dictionary.orderV2DirectoryColumnState}</TableHead>
              <TableHead className="text-right" scope="col">{dictionary.orderV2DirectoryColumnAmount}</TableHead>
              <TableHead className="text-right" scope="col">{dictionary.orderV2DirectoryColumnCreated}</TableHead>
              <TableHead scope="col">{dictionary.orderV2DirectoryColumnActions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order) => (
              <TableRow className="h-13" key={order.id}>
                <TableCell className="whitespace-normal">{locale === "pt-BR" ? order.productTitlePtBr : order.productTitleEn}</TableCell>
                <TableCell><CopyField labels={copyLabels(dictionary)} value={order.paymentLinkIdentifier} variant="compact" /></TableCell>
                <TableCell><ProviderStateBadge labels={labels} state={legacyStateValue(order.state)} /></TableCell>
                <TableCell className="text-right font-mono tabular-nums"><MoneyText pairLabel={order.currencyPairLabel} value={formatProductPrice(order.amount, locale)} /></TableCell>
                <TableCell className="text-right font-mono tabular-nums">{formatOrderV2Instant(order.createdAt, locale)}</TableCell>
                <TableCell>
                  <Button asChild data-ds-hit-target variant="outline">
                    <Link href={detailHref(order.id)}>{dictionary.orderV2DirectoryView}</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-col gap-4 md:hidden">
        {orders.map((order) => (
          <Card key={order.id}>
            <CardContent>
              <dl className="grid gap-3">
                <div className="grid gap-1 border-b border-border pb-3">
                  <dt className="text-sm font-medium text-muted-foreground">{dictionary.orderV2DetailDescription}</dt>
                  <dd className="m-0 break-words">{locale === "pt-BR" ? order.productTitlePtBr : order.productTitleEn}</dd>
                </div>
                <div className="grid gap-1 border-b border-border pb-3">
                  <dt className="text-sm font-medium text-muted-foreground">{dictionary.orderV2DirectoryColumnLink}</dt>
                  <dd className="m-0"><CopyField labels={copyLabels(dictionary)} value={order.paymentLinkIdentifier} variant="compact" /></dd>
                </div>
                <div className="grid gap-1 border-b border-border pb-3">
                  <dt className="text-sm font-medium text-muted-foreground">{dictionary.orderV2DirectoryColumnState}</dt>
                  <dd className="m-0"><ProviderStateBadge labels={labels} state={legacyStateValue(order.state)} /></dd>
                </div>
                <div className="grid gap-1 border-b border-border pb-3">
                  <dt className="text-sm font-medium text-muted-foreground">{dictionary.orderV2DirectoryColumnAmount}</dt>
                  <dd className="m-0 font-mono tabular-nums"><MoneyText pairLabel={order.currencyPairLabel} value={formatProductPrice(order.amount, locale)} /></dd>
                </div>
                <div className="grid gap-1 pb-3 last:pb-0">
                  <dt className="text-sm font-medium text-muted-foreground">{dictionary.orderV2DirectoryColumnCreated}</dt>
                  <dd className="m-0 font-mono tabular-nums">{formatOrderV2Instant(order.createdAt, locale)}</dd>
                </div>
              </dl>
              <Button asChild className="mt-3 w-full" data-ds-hit-target variant="outline">
                <Link href={detailHref(order.id)}>{dictionary.orderV2DirectoryView}</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
