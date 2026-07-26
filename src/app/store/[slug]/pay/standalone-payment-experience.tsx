"use client";

import { useEffect, useRef, useState } from "react";

import { createPollingController } from "@/app/pay/[identifier]/public-checkout-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import type { getDictionary } from "@/i18n/dictionaries";
import type { CheckoutDataPolicy, CustomerSnapshotV1 } from "@/orders/payment-link-order";
import { isStorefrontCartAmount } from "@/storefront/cart";

type Dictionary = ReturnType<typeof getDictionary>;
export type StandaloneFieldName = "name" | "email" | "cpf" | "street" | "number" | "district" | "city" | "stateUf" | "postalCode";
export type StandaloneFormValues = Record<StandaloneFieldName | "complement", string>;

// The closed client state set (9.2.2): the union of 9.2.1's accept states
// (RESERVED, CREATING, PENDING, INDETERMINATE) and the V1 status vocabulary
// (CREATED, PENDING, INDETERMINATE, CONFIRMED, REJECTED, CANCELLED, EXPIRED,
// REFUNDED). RESERVED/CREATING render the waiting treatment, never an error.
export type StandalonePaymentState = "RESERVED" | "CREATING" | "CREATED" | "PENDING" | "INDETERMINATE" | "CONFIRMED" | "REJECTED" | "CANCELLED" | "EXPIRED" | "REFUNDED";
export type StandalonePayment = Readonly<{ state: StandalonePaymentState; pixCopyPaste?: string; pixQrCodeUrl?: string }>;
type CheckoutAttempt = Readonly<{ idempotencyKey: string; amount: string; customer: CustomerSnapshotV1 }>;

const ADDRESS_FIELDS: readonly StandaloneFieldName[] = ["street", "number", "district", "city", "stateUf", "postalCode"];
const PAYMENT_STATES = new Set<StandalonePaymentState>(["RESERVED", "CREATING", "CREATED", "PENDING", "INDETERMINATE", "CONFIRMED", "REJECTED", "CANCELLED", "EXPIRED", "REFUNDED"]);
const TERMINAL_STATES = new Set<StandalonePaymentState>(["CONFIRMED", "REJECTED", "CANCELLED", "EXPIRED", "REFUNDED"]);
const INITIAL_VALUES: StandaloneFormValues = { name: "", email: "", cpf: "", street: "", number: "", district: "", city: "", stateUf: "", postalCode: "", complement: "" };
const BRAZILIAN_UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"] as const;

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
      email: policy === "NAME_EMAIL" || policy === "EMAIL" || policy === "NAME_EMAIL_CPF" || policy === "NAME_EMAIL_CPF_ADDRESS" ? values.email : null,
      cpf: policy === "NAME_EMAIL_CPF" || policy === "NAME_EMAIL_CPF_ADDRESS" ? values.cpf : null,
      address,
    },
    invalid,
  };
}

function paymentCopy(dictionary: Dictionary, state: StandalonePaymentState): string {
  const copy: Record<StandalonePaymentState, string> = {
    RESERVED: dictionary.checkoutStateCreated,
    CREATING: dictionary.checkoutStateCreated,
    CREATED: dictionary.checkoutStateCreated,
    PENDING: dictionary.checkoutStatePending,
    INDETERMINATE: dictionary.checkoutStateIndeterminate,
    CONFIRMED: dictionary.checkoutStateConfirmed,
    REJECTED: dictionary.checkoutStateRejected,
    CANCELLED: dictionary.checkoutStateCancelled,
    EXPIRED: dictionary.checkoutStateExpired,
    REFUNDED: dictionary.checkoutStateRefunded,
  };
  return copy[state];
}

export function standalonePaymentFromResponse(value: unknown): StandalonePayment | null {
  if (!value || typeof value !== "object" || !("state" in value)) return null;
  const payment = value as { state?: unknown; pixCopyPaste?: unknown; pixQrCodeUrl?: unknown };
  if (typeof payment.state !== "string" || !PAYMENT_STATES.has(payment.state as StandalonePaymentState)) return null;
  if (payment.pixCopyPaste !== undefined && typeof payment.pixCopyPaste !== "string") return null;
  if (payment.pixQrCodeUrl !== undefined && typeof payment.pixQrCodeUrl !== "string") return null;
  return { state: payment.state as StandalonePaymentState, ...(payment.pixCopyPaste ? { pixCopyPaste: payment.pixCopyPaste } : {}), ...(payment.pixQrCodeUrl ? { pixQrCodeUrl: payment.pixQrCodeUrl } : {}) };
}

// The one opaque unavailable view: unknown/disabled slug, standalone off,
// submit 404, status 404, and an expired capability all share it, with the
// localized return-to-store link as the only affordance.
export function StandalonePaymentUnavailable({ dictionary, slug }: Readonly<{ dictionary: Dictionary; slug: string }>) {
  return (
    <Card className="storefront-card">
      <CardHeader><CardTitle>{dictionary.storefrontUnavailableHeading}</CardTitle></CardHeader>
      <CardContent className="storefront-error">
        <Alert variant="destructive">
          <AlertTitle>{dictionary.storefrontUnavailableHeading}</AlertTitle>
          <AlertDescription>{dictionary.storefrontUnavailableDescription}</AlertDescription>
        </Alert>
        <div>
          <Button asChild variant="outline">
            <a href={`/store/${slug}`}>{dictionary.storefrontPayReturn}</a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Pure presentational composition of the standalone payment journey; the
// stateful wrapper below owns every handler, so tests render each closed
// state directly.
export function StandalonePaymentView({
  amount,
  amountInvalid,
  attemptMade,
  checkoutError,
  copyState,
  currencyCode,
  dictionary,
  invalid,
  onAmountChange,
  onCopyPix,
  onFieldChange,
  onStatusRetry,
  onSubmit,
  payment,
  policy,
  slug,
  statusError,
  submittedAmount,
  submitting,
  unavailable,
  values,
}: Readonly<{
  amount: string;
  amountInvalid: boolean;
  attemptMade: boolean;
  checkoutError: boolean;
  copyState: "success" | "error" | null;
  currencyCode: string | null;
  dictionary: Dictionary;
  invalid: ReadonlySet<StandaloneFieldName>;
  onAmountChange: (value: string) => void;
  onCopyPix: () => void;
  onFieldChange: (field: keyof StandaloneFormValues, value: string) => void;
  onStatusRetry: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  payment: StandalonePayment | null;
  policy: CheckoutDataPolicy;
  slug: string;
  statusError: boolean;
  submittedAmount: string | null;
  submitting: boolean;
  unavailable: boolean;
  values: StandaloneFormValues;
}>) {
  if (unavailable) return <StandalonePaymentUnavailable dictionary={dictionary} slug={slug} />;

  const field = (name: StandaloneFieldName, label: string, type = "text", autoComplete?: string) => <Field data-invalid={invalid.has(name) || undefined}>
    <FieldLabel htmlFor={`standalone-${name}`}>{label}</FieldLabel>
    <Input aria-invalid={invalid.has(name) || undefined} autoComplete={autoComplete} id={`standalone-${name}`} name={name} onChange={(event) => onFieldChange(name, event.target.value)} required={requiredFields(policy).includes(name)} type={type} value={values[name]} />
    {invalid.has(name) ? <FieldError>{dictionary.checkoutValidationError}</FieldError> : null}
  </Field>;

  return <Card className="checkout-card">
    <CardHeader><CardTitle>{dictionary.storefrontPayHeading}</CardTitle></CardHeader>
    <CardContent>
      <form className="checkout-form" onSubmit={onSubmit}>
        <FieldGroup>
          <Field data-invalid={amountInvalid || undefined}>
            <FieldLabel htmlFor="standalone-amount">{dictionary.storefrontCustomAmountLabel}{currencyCode ? ` (${currencyCode})` : ""}</FieldLabel>
            <Input aria-invalid={amountInvalid || undefined} autoComplete="off" id="standalone-amount" inputMode="decimal" name="amount" onChange={(event) => onAmountChange(event.target.value)} required type="text" value={amount} />
            {amountInvalid ? <FieldError>{dictionary.storefrontCustomAmountInvalid}</FieldError> : null}
          </Field>
          {requiredFields(policy).length === 0 ? <Alert role="status"><AlertDescription>{dictionary.checkoutNoCustomerData}</AlertDescription></Alert> : null}
          {requiredFields(policy).includes("name") ? field("name", dictionary.checkoutNameLabel, "text", "name") : null}
          {requiredFields(policy).includes("email") ? field("email", dictionary.checkoutEmailLabel, "email", "email") : null}
          {requiredFields(policy).includes("cpf") ? field("cpf", dictionary.checkoutCpfLabel, "text", "off") : null}
          {policy === "NAME_EMAIL_CPF_ADDRESS" ? <FieldSet><FieldLegend>{dictionary.checkoutAddressLegend}</FieldLegend><FieldGroup>
            {field("street", dictionary.checkoutStreetLabel, "text", "street-address")}
            {field("number", dictionary.checkoutNumberLabel)}
            {field("district", dictionary.checkoutDistrictLabel)}
            {field("city", dictionary.checkoutCityLabel, "text", "address-level2")}
            <Field data-invalid={invalid.has("stateUf") || undefined}><FieldLabel htmlFor="standalone-stateUf">{dictionary.checkoutStateUfLabel}</FieldLabel><NativeSelect aria-invalid={invalid.has("stateUf") || undefined} id="standalone-stateUf" name="stateUf" onChange={(event) => onFieldChange("stateUf", event.target.value)} required value={values.stateUf}><NativeSelectOption value="">{dictionary.checkoutStateUfPlaceholder}</NativeSelectOption>{BRAZILIAN_UFS.map((uf) => <NativeSelectOption key={uf} value={uf}>{uf}</NativeSelectOption>)}</NativeSelect>{invalid.has("stateUf") ? <FieldError>{dictionary.checkoutValidationError}</FieldError> : null}</Field>
            {field("postalCode", dictionary.checkoutPostalCodeLabel, "text", "postal-code")}
            <Field><FieldLabel htmlFor="standalone-complement">{dictionary.checkoutComplementLabel}</FieldLabel><Input autoComplete="address-line2" id="standalone-complement" name="complement" onChange={(event) => onFieldChange("complement", event.target.value)} value={values.complement} /></Field>
          </FieldGroup></FieldSet> : null}
          {checkoutError ? <Alert variant="destructive"><AlertTitle>{dictionary.checkoutErrorHeading}</AlertTitle><AlertDescription>{dictionary.checkoutErrorDescription}</AlertDescription></Alert> : null}
          <Button aria-busy={submitting || undefined} disabled={submitting} type="submit">{submitting ? <Spinner data-icon="inline-start" /> : null}{submitting ? dictionary.checkoutSubmitting : attemptMade ? dictionary.checkoutRetry : dictionary.checkoutSubmit}</Button>
        </FieldGroup>
      </form>
      {payment ? <section aria-live="polite" className="checkout-payment" aria-label={dictionary.checkoutPaymentHeading}>
        <Separator />
        <div className="checkout-payment__heading"><h2>{dictionary.checkoutPaymentHeading}</h2><Badge variant={TERMINAL_STATES.has(payment.state) && payment.state !== "CONFIRMED" ? "destructive" : "secondary"}>{paymentCopy(dictionary, payment.state)}</Badge></div>
        {submittedAmount ? <p className="storefront-price"><span>{dictionary.storefrontCustomAmountLabel}</span> {submittedAmount}{currencyCode ? ` ${currencyCode}` : ""}</p> : null}
        {payment.pixQrCodeUrl ? <>
          {/* The opaque, short-lived provider QR URL must be used directly; optimizing it would proxy payment data. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt={dictionary.checkoutQrAlt} className="checkout-qr" src={payment.pixQrCodeUrl} />
        </> : null}
        {payment.pixCopyPaste ? <div className="checkout-copy"><Input aria-label={dictionary.checkoutPixLabel} readOnly value={payment.pixCopyPaste} /><Button onClick={onCopyPix} type="button" variant="outline">{dictionary.checkoutCopyPix}</Button></div> : null}
        {!payment.pixCopyPaste && !payment.pixQrCodeUrl && !TERMINAL_STATES.has(payment.state) ? <Alert role="status"><AlertDescription>{dictionary.checkoutWaitingPaymentData}</AlertDescription></Alert> : null}
        {copyState ? <p aria-live="polite">{copyState === "success" ? dictionary.checkoutCopySuccess : dictionary.checkoutCopyError}</p> : null}
        {statusError ? <Alert variant="warning"><AlertTitle>{dictionary.checkoutStatusErrorHeading}</AlertTitle><AlertDescription>{dictionary.checkoutStatusErrorDescription}</AlertDescription></Alert> : null}
        {statusError ? <Button onClick={onStatusRetry} type="button" variant="outline">{dictionary.checkoutRetryStatus}</Button> : null}
      </section> : null}
    </CardContent>
    <CardFooter className="storefront-pay-footer">
      <p className="checkout-privacy">{dictionary.checkoutPrivacyNotice}</p>
      <Button asChild variant="outline">
        <a href={`/store/${slug}`}>{dictionary.storefrontPayReturn}</a>
      </Button>
    </CardFooter>
  </Card>;
}

// The single client boundary of the standalone payment page (9.2.2): it owns
// the amount draft, the policy-exact customer form, the idempotency-key retry
// semantics, the capability polling (V1's controller, unchanged), and every
// failure view. The browser never supplies owner, currency, total, or status:
// the submit body is exactly { idempotencyKey, amount, customer } and 9.2.1
// re-derives everything else from locked persisted state.
export function StandalonePaymentExperience({
  currencyCode,
  dictionary,
  policy,
  prefillAmount,
  slug,
}: Readonly<{
  currencyCode: string | null;
  dictionary: Dictionary;
  policy: CheckoutDataPolicy;
  prefillAmount: string | null;
  slug: string;
}>) {
  const [amount, setAmount] = useState(prefillAmount && isStorefrontCartAmount(prefillAmount) ? prefillAmount : "");
  const [amountInvalid, setAmountInvalid] = useState(false);
  const [values, setValues] = useState<StandaloneFormValues>(INITIAL_VALUES);
  const [invalid, setInvalid] = useState<Set<StandaloneFieldName>>(new Set());
  const [attempt, setAttempt] = useState<CheckoutAttempt | null>(null);
  const [payment, setPayment] = useState<StandalonePayment | null>(null);
  const [capability, setCapability] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [checkoutError, setCheckoutError] = useState(false);
  const [statusError, setStatusError] = useState(false);
  const [copyState, setCopyState] = useState<"success" | "error" | null>(null);
  const [statusRetry, setStatusRetry] = useState(0);
  const terminalRef = useRef(false);

  useEffect(() => {
    if (!capability || terminalRef.current) return;
    let failures = 0;
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
        setStatusError(false);
        failures = 0;
        if (!terminalRef.current) schedule(5_000);
      } catch (error) {
        if (isCurrent() && !(error instanceof DOMException && error.name === "AbortError")) {
          failures += 1;
          if (failures >= 3) setStatusError(true);
          else schedule(1_000 * 2 ** failures);
        }
      }
    });
    polling.start();
    return polling.stop;
  }, [capability, slug, statusRetry]);

  const resetFlow = () => {
    setAttempt(null); setPayment(null); setCapability(null); setUnavailable(false); setCheckoutError(false); setStatusError(false); setCopyState(null);
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const amountValid = isStorefrontCartAmount(amount);
    const formSnapshot = snapshot(policy, values);
    setAmountInvalid(!amountValid);
    setInvalid(formSnapshot.invalid);
    if (!amountValid || formSnapshot.invalid.size) return;
    const currentAttempt = attempt ?? { idempotencyKey: createRetryKey(), amount, customer: formSnapshot.customer };
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

  const copyPix = async () => {
    if (!payment?.pixCopyPaste || !navigator.clipboard) { setCopyState("error"); return; }
    try { await navigator.clipboard.writeText(payment.pixCopyPaste); setCopyState("success"); } catch { setCopyState("error"); }
  };

  return (
    <StandalonePaymentView
      amount={amount}
      amountInvalid={amountInvalid}
      attemptMade={attempt !== null}
      checkoutError={checkoutError}
      copyState={copyState}
      currencyCode={currencyCode}
      dictionary={dictionary}
      invalid={invalid}
      onAmountChange={(value) => { setAmount(value); setAmountInvalid(false); resetFlow(); }}
      onCopyPix={() => { void copyPix(); }}
      onFieldChange={(field, value) => {
        setValues((current) => ({ ...current, [field]: value }));
        setInvalid((current) => { const next = new Set(current); next.delete(field as StandaloneFieldName); return next; });
        resetFlow();
      }}
      onStatusRetry={() => setStatusRetry((value) => value + 1)}
      onSubmit={(event) => { void submit(event); }}
      payment={payment}
      policy={policy}
      slug={slug}
      statusError={statusError}
      submittedAmount={attempt?.amount ?? null}
      submitting={submitting}
      unavailable={unavailable}
      values={values}
    />
  );
}
