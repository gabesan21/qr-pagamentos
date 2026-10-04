"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { createPollingController } from "@/app/pay/[identifier]/public-checkout-form";
import { CheckoutNamedState, CheckoutPaymentView } from "@/app/pay/[identifier]/checkout-payment-views";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import type { getDictionary } from "@/i18n/dictionaries";
import { formatPublicMoney } from "@/lib/public-money-display";
import type { CheckoutDataPolicy, CustomerSnapshotV1 } from "@/orders/order-v2-policies";
import { isStorefrontCartAmount } from "@/storefront/cart";

type Dictionary = ReturnType<typeof getDictionary>;
export type StandaloneFieldName = "name" | "email" | "cpf" | "street" | "number" | "district" | "city" | "stateUf" | "postalCode";
export type StandaloneFormValues = Record<StandaloneFieldName | "complement", string>;
export type StandalonePaymentFlow = "legacy" | "storefront";

// The closed client state set (9.2.2): the union of 9.2.1's accept states
// (RESERVED, CREATING, PENDING, INDETERMINATE) and the V1 status vocabulary
// (CREATED, PENDING, INDETERMINATE, CONFIRMED, REJECTED, CANCELLED, EXPIRED,
// REFUNDED). RESERVED/CREATING/CREATED render the waiting treatment, never an
// error. Identical to 14.6.1's `CheckoutPaymentViewState` (14.6.2 F02), so the
// payment/outcome phases render through `CheckoutPaymentView` unconverted.
export type StandalonePaymentState = "RESERVED" | "CREATING" | "CREATED" | "PENDING" | "INDETERMINATE" | "CONFIRMED" | "REJECTED" | "CANCELLED" | "EXPIRED" | "REFUNDED";
export type StandalonePayment = Readonly<{ state: StandalonePaymentState; pixCopyPaste?: string; pixQrCodeUrl?: string }>;
type CheckoutAttempt = Readonly<{ idempotencyKey: string; amount: string; customer: CustomerSnapshotV1 }>;

const ADDRESS_FIELDS: readonly StandaloneFieldName[] = ["street", "number", "district", "city", "stateUf", "postalCode"];
const PAYMENT_STATES = new Set<StandalonePaymentState>(["RESERVED", "CREATING", "CREATED", "PENDING", "INDETERMINATE", "CONFIRMED", "REJECTED", "CANCELLED", "EXPIRED", "REFUNDED"]);
const TERMINAL_STATES = new Set<StandalonePaymentState>(["CONFIRMED", "REJECTED", "CANCELLED", "EXPIRED", "REFUNDED"]);
const INITIAL_VALUES: StandaloneFormValues = { name: "", email: "", cpf: "", street: "", number: "", district: "", city: "", stateUf: "", postalCode: "", complement: "" };
const BRAZILIAN_UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"] as const;

function splitCanonicalAmount(amount: string): readonly [string, string | undefined] {
  const [whole, fraction] = amount.split(".");
  return [whole, fraction];
}

type BrazilianAmountParts = Readonly<{ whole: string; fraction?: string }>;

function brazilianAmountParts(value: string): BrazilianAmountParts | null {
  const unprefixed = value.trim().replace(/^R\$\s?/, "");
  const [whole, ...fractions] = unprefixed.split(",");
  if (fractions.length > 1 || !whole) return null;
  const fraction = fractions[0];
  const ungrouped = /^\d+$/.test(whole);
  const grouped = /^\d{1,3}(?:\.\d{3})+$/.test(whole);
  if ((!ungrouped && !grouped) || (fraction !== undefined && (!/^\d{1,6}$/.test(fraction)))) return null;
  return { whole: whole.replaceAll(".", ""), ...(fraction === undefined ? {} : { fraction }) };
}

function brazilianDisplayFraction(fraction: string | undefined): string {
  return (fraction ?? "").padEnd(2, "0");
}

/** Formats the canonical BRL amount without numeric coercion or rounding. */
export function formatStandaloneBrl(amount: string): string {
  return isStorefrontCartAmount(amount) ? formatPublicMoney(amount, "BRL", "pt-BR") : amount;
}

// The BRL field is a presentation adapter only. It retains incomplete input
// while the buyer types, and sends the same canonical ASCII decimal that the
// server already validates.
export function canonicalStandaloneBrlInput(value: string): string {
  const parts = brazilianAmountParts(value);
  // Never return an arbitrary invalid draft here: callers validate this value
  // against the canonical grammar, so malformed grouping must stay invalid.
  if (!parts) return "";
  const normalizedWhole = parts.whole.replace(/^0+(?=\d)/, "");
  const normalizedFraction = parts.fraction?.replace(/0+$/, "");
  return normalizedFraction ? `${normalizedWhole || "0"}.${normalizedFraction}` : normalizedWhole || "0";
}

function formatStandaloneBrlDraft(value: string): string {
  const parts = brazilianAmountParts(value);
  if (!parts) return value;
  const grouped = parts.whole.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${grouped},${brazilianDisplayFraction(parts.fraction)}`;
}

type BrlCashDigits = Readonly<{ digits: string; precision: number }>;

function brlCashDigits(value: string): BrlCashDigits | null {
  const parts = brazilianAmountParts(value);
  if (!parts) return null;
  const precision = Math.max(2, parts.fraction?.length ?? 0);
  const whole = parts.whole.replace(/^0+(?=\d)/, "") || "0";
  return { digits: `${whole}${(parts.fraction ?? "").padEnd(precision, "0")}`, precision };
}

function brlCashValue(digits: string, precision: number): Readonly<{ display: string; canonical: string }> {
  if (digits === "") return { display: "", canonical: "" };
  const padded = digits.padStart(precision + 1, "0");
  const whole = padded.slice(0, -precision).replace(/^0+(?=\d)/, "") || "0";
  const fraction = padded.slice(-precision);
  const canonical = `${whole}.${fraction.replace(/0+$/, "")}`.replace(/\.$/, "");
  return { display: formatPublicMoney(canonical, "BRL", "pt-BR"), canonical };
}

function digitBoundary(value: string, caret: number): number {
  return [...value.slice(0, caret)].filter((character) => /\d/.test(character)).length;
}

function caretAtDigitBoundary(value: string, boundary: number): number {
  if (boundary <= 0) return value.search(/\d/);
  let seen = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (/\d/.test(value[index])) seen += 1;
    if (seen === boundary) return index + 1;
  }
  return value.length;
}

// This is deliberately a digit-to-cents mask: regular keys edit the exact
// unscaled digit string, while a localized paste is parsed as an explicit
// decimal. That makes `1000` mean R$ 10,00 without ever coercing or rounding
// a pasted value that carries more than two fractional digits.
export function StandaloneBrlAmountInput({
  amountInvalid,
  errorId,
  disabled,
  id = "standalone-amount",
  name = "amount",
  onAmountChange,
  onBlur,
  placeholder,
  value,
}: Readonly<{
  amountInvalid: boolean;
  disabled: boolean;
  errorId?: string;
  id?: string;
  name?: string;
  onAmountChange: (value: string) => void;
  onBlur?: () => void;
  placeholder: string;
  value: string;
}>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingCaret = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (pendingCaret.current === null || !inputRef.current) return;
    const nextCaret = Math.max(0, pendingCaret.current);
    inputRef.current.setSelectionRange(nextCaret, nextCaret);
    pendingCaret.current = null;
  }, [value]);

  const updateCashDigits = (digits: string, precision: number, nextDigitBoundary: number) => {
    const next = brlCashValue(digits, precision);
    const remainingDigits = digits.length - nextDigitBoundary;
    const displayedDigits = digitBoundary(next.display, next.display.length);
    pendingCaret.current = caretAtDigitBoundary(next.display, Math.max(0, displayedDigits - remainingDigits));
    onAmountChange(next.display);
  };

  const insertDigit = (input: HTMLInputElement, digit: string, targetValue = value) => {
    const cash = brlCashDigits(value);
    const digits = cash?.digits ?? "";
    const precision = cash?.precision ?? 2;
    const selectionStart = input.selectionStart ?? targetValue.length;
    const selectionEnd = input.selectionEnd ?? targetValue.length;
    const start = digitBoundary(targetValue, selectionStart);
    const end = digitBoundary(targetValue, selectionEnd);
    updateCashDigits(`${digits.slice(0, start)}${digit}${digits.slice(end)}`, precision, start + 1);
  };

  const replaceWithPaste = (text: string) => {
    const canonical = canonicalStandaloneBrlInput(text);
    if (!canonical) {
      onAmountChange(text);
      return;
    }
    const display = formatPublicMoney(canonical, "BRL", "pt-BR");
    pendingCaret.current = display.length;
    onAmountChange(display);
  };

  return (
    <Input
      aria-describedby={amountInvalid ? errorId : undefined}
      aria-invalid={amountInvalid || undefined}
      autoComplete="off"
      disabled={disabled}
      id={id}
      inputMode="decimal"
      name={name}
      onBlur={onBlur}
      placeholder={placeholder}
      onBeforeInput={(event) => {
        const native = event.nativeEvent as InputEvent;
        if (!native.data || !/^\d$/.test(native.data)) return;
        event.preventDefault();
        insertDigit(event.currentTarget, native.data);
      }}
      onChange={(event) => {
        const native = event.nativeEvent as InputEvent;
        if (native.inputType === "insertText" || native.inputType === "deleteContentBackward" || native.inputType === "deleteContentForward") {
          const target = event.currentTarget;
          const cash = brlCashDigits(value);
          const precision = cash?.precision ?? 2;
          const digits = [...target.value].filter((character) => /\d/.test(character)).join("");
          const caret = digitBoundary(target.value, target.selectionStart ?? target.value.length);
          updateCashDigits(digits, precision, caret);
          return;
        }
        replaceWithPaste(event.target.value);
      }}
      onKeyDown={(event) => {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        const input = event.currentTarget;
        const cash = brlCashDigits(value);
        const digits = cash?.digits ?? "";
        const precision = cash?.precision ?? 2;
        const start = digitBoundary(value, input.selectionStart ?? value.length);
        const end = digitBoundary(value, input.selectionEnd ?? value.length);

        if (/^\d$/.test(event.key)) {
          event.preventDefault();
          insertDigit(input, event.key);
        } else if (event.key === "Backspace") {
          event.preventDefault();
          const removeStart = start === end ? Math.max(0, start - 1) : start;
          updateCashDigits(`${digits.slice(0, removeStart)}${digits.slice(end)}`, precision, removeStart);
        } else if (event.key === "Delete") {
          event.preventDefault();
          const removeEnd = start === end ? start + 1 : end;
          updateCashDigits(`${digits.slice(0, start)}${digits.slice(removeEnd)}`, precision, start);
        } else if (event.key === "," || event.key === ".") {
          event.preventDefault();
        }
      }}
      onPaste={(event) => {
        event.preventDefault();
        replaceWithPaste(event.clipboardData.getData("text"));
      }}
      ref={inputRef}
      required
      type="text"
      value={value}
    />
  );
}

function StandaloneAmountInput({
  amountDraft,
  amountInvalid,
  currencyCode,
  disabled,
  onAmountChange,
  onBlur,
  placeholder,
}: Readonly<{
  amountDraft: string;
  amountInvalid: boolean;
  currencyCode: string | null;
  disabled: boolean;
  onAmountChange: (value: string) => void;
  onBlur: () => void;
  placeholder: string;
}>) {
  if (currencyCode === "BRL") {
    return <StandaloneBrlAmountInput amountInvalid={amountInvalid} disabled={disabled} onAmountChange={onAmountChange} onBlur={onBlur} placeholder={placeholder} value={amountDraft} />;
  }
  return <Input aria-invalid={amountInvalid || undefined} autoComplete="off" disabled={disabled} id="standalone-amount" inputMode="decimal" name="amount" onBlur={onBlur} onChange={(event) => onAmountChange(event.target.value)} required type="text" value={amountDraft} />;
}

function requiredFields(policy: CheckoutDataPolicy): readonly StandaloneFieldName[] {
  if (policy === "NONE") return [];
  if (policy === "EMAIL") return ["email"];
  if (policy === "NAME_EMAIL") return ["name", "email"];
  if (policy === "NAME_EMAIL_CPF") return ["name", "email", "cpf"];
  return ["name", "email", "cpf", ...ADDRESS_FIELDS];
}

function createRetryKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function snapshot(policy: CheckoutDataPolicy, values: StandaloneFormValues): Readonly<{ customer: CustomerSnapshotV1; invalid: Set<StandaloneFieldName> }> {
  const required = requiredFields(policy);
  const invalid = new Set(required.filter((field) => !values[field].trim()));
  const address = policy === "NAME_EMAIL_CPF_ADDRESS"
    ? { street: values.street, number: values.number, district: values.district, city: values.city, stateUf: values.stateUf, postalCode: values.postalCode, country: "BR" as const, complement: values.complement || null }
    : null;
  return {
    customer: {
      name: policy === "NAME_EMAIL" || policy === "NAME_EMAIL_CPF" || policy === "NAME_EMAIL_CPF_ADDRESS" ? values.name : null,
      email: policy === "EMAIL" || policy === "NAME_EMAIL" || policy === "NAME_EMAIL_CPF" || policy === "NAME_EMAIL_CPF_ADDRESS" ? values.email : null,
      cpf: policy === "NAME_EMAIL_CPF" || policy === "NAME_EMAIL_CPF_ADDRESS" ? values.cpf : null,
      address,
    },
    invalid,
  };
}

export function standalonePaymentFromResponse(value: unknown): StandalonePayment | null {
  if (!value || typeof value !== "object" || !("state" in value)) return null;
  const payment = value as { state?: unknown; pixCopyPaste?: unknown; pixQrCodeUrl?: unknown };
  if (typeof payment.state !== "string" || !PAYMENT_STATES.has(payment.state as StandalonePaymentState)) return null;
  if (payment.pixCopyPaste !== undefined && typeof payment.pixCopyPaste !== "string") return null;
  if (payment.pixQrCodeUrl !== undefined && typeof payment.pixQrCodeUrl !== "string") return null;
  return { state: payment.state as StandalonePaymentState, ...(payment.pixCopyPaste ? { pixCopyPaste: payment.pixCopyPaste } : {}), ...(payment.pixQrCodeUrl ? { pixQrCodeUrl: payment.pixQrCodeUrl } : {}) };
}

// The one opaque unavailable view (14.6.2 F02, C2): unknown/disabled slug,
// standalone off, submit 404, status 404, and an expired capability all share
// this `EmptyState` composition — no more `Card` + destructive `Alert` — with
// the localized return-to-store link as the only affordance.
export function StandalonePaymentUnavailable({ dictionary, slug }: Readonly<{ dictionary: Dictionary; slug: string }>) {
  return (
    <EmptyState
      action={
        <Button asChild variant="outline">
          <a href={`/store/${slug}`}>{dictionary.storefrontPayReturn}</a>
        </Button>
      }
      body={dictionary.storefrontUnavailableDescription}
      illustration="unavailable"
      kind="unavailable"
      title={dictionary.storefrontUnavailableHeading}
    />
  );
}

// Pure presentational composition of the standalone payment journey; the
// stateful wrapper below owns every handler, so tests render each closed
// state directly. Once a payment exists the form yields entirely to 14.6.1's
// `CheckoutPaymentView` (C3, C4): no page-local tone map or outcome markup.
export function StandalonePaymentView({
  amount,
  amountDraft,
  frozenAmountDisplay,
  amountFrozen,
  amountInvalid,
  checkoutError,
  currencyCode,
  dictionary,
  invalid,
  onAmountChange,
  onAmountBlur,
  onEditAmount,
  onFieldChange,
  onStartOver,
  onSubmit,
  payment,
  policy,
  slug,
  statusReadFailed,
  submittedAmount,
  submittedAmountDisplay,
  submitting,
  unavailable,
  values,
}: Readonly<{
  amount: string;
  amountDraft: string;
  frozenAmountDisplay: string | null;
  amountFrozen: boolean;
  amountInvalid: boolean;
  checkoutError: boolean;
  currencyCode: string | null;
  dictionary: Dictionary;
  invalid: ReadonlySet<StandaloneFieldName>;
  onAmountChange: (value: string) => void;
  onAmountBlur: () => void;
  onEditAmount?: () => void;
  onFieldChange: (field: keyof StandaloneFormValues, value: string) => void;
  onStartOver: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  payment: StandalonePayment | null;
  policy: CheckoutDataPolicy;
  slug: string;
  statusReadFailed: boolean;
  submittedAmount: string | null;
  submittedAmountDisplay: string | null;
  submitting: boolean;
  unavailable: boolean;
  values: StandaloneFormValues;
}>) {
  if (unavailable) return <StandalonePaymentUnavailable dictionary={dictionary} slug={slug} />;

  if (payment) {
    return (
      <Card className="w-full">
        <CardContent className="grid gap-6">
          <CheckoutPaymentView
            currencyLabel={currencyCode === "BRL" ? undefined : currencyCode ?? undefined}
            dictionary={dictionary}
            merchantName={dictionary.storefrontFallbackName}
            onStartOver={onStartOver}
            pixCopyPaste={payment.pixCopyPaste}
            pixQrCodeUrl={payment.pixQrCodeUrl}
            state={payment.state}
            statusReadFailed={statusReadFailed}
            total={submittedAmountDisplay ?? (currencyCode === "BRL" ? formatStandaloneBrl(submittedAmount ?? amount) : submittedAmount ?? amount)}
          />
        </CardContent>
        <CardFooter className="flex flex-wrap items-center justify-between gap-3">
          {policy === "NONE" ? null : <p className="text-xs text-muted-foreground">{dictionary.checkoutPrivacyNotice}</p>}
          <Button asChild variant="outline">
            <a href={`/store/${slug}`}>{dictionary.storefrontPayReturn}</a>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  // A failed submit (non-ok, network, malformed body) replaces the form with
  // the named submit-failure state; `checkoutStartOver` is the only action.
  if (checkoutError) {
    return (
      <Card className="w-full">
        <CardContent>
          <CheckoutNamedState
            body={dictionary.checkoutSubmitFailureBody}
            onStartOver={onStartOver}
            startOverLabel={dictionary.checkoutStartOver}
            title={dictionary.checkoutSubmitFailureTitle}
          />
        </CardContent>
        <CardFooter className="flex flex-wrap items-center justify-between gap-3">
          {policy === "NONE" ? null : <p className="text-xs text-muted-foreground">{dictionary.checkoutPrivacyNotice}</p>}
          <Button asChild variant="outline">
            <a href={`/store/${slug}`}>{dictionary.storefrontPayReturn}</a>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  const field = (name: StandaloneFieldName, label: string, type = "text", autoComplete?: string) => (
    <Field data-invalid={invalid.has(name) || undefined}>
      <FieldLabel htmlFor={`standalone-${name}`}>{label}</FieldLabel>
      <Input aria-invalid={invalid.has(name) || undefined} autoComplete={autoComplete} id={`standalone-${name}`} name={name} onChange={(event) => onFieldChange(name, event.target.value)} required={requiredFields(policy).includes(name)} type={type} value={values[name]} />
      {invalid.has(name) ? <FieldError>{dictionary.checkoutValidationError}</FieldError> : null}
    </Field>
  );

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{dictionary.storefrontPayHeading}</CardTitle>
        {policy === "NONE" ? null : <CardDescription>{dictionary.storefrontPayIntroduction}</CardDescription>}
      </CardHeader>
      <CardContent>
        <form className="grid gap-6" onSubmit={onSubmit}>
          <FieldGroup>
            {amountFrozen ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
                <div>
                  <p className="m-0 text-xs font-medium text-text-2">{dictionary.checkoutAmountDueLabel}</p>
                  <output className="font-money text-lg font-semibold">{frozenAmountDisplay ?? (currencyCode === "BRL" ? formatStandaloneBrl(amount) : amount)}{currencyCode && currencyCode !== "BRL" ? ` ${currencyCode}` : ""}</output>
                </div>
                {onEditAmount ? <Button onClick={onEditAmount} type="button" variant="outline">{dictionary.storefrontEditAmount}</Button> : null}
              </div>
            ) : (
              <Field data-invalid={amountInvalid || undefined}>
                <FieldLabel htmlFor="standalone-amount">{dictionary.storefrontCustomAmountLabel}{currencyCode && currencyCode !== "BRL" ? ` (${currencyCode})` : ""}</FieldLabel>
                <StandaloneAmountInput amountDraft={amountDraft} amountInvalid={amountInvalid} currencyCode={currencyCode} disabled={amountFrozen} onAmountChange={onAmountChange} onBlur={onAmountBlur} placeholder={dictionary.storefrontCustomAmountPlaceholder} />
                {amountInvalid ? <FieldError>{dictionary.storefrontCustomAmountInvalid}</FieldError> : null}
              </Field>
            )}
            {requiredFields(policy).includes("name") ? field("name", dictionary.checkoutNameLabel, "text", "name") : null}
            {requiredFields(policy).includes("email") ? field("email", dictionary.checkoutEmailLabel, "email", "email") : null}
            {requiredFields(policy).includes("cpf") ? field("cpf", dictionary.checkoutCpfLabel, "text", "off") : null}
            {policy === "NAME_EMAIL_CPF_ADDRESS" ? (
              <FieldSet>
                <FieldLegend>{dictionary.checkoutAddressLegend}</FieldLegend>
                <FieldGroup>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
                    {field("street", dictionary.checkoutStreetLabel, "text", "street-address")}
                    {field("number", dictionary.checkoutNumberLabel)}
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {field("district", dictionary.checkoutDistrictLabel)}
                    {field("city", dictionary.checkoutCityLabel, "text", "address-level2")}
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field data-invalid={invalid.has("stateUf") || undefined}>
                      <FieldLabel htmlFor="standalone-stateUf">{dictionary.checkoutStateUfLabel}</FieldLabel>
                      <NativeSelect aria-invalid={invalid.has("stateUf") || undefined} id="standalone-stateUf" name="stateUf" onChange={(event) => onFieldChange("stateUf", event.target.value)} required value={values.stateUf}>
                        <NativeSelectOption value="">{dictionary.checkoutStateUfPlaceholder}</NativeSelectOption>
                        {BRAZILIAN_UFS.map((uf) => <NativeSelectOption key={uf} value={uf}>{uf}</NativeSelectOption>)}
                      </NativeSelect>
                      {invalid.has("stateUf") ? <FieldError>{dictionary.checkoutValidationError}</FieldError> : null}
                    </Field>
                    {field("postalCode", dictionary.checkoutPostalCodeLabel, "text", "postal-code")}
                  </div>
                  <Field>
                    <FieldLabel htmlFor="standalone-complement">{dictionary.checkoutComplementLabel}</FieldLabel>
                    <Input autoComplete="address-line2" id="standalone-complement" name="complement" onChange={(event) => onFieldChange("complement", event.target.value)} value={values.complement} />
                  </Field>
                </FieldGroup>
              </FieldSet>
            ) : null}
            <Button aria-busy={submitting || undefined} disabled={submitting} type="submit">{submitting ? <Spinner data-icon="inline-start" /> : null}{submitting ? dictionary.checkoutSubmitting : dictionary.checkoutSubmit}</Button>
          </FieldGroup>
        </form>
      </CardContent>
      <CardFooter className="flex flex-wrap items-center justify-between gap-3">
        {policy === "NONE" ? null : <p className="text-xs text-muted-foreground">{dictionary.checkoutPrivacyNotice}</p>}
        <Button asChild variant="outline">
          <a href={`/store/${slug}`}>{dictionary.storefrontPayReturn}</a>
        </Button>
      </CardFooter>
    </Card>
  );
}

function StandaloneAmountEntryView({
  amountDraft,
  amountInvalid,
  currencyCode,
  dictionary,
  onAmountChange,
  onAmountBlur,
  onContinue,
  returnHref,
}: Readonly<{
  amountDraft: string;
  amountInvalid: boolean;
  currencyCode: string | null;
  dictionary: Dictionary;
  onAmountChange: (value: string) => void;
  onAmountBlur: () => void;
  onContinue: () => void;
  returnHref?: string;
}>) {
  const unavailable = currencyCode === null;
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{dictionary.storefrontStandaloneHeading}</CardTitle>
        {unavailable ? <CardDescription>{dictionary.storefrontStandaloneCurrencyUnavailable}</CardDescription> : null}
      </CardHeader>
      <CardContent>
        <form className="grid gap-6" onSubmit={(event) => { event.preventDefault(); onContinue(); }}>
          <Field data-invalid={amountInvalid || undefined}>
            <FieldLabel htmlFor="standalone-amount">{dictionary.storefrontCustomAmountLabel}{currencyCode && currencyCode !== "BRL" ? ` (${currencyCode})` : ""}</FieldLabel>
            <StandaloneAmountInput amountDraft={amountDraft} amountInvalid={amountInvalid} currencyCode={currencyCode} disabled={unavailable} onAmountChange={onAmountChange} onBlur={onAmountBlur} placeholder={dictionary.storefrontCustomAmountPlaceholder} />
            {amountInvalid ? <FieldError>{dictionary.storefrontCustomAmountInvalid}</FieldError> : null}
          </Field>
          <Button disabled={unavailable} type="submit">{dictionary.storefrontStandaloneContinue}</Button>
        </form>
      </CardContent>
      {returnHref ? (
        <CardFooter>
          <Button asChild variant="outline">
            <a href={returnHref}>{dictionary.storefrontPayReturn}</a>
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  );
}

// The single client boundary of the standalone payment page (9.2.2): it owns
// the amount draft, the policy-exact customer form, one synchronously frozen
// idempotency attempt, the capability polling (V1's controller, unchanged), and every
// failure view. The browser never supplies owner, currency, total, or status:
// the submit body is exactly { idempotencyKey, amount, customer } and 9.2.1
// re-derives everything else from locked persisted state.
//
// Deviation (14.6.2 F02, plan risk 1): 14.6.1's `useCheckoutExperience` is
// welded to `/api/payment-links/[identifier]/**` and to a customer-only
// attempt body — this route posts `/api/store/[slug]/checkout` with an
// `amount` the buyer supplies, a shape the shared controller cannot express.
// The phase therefore stays local, but obeys the same rule the shared
// controller enforces: field/amount edits never touch attempt, payment, or
// capability, and the explicit start-over is the only reset.
export function StandalonePaymentExperience({
  currencyCode,
  dictionary,
  flow = "legacy",
  policy,
  prefillAmount,
  slug,
}: Readonly<{
  currencyCode: string | null;
  dictionary: Dictionary;
  flow?: StandalonePaymentFlow;
  policy: CheckoutDataPolicy;
  prefillAmount: string | null;
  slug: string;
}>) {
  const validPrefill = prefillAmount && isStorefrontCartAmount(prefillAmount) ? prefillAmount : null;
  const [amount, setAmount] = useState(validPrefill ?? "");
  const [amountDraft, setAmountDraft] = useState(validPrefill && currencyCode === "BRL" ? formatStandaloneBrl(validPrefill) : validPrefill ?? "");
  const [phase, setPhase] = useState<"amount" | "collection">(flow === "legacy" && validPrefill ? "collection" : "amount");
  const [frozenAmount, setFrozenAmount] = useState<string | null>(validPrefill);
  const [frozenAmountDisplay, setFrozenAmountDisplay] = useState<string | null>(validPrefill ? (currencyCode === "BRL" ? formatStandaloneBrl(validPrefill) : validPrefill) : null);
  const [amountInvalid, setAmountInvalid] = useState(false);
  const [values, setValues] = useState<StandaloneFormValues>(INITIAL_VALUES);
  const [invalid, setInvalid] = useState<Set<StandaloneFieldName>>(new Set());
  const [attempt, setAttempt] = useState<CheckoutAttempt | null>(null);
  const [submittedAmountDisplay, setSubmittedAmountDisplay] = useState<string | null>(null);
  const [payment, setPayment] = useState<StandalonePayment | null>(null);
  const [capability, setCapability] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [checkoutError, setCheckoutError] = useState(false);
  const [statusReadFailed, setStatusReadFailed] = useState(false);
  const terminalRef = useRef(false);
  const attemptRef = useRef<CheckoutAttempt | null>(null);

  useEffect(() => {
    if (!capability || terminalRef.current) return;
    const polling = createPollingController(document, async ({ signal, isCurrent, schedule }) => {
      try {
        const response = await fetch(`/api/store/${slug}/checkout/status`, { method: "POST", cache: "no-store", credentials: "omit", headers: { "content-type": "application/json" }, body: JSON.stringify({ statusCapability: capability }), signal });
        if (!isCurrent()) return;
        if (response.status === 404) { setUnavailable(true); return; }
        if (!response.ok) throw new Error("status-read-failed");
        const body: unknown = await response.json();
        if (!isCurrent()) return;
        const next = body && typeof body === "object" && "payment" in body ? standalonePaymentFromResponse((body as { payment?: unknown }).payment) : null;
        if (!next) throw new Error("status-read-failed");
        setPayment(next);
        terminalRef.current = TERMINAL_STATES.has(next.state);
        setStatusReadFailed(false);
        if (!terminalRef.current) schedule(5_000);
      } catch (error) {
        // A failed read stops the loop (no reschedule, no backoff, no
        // failure counter): the next 5 s tick never happens on its own.
        if (isCurrent() && !(error instanceof DOMException && error.name === "AbortError")) setStatusReadFailed(true);
      }
    });
    polling.start();
    return polling.stop;
  }, [capability, slug]);

  // The only reset (C04, mirrored from 14.6.1's `startOver`): field and
  // amount edits below never call this — they only clear their own
  // validation flag — so an issued payment survives every keystroke. Also
  // clears the failed-status-read flag.
  const startOver = () => {
    terminalRef.current = false;
    setAmount("");
    setAmountDraft("");
    setPhase("amount");
    setFrozenAmount(null);
    setFrozenAmountDisplay(null);
    setAmountInvalid(false);
    setValues(INITIAL_VALUES);
    setInvalid(new Set());
    setAttempt(null);
    setSubmittedAmountDisplay(null);
    setPayment(null);
    setCapability(null);
    setSubmitting(false);
    setUnavailable(false);
    setCheckoutError(false);
    setStatusReadFailed(false);
    attemptRef.current = null;
  };

  const submit = async () => {
    const amountToSubmit = frozenAmount ?? amount;
    const amountValid = isStorefrontCartAmount(amountToSubmit);
    const formSnapshot = snapshot(policy, values);
    setAmountInvalid(!amountValid);
    setInvalid(formSnapshot.invalid);
    if (!amountValid || formSnapshot.invalid.size || attemptRef.current) return;
    // Freeze the payload and key before the request starts. A duplicate event
    // sees this same mounted attempt and cannot create a replacement key.
    const currentAttempt = { idempotencyKey: createRetryKey(), amount: amountToSubmit, customer: formSnapshot.customer };
    attemptRef.current = currentAttempt;
    setSubmittedAmountDisplay(currencyCode === "BRL" ? formatStandaloneBrlDraft(amountDraft) : amountToSubmit);
    setAttempt(currentAttempt); setSubmitting(true); setCheckoutError(false); setUnavailable(false);
    try {
      const response = await fetch(`/api/store/${slug}/checkout`, { method: "POST", cache: "no-store", credentials: "omit", headers: { "content-type": "application/json" }, body: JSON.stringify(currentAttempt) });
      if (response.status === 404) { setUnavailable(true); return; }
      if (!response.ok) { setCheckoutError(true); return; }
      const body: unknown = await response.json();
      const accepted = body && typeof body === "object" && "payment" in body && "statusCapability" in body
        ? { payment: standalonePaymentFromResponse((body as { payment?: unknown }).payment), statusCapability: (body as { statusCapability?: unknown }).statusCapability }
        : null;
      if (!accepted?.payment || typeof accepted.statusCapability !== "string") { setCheckoutError(true); return; }
      terminalRef.current = TERMINAL_STATES.has(accepted.payment.state);
      setPayment(accepted.payment); setCapability(accepted.statusCapability);
    } catch { setCheckoutError(true); } finally { setSubmitting(false); }
  };

  const continueFromAmount = () => {
    if (!isStorefrontCartAmount(amount)) {
      setAmountInvalid(true);
      return;
    }
    setAmountInvalid(false);
    if (policy === "NONE") {
      setFrozenAmount(amount);
      setFrozenAmountDisplay(currencyCode === "BRL" ? formatStandaloneBrlDraft(amountDraft) : amount);
      setPhase("collection");
      void submit();
      return;
    }
    setFrozenAmount(amount);
    setFrozenAmountDisplay(currencyCode === "BRL" ? formatStandaloneBrlDraft(amountDraft) : amount);
    setPhase("collection");
  };

  if (phase === "amount") {
    return (
      <StandaloneAmountEntryView
        amountDraft={amountDraft}
        amountInvalid={amountInvalid}
        currencyCode={currencyCode}
        dictionary={dictionary}
        onAmountChange={(value) => {
          setAmountDraft(value);
          setAmount(currencyCode === "BRL" ? canonicalStandaloneBrlInput(value) : value);
          setAmountInvalid(false);
        }}
        onAmountBlur={() => {
          if (currencyCode === "BRL" && isStorefrontCartAmount(amount)) setAmountDraft(formatStandaloneBrlDraft(amountDraft));
        }}
        onContinue={continueFromAmount}
        returnHref={flow === "legacy" ? `/store/${slug}` : undefined}
      />
    );
  }

  return (
    <StandalonePaymentView
      amount={amount}
      amountDraft={amountDraft}
      frozenAmountDisplay={frozenAmountDisplay}
      amountFrozen={phase === "collection"}
      amountInvalid={amountInvalid}
      checkoutError={checkoutError}
      currencyCode={currencyCode}
      dictionary={dictionary}
      invalid={invalid}
      onAmountChange={(value) => {
        setAmountDraft(value);
        setAmount(currencyCode === "BRL" ? canonicalStandaloneBrlInput(value) : value);
        setAmountInvalid(false);
      }}
      onAmountBlur={() => {
        if (currencyCode === "BRL" && isStorefrontCartAmount(amount)) setAmountDraft(formatStandaloneBrlDraft(amountDraft));
      }}
      onEditAmount={flow === "storefront" && !attempt && !submitting ? () => { setPhase("amount"); setFrozenAmount(null); setFrozenAmountDisplay(null); } : undefined}
      onFieldChange={(field, value) => {
        setValues((current) => ({ ...current, [field]: value }));
        setInvalid((current) => { const next = new Set(current); next.delete(field as StandaloneFieldName); return next; });
      }}
      onStartOver={startOver}
      onSubmit={(event) => { event.preventDefault(); void submit(); }}
      payment={payment}
      policy={policy}
      slug={slug}
      statusReadFailed={statusReadFailed}
      submittedAmount={attempt?.amount ?? null}
      submittedAmountDisplay={submittedAmountDisplay}
      submitting={submitting}
      unavailable={unavailable}
      values={values}
    />
  );
}
