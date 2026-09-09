"use client";

// Legacy (V1) era of `/links`: the frozen `payment_link` list rendered
// through the same `DataDirectory` composition as the Commerce V2 era, with
// its own restyled create/revoke forms posting to the byte-frozen
// `/payment-links` routes. `@/app/admin/payment-link-management` (the
// admin-only source this merchant surface replaced) has since been retired
// as dead code (14.7.1) — this file does not import it.
// The whole `PaymentLinkOwnerData` already crosses the server/client boundary
// today (this component is `"use client"` too), so passing it in changes no
// exposure.
import { useEffect, useState } from "react";

import type { OwnerPaymentLink, PaymentLinkOwnerData } from "@/auth/payment-link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyField } from "@/components/ui/copy-field";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { LinkLifecycleBadge, type LinkLifecycle } from "@/components/ui/status-badge";
import {
  DataDirectory,
  type DataDirectoryColumn,
  type DataDirectoryCopy,
  type DataDirectoryEnumFilter,
  type DataDirectoryState,
  type DataDirectoryTextFilter,
} from "@/data-directory/ui/data-directory";
import type { getDictionary } from "@/i18n/dictionaries";
import type { SupportedLocale } from "@/i18n/locales";

import { formatCatalogPrice } from "../catalog/price-format";
import { copyLabels, formatLinkInstant, linkTypeLabel } from "./link-v2-views";

type Dictionary = ReturnType<typeof getDictionary>;

export type LegacyLinksQuery = Readonly<{
  q?: string;
  state?: string;
  type?: string;
  from?: string;
  to?: string;
}>;

type LegacyState = "active" | "inactive" | "expired";
type LegacyRow = OwnerPaymentLink & Readonly<{ state: LegacyState }>;

const CALENDAR_DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

// Same exact UTC calendar-day parser as the registered `from`/`to` grammar;
// an already-invalid day never reaches this component (the query resolver
// rejects it before render), so `null` here only means "no bound".
function calendarDayStartUtc(value: string): Date | null {
  const match = CALENDAR_DAY_PATTERN.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const start = new Date(Date.UTC(year, month - 1, day));
  if (start.getUTCFullYear() !== year || start.getUTCMonth() !== month - 1 || start.getUTCDate() !== day) return null;
  return start;
}

// V1 carries no settlement projection reachable from this DTO (the V1
// single-use claim has no production caller — see the catalog spec), so its
// derived vocabulary is the V2 one minus `paid`: an owner-deactivated link is
// inactive, read-time expiry applies only to an active link, anything else
// stays active.
function deriveLegacyState(link: Readonly<{ active: boolean; expiresAt: Date | null }>, now: Date): LegacyState {
  if (!link.active) return "inactive";
  if (link.expiresAt !== null && link.expiresAt.getTime() <= now.getTime()) return "expired";
  return "active";
}

function matchesLegacyFilters(link: OwnerPaymentLink, state: LegacyState, filters: LegacyLinksQuery): boolean {
  if (filters.q && !link.identifier.toLowerCase().includes(filters.q.toLowerCase())) return false;
  if (filters.state && filters.state !== state) return false;
  if (filters.type && filters.type !== link.linkType) return false;
  if (filters.from) {
    const from = calendarDayStartUtc(filters.from);
    if (from && link.createdAt.getTime() < from.getTime()) return false;
  }
  if (filters.to) {
    const to = calendarDayStartUtc(filters.to);
    if (to && link.createdAt.getTime() >= to.getTime() + 24 * 60 * 60 * 1000) return false;
  }
  return true;
}

function legacyLifecycleLabels(dictionary: Dictionary): Readonly<Record<LinkLifecycle, string>> {
  return {
    active: dictionary.paymentLinkDirectoryStateActive,
    inactive: dictionary.paymentLinkDirectoryStateInactive,
    expired: dictionary.paymentLinkDirectoryStateExpired,
    // Never rendered for a legacy row (V1 has no reachable settlement
    // projection here); the record stays complete because the badge's
    // closed `LinkLifecycle` vocabulary requires all four labels.
    paid: dictionary.paymentLinkDirectoryStatePaid,
  };
}

// Native-submit pending affordance shared by the create and revoke forms
// below; mirrors the delivered admin `PaymentLinkSubmit` behavior exactly.
function LegacySubmit({ form, label, tone = "primary" }: Readonly<{ form: string; label: string; tone?: "primary" | "secondary" }>) {
  const [pending, setPending] = useState(false);
  useEffect(() => {
    const nativeForm = document.getElementById(form);
    if (!(nativeForm instanceof HTMLFormElement)) return;
    const observe = () => setPending(true);
    nativeForm.addEventListener("submit", observe);
    return () => nativeForm.removeEventListener("submit", observe);
  }, [form]);
  return (
    <Button aria-busy={pending || undefined} disabled={pending} form={form} type="submit" variant={tone === "secondary" ? "outline" : "default"}>
      {pending ? <Spinner data-icon="inline-start" /> : null}
      {label}
    </Button>
  );
}

function LegacyCreateForm({ data, dictionary, locale }: Readonly<{ data: PaymentLinkOwnerData; dictionary: Dictionary; locale: SupportedLocale }>) {
  const formId = "legacy-payment-link-create";
  return (
    <form action="/payment-links" id={formId} method="post">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="legacy-payment-link-product">{dictionary.adminPaymentLinkProduct}</FieldLabel>
          <NativeSelect id="legacy-payment-link-product" name="productId" required>
            <NativeSelectOption value="">{dictionary.adminPaymentLinkChooseProduct}</NativeSelectOption>
            {data.activeProducts.map((product) => (
              <NativeSelectOption key={product.id} value={product.id}>{product.internalName} — {formatCatalogPrice(product.price, null, locale)}</NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="legacy-payment-link-currency-pair">{dictionary.adminPaymentLinkCurrencyPair}</FieldLabel>
          <NativeSelect id="legacy-payment-link-currency-pair" name="currencyPairId" required>
            <NativeSelectOption value="">{dictionary.adminPaymentLinkChooseCurrencyPair}</NativeSelectOption>
            {data.activeCurrencyPairs.map((pair) => <NativeSelectOption key={pair.id} value={pair.id}>{pair.label}</NativeSelectOption>)}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="legacy-payment-link-type">{dictionary.adminPaymentLinkType}</FieldLabel>
          <NativeSelect defaultValue="REUSABLE" id="legacy-payment-link-type" name="linkType">
            <NativeSelectOption value="REUSABLE">{dictionary.adminPaymentLinkReusable}</NativeSelectOption>
            <NativeSelectOption value="SINGLE_USE">{dictionary.adminPaymentLinkSingleUse}</NativeSelectOption>
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="legacy-payment-link-expiry">{dictionary.adminPaymentLinkExpiry}</FieldLabel>
          <Input aria-describedby="legacy-payment-link-expiry-help" id="legacy-payment-link-expiry" name="expiresAt" type="datetime-local" />
          <FieldDescription id="legacy-payment-link-expiry-help">{dictionary.adminPaymentLinkExpiryHelp}</FieldDescription>
        </Field>
        <LegacySubmit form={formId} label={dictionary.adminPaymentLinkCreate} />
      </FieldGroup>
    </form>
  );
}

function LegacyDetailModal({
  dictionary,
  link,
  locale,
  onOpenChange,
  open,
  state,
}: Readonly<{ dictionary: Dictionary; link: OwnerPaymentLink; locale: SupportedLocale; onOpenChange: (open: boolean) => void; open: boolean; state: LegacyState }>) {
  const labels = legacyLifecycleLabels(dictionary);
  return (
    <Modal closeLabel={dictionary.paymentLinkDirectoryLegacyClose} onOpenChange={onOpenChange} open={open} title={dictionary.paymentLinkDirectoryLegacyDetailHeading}>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">{dictionary.paymentLinkDirectoryIdentifier}</dt>
          <dd><CopyField labels={copyLabels(dictionary)} truncate={false} value={link.identifier} /></dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{dictionary.adminPaymentLinkProduct}</dt>
          <dd>{link.product.internalName} — {formatCatalogPrice(link.product.price, null, locale)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{dictionary.paymentLinkDirectoryCurrencyPair}</dt>
          <dd>{link.currencyPair.label}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{dictionary.paymentLinkDirectoryColumnType}</dt>
          <dd>{linkTypeLabel(dictionary, link.linkType)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{dictionary.paymentLinkDirectoryColumnExpiry}</dt>
          <dd>{link.expiresAt ? formatLinkInstant(link.expiresAt, locale) : dictionary.adminPaymentLinkNoExpiry}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{dictionary.paymentLinkDirectoryColumnState}</dt>
          <dd><LinkLifecycleBadge labels={labels} lifecycle={state} /></dd>
        </div>
      </dl>
    </Modal>
  );
}

function LegacyRevokeForm({ dictionary, link }: Readonly<{ dictionary: Dictionary; link: OwnerPaymentLink }>) {
  const formId = `legacy-payment-link-${link.id}-revoke`;
  return (
    <form action={`/payment-links/${link.id}`} id={formId} method="post">
      <details>
        <summary>{dictionary.adminPaymentLinkRevokeHeading}</summary>
        <Alert variant="warning">
          <AlertTitle>{dictionary.adminPaymentLinkRevokeConfirm}</AlertTitle>
          <AlertDescription>{dictionary.adminPaymentLinkRevokeDescription}</AlertDescription>
          <LegacySubmit form={formId} label={dictionary.adminPaymentLinkRevoke} tone="secondary" />
        </Alert>
      </details>
    </form>
  );
}

function LegacyRowActions({ dictionary, link, locale, state }: Readonly<{ dictionary: Dictionary; link: OwnerPaymentLink; locale: SupportedLocale; state: LegacyState }>) {
  const [open, setOpen] = useState(false);
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Button data-ds-hit-target onClick={() => setOpen(true)} type="button" variant="outline">{dictionary.paymentLinkDirectoryLegacyView}</Button>
      <LegacyDetailModal dictionary={dictionary} link={link} locale={locale} onOpenChange={setOpen} open={open} state={state} />
      {link.active ? <LegacyRevokeForm dictionary={dictionary} link={link} /> : null}
    </span>
  );
}

export function LegacyLinksDirectory({
  canonicalFilterQuery,
  copy,
  data,
  dictionary,
  eraOptions,
  filters,
  formAction,
  locale,
  resetUrl,
}: Readonly<{
  canonicalFilterQuery: string;
  copy: DataDirectoryCopy;
  data: PaymentLinkOwnerData;
  dictionary: Dictionary;
  eraOptions: readonly DataDirectoryEnumFilter[];
  filters: LegacyLinksQuery;
  formAction: string;
  locale: SupportedLocale;
  resetUrl: string;
}>) {
  const now = new Date();
  const rows: LegacyRow[] = data.links
    .map((link) => ({ ...link, state: deriveLegacyState(link, now) }))
    .filter((row) => matchesLegacyFilters(row, row.state, filters));

  const columns: readonly DataDirectoryColumn<LegacyRow>[] = [
    {
      id: "identifier",
      label: dictionary.paymentLinkDirectoryColumnIdentifier,
      value: (row) => (
        <span className="flex flex-wrap items-center gap-2">
          <CopyField labels={copyLabels(dictionary)} truncate value={row.identifier} />
          <Badge variant="secondary">{dictionary.paymentLinkDirectoryLegacyChip}</Badge>
        </span>
      ),
    },
    {
      id: "summary",
      label: dictionary.paymentLinkDirectoryColumnSummary,
      value: (row) => <span className="text-sm text-muted-foreground line-clamp-2">{row.product.internalName} — {formatCatalogPrice(row.product.price, null, locale)}</span>,
    },
    { id: "type", label: dictionary.paymentLinkDirectoryColumnType, value: (row) => <Badge variant="outline">{linkTypeLabel(dictionary, row.linkType)}</Badge> },
    { id: "currency", label: dictionary.paymentLinkDirectoryColumnCurrency, value: (row) => <Badge variant="outline">{row.currencyPair.label}</Badge> },
    { id: "state", label: dictionary.paymentLinkDirectoryColumnState, value: (row) => <LinkLifecycleBadge labels={legacyLifecycleLabels(dictionary)} lifecycle={row.state} /> },
    {
      id: "dates",
      label: dictionary.paymentLinkDirectoryColumnDates,
      value: (row) => (
        <div className="text-xs leading-4">
          <div>{formatLinkInstant(row.createdAt, locale)}</div>
          <div className="text-muted-foreground">{row.expiresAt ? formatLinkInstant(row.expiresAt, locale) : dictionary.adminPaymentLinkNoExpiry}</div>
        </div>
      ),
    },
  ];

  const filtering = Boolean(filters.q || filters.state || filters.type || filters.from || filters.to);
  const state: DataDirectoryState = rows.length === 0 ? (filtering ? "filtered-empty" : "empty") : "ready";

  const textFilters: readonly DataDirectoryTextFilter[] = [
    { name: "from", label: dictionary.paymentLinkDirectoryFilterFrom, calendarDay: true, ...(filters.from ? { selected: filters.from } : {}) },
    { name: "to", label: dictionary.paymentLinkDirectoryFilterTo, calendarDay: true, ...(filters.to ? { selected: filters.to } : {}) },
  ];

  const hasPrerequisites = data.activeProducts.length > 0 && data.activeCurrencyPairs.length > 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{dictionary.adminPaymentLinksHeading}</CardTitle>
          <CardDescription>{dictionary.adminPaymentLinksDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          {hasPrerequisites ? (
            <LegacyCreateForm data={data} dictionary={dictionary} locale={locale} />
          ) : (
            <Alert>
              <AlertTitle>{dictionary.adminPaymentLinksUnavailable}</AlertTitle>
              <AlertDescription>{dictionary.adminPaymentLinksUnavailableDescription}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
      <Separator />
      <DataDirectory
        actionsLabel={dictionary.paymentLinkDirectoryColumnActions}
        canonicalFilterQuery={canonicalFilterQuery}
        caption={dictionary.paymentLinkDirectoryLegacyHeading}
        columns={columns}
        copy={copy}
        filters={[
          ...eraOptions,
          {
            name: "state",
            label: dictionary.paymentLinkDirectoryFilterState,
            allLabel: dictionary.paymentLinkDirectoryFilterAllStates,
            ...(filters.state ? { selected: filters.state } : {}),
            options: [
              { value: "active", label: dictionary.paymentLinkDirectoryStateActive },
              { value: "inactive", label: dictionary.paymentLinkDirectoryStateInactive },
              { value: "expired", label: dictionary.paymentLinkDirectoryStateExpired },
            ],
          },
          {
            name: "type",
            label: dictionary.paymentLinkDirectoryFilterType,
            allLabel: dictionary.paymentLinkDirectoryFilterAllTypes,
            ...(filters.type ? { selected: filters.type } : {}),
            options: [
              { value: "SINGLE_USE", label: dictionary.adminPaymentLinkSingleUse },
              { value: "REUSABLE", label: dictionary.adminPaymentLinkReusable },
            ],
          },
        ]}
        formAction={formAction}
        getRowActions={(row) => <LegacyRowActions dictionary={dictionary} link={row} locale={locale} state={row.state} />}
        idPrefix="payment-links-legacy"
        resetUrl={resetUrl}
        rowKey={(row) => row.id}
        rows={rows}
        {...(filters.q ? { search: filters.q } : {})}
        state={state}
        textFilters={textFilters}
      />
    </div>
  );
}
