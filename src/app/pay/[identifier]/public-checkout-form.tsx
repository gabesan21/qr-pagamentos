"use client";

import { useEffect, useRef, useState } from "react";

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
import type { CheckoutDataPolicy, CustomerSnapshotV1, PaymentLinkOrderState } from "@/orders/payment-link-order";

type Dictionary = ReturnType<typeof getDictionary>;
type FieldName = "name" | "email" | "cpf" | "street" | "number" | "district" | "city" | "stateUf" | "postalCode";
type FormValues = Record<FieldName | "complement", string>;
type Payment = Readonly<{ state: PaymentLinkOrderState; pixCopyPaste?: string; pixQrCodeUrl?: string }>;
type CheckoutAttempt = Readonly<{ idempotencyKey: string; customer: CustomerSnapshotV1 }>;

const ADDRESS_FIELDS: readonly FieldName[] = ["street", "number", "district", "city", "stateUf", "postalCode"];
const PAYMENT_STATES = new Set<PaymentLinkOrderState>(["CREATED", "PENDING", "INDETERMINATE", "CONFIRMED", "REJECTED", "CANCELLED", "EXPIRED", "REFUNDED"]);
const TERMINAL_STATES = new Set<PaymentLinkOrderState>(["CONFIRMED", "REJECTED", "CANCELLED", "EXPIRED", "REFUNDED"]);
const INITIAL_VALUES: FormValues = { name: "", email: "", cpf: "", street: "", number: "", district: "", city: "", stateUf: "", postalCode: "", complement: "" };
const BRAZILIAN_UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"] as const;

function requiredFields(policy: CheckoutDataPolicy): readonly FieldName[] {
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

function snapshot(policy: CheckoutDataPolicy, values: FormValues): Readonly<{ customer: CustomerSnapshotV1; invalid: Set<FieldName> }> {
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

function paymentCopy(dictionary: Dictionary, state: PaymentLinkOrderState): string {
  const copy: Record<PaymentLinkOrderState, string> = {
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

function paymentFromResponse(value: unknown): Payment | null {
  if (!value || typeof value !== "object" || !("state" in value)) return null;
  const payment = value as { state?: unknown; pixCopyPaste?: unknown; pixQrCodeUrl?: unknown };
  if (typeof payment.state !== "string" || !PAYMENT_STATES.has(payment.state as PaymentLinkOrderState)) return null;
  if (payment.pixCopyPaste !== undefined && typeof payment.pixCopyPaste !== "string") return null;
  if (payment.pixQrCodeUrl !== undefined && typeof payment.pixQrCodeUrl !== "string") return null;
  return { state: payment.state as PaymentLinkOrderState, ...(payment.pixCopyPaste ? { pixCopyPaste: payment.pixCopyPaste } : {}), ...(payment.pixQrCodeUrl ? { pixQrCodeUrl: payment.pixQrCodeUrl } : {}) };
}

export function PublicCheckoutForm({ dictionary, identifier, policy }: Readonly<{ dictionary: Dictionary; identifier: string; policy: CheckoutDataPolicy }>) {
  const [values, setValues] = useState<FormValues>(INITIAL_VALUES);
  const [invalid, setInvalid] = useState<Set<FieldName>>(new Set());
  const [attempt, setAttempt] = useState<CheckoutAttempt | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [capability, setCapability] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [checkoutError, setCheckoutError] = useState(false);
  const [statusError, setStatusError] = useState(false);
  const [copyState, setCopyState] = useState<"success" | "error" | null>(null);
  const [statusRetry, setStatusRetry] = useState(0);
  const pollingRef = useRef(false);
  const terminalRef = useRef(false);

  useEffect(() => {
    if (!capability || terminalRef.current) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    let failures = 0;

    const schedule = (delay: number) => {
      if (cancelled || document.visibilityState === "hidden") return;
      timer = setTimeout(() => { void poll(); }, delay);
    };
    const poll = async () => {
      if (cancelled || pollingRef.current || document.visibilityState === "hidden") return;
      pollingRef.current = true;
      controller = new AbortController();
      try {
        const response = await fetch(`/api/payment-links/${identifier}/checkout/status`, { method: "POST", cache: "no-store", credentials: "omit", headers: { "content-type": "application/json" }, body: JSON.stringify({ statusCapability: capability }), signal: controller.signal });
        if (response.status === 404) { setUnavailable(true); return; }
        if (!response.ok) throw new Error("status-read-failed");
        const body: unknown = await response.json();
        const next = body && typeof body === "object" && "payment" in body ? paymentFromResponse((body as { payment?: unknown }).payment) : null;
        if (!next) throw new Error("status-read-failed");
        setPayment(next);
        terminalRef.current = TERMINAL_STATES.has(next.state);
        setStatusError(false);
        failures = 0;
        if (!terminalRef.current) schedule(5_000);
      } catch (error) {
        if (!cancelled && !(error instanceof DOMException && error.name === "AbortError")) {
          failures += 1;
          if (failures >= 3) setStatusError(true);
          else schedule(1_000 * 2 ** failures);
        }
      } finally {
        pollingRef.current = false;
      }
    };
    const onVisibilityChange = () => { if (document.visibilityState === "visible") schedule(0); };
    document.addEventListener("visibilitychange", onVisibilityChange);
    schedule(0);
    return () => { cancelled = true; if (timer) clearTimeout(timer); controller?.abort(); document.removeEventListener("visibilitychange", onVisibilityChange); pollingRef.current = false; };
  }, [capability, identifier, statusRetry]);

  const update = (field: keyof FormValues, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setInvalid((current) => { const next = new Set(current); next.delete(field as FieldName); return next; });
    setAttempt(null); setPayment(null); setCapability(null); setUnavailable(false); setCheckoutError(false); setStatusError(false);
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formSnapshot = snapshot(policy, values);
    setInvalid(formSnapshot.invalid);
    if (formSnapshot.invalid.size) return;
    const currentAttempt = attempt ?? { idempotencyKey: createRetryKey(), customer: formSnapshot.customer };
    setAttempt(currentAttempt); setSubmitting(true); setCheckoutError(false); setUnavailable(false);
    try {
      const response = await fetch(`/api/payment-links/${identifier}/checkout`, { method: "POST", cache: "no-store", credentials: "omit", headers: { "content-type": "application/json" }, body: JSON.stringify(currentAttempt) });
      if (response.status === 404) { setUnavailable(true); return; }
      if (!response.ok) { setCheckoutError(true); return; }
      const body: unknown = await response.json();
      const accepted = body && typeof body === "object" && "payment" in body && "statusCapability" in body
        ? { payment: paymentFromResponse((body as { payment?: unknown }).payment), statusCapability: (body as { statusCapability?: unknown }).statusCapability }
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

  const field = (name: FieldName, label: string, type = "text", autoComplete?: string) => <Field data-invalid={invalid.has(name) || undefined}>
    <FieldLabel htmlFor={`checkout-${name}`}>{label}</FieldLabel>
    <Input aria-invalid={invalid.has(name) || undefined} autoComplete={autoComplete} id={`checkout-${name}`} name={name} onChange={(event) => update(name, event.target.value)} required={requiredFields(policy).includes(name)} type={type} value={values[name]} />
    {invalid.has(name) ? <FieldError>{dictionary.checkoutValidationError}</FieldError> : null}
  </Field>;

  return <Card className="checkout-card">
    <CardHeader><CardTitle>{dictionary.checkoutCustomerHeading}</CardTitle></CardHeader>
    <CardContent>
      <form className="checkout-form" onSubmit={submit}>
        <FieldGroup>
          {requiredFields(policy).length === 0 ? <Alert role="status"><AlertDescription>{dictionary.checkoutNoCustomerData}</AlertDescription></Alert> : null}
          {requiredFields(policy).includes("name") ? field("name", dictionary.checkoutNameLabel, "text", "name") : null}
          {requiredFields(policy).includes("email") ? field("email", dictionary.checkoutEmailLabel, "email", "email") : null}
          {requiredFields(policy).includes("cpf") ? field("cpf", dictionary.checkoutCpfLabel, "text", "off") : null}
          {policy === "NAME_EMAIL_CPF_ADDRESS" ? <FieldSet><FieldLegend>{dictionary.checkoutAddressLegend}</FieldLegend><FieldGroup>
            {field("street", dictionary.checkoutStreetLabel, "text", "street-address")}
            {field("number", dictionary.checkoutNumberLabel)}
            {field("district", dictionary.checkoutDistrictLabel)}
            {field("city", dictionary.checkoutCityLabel, "text", "address-level2")}
            <Field data-invalid={invalid.has("stateUf") || undefined}><FieldLabel htmlFor="checkout-stateUf">{dictionary.checkoutStateUfLabel}</FieldLabel><NativeSelect aria-invalid={invalid.has("stateUf") || undefined} id="checkout-stateUf" name="stateUf" onChange={(event) => update("stateUf", event.target.value)} required value={values.stateUf}><NativeSelectOption value="">{dictionary.checkoutStateUfPlaceholder}</NativeSelectOption>{BRAZILIAN_UFS.map((uf) => <NativeSelectOption key={uf} value={uf}>{uf}</NativeSelectOption>)}</NativeSelect>{invalid.has("stateUf") ? <FieldError>{dictionary.checkoutValidationError}</FieldError> : null}</Field>
            {field("postalCode", dictionary.checkoutPostalCodeLabel, "text", "postal-code")}
            <Field><FieldLabel htmlFor="checkout-complement">{dictionary.checkoutComplementLabel}</FieldLabel><Input autoComplete="address-line2" id="checkout-complement" name="complement" onChange={(event) => update("complement", event.target.value)} value={values.complement} /></Field>
          </FieldGroup></FieldSet> : null}
          {checkoutError ? <Alert variant="destructive"><AlertTitle>{dictionary.checkoutErrorHeading}</AlertTitle><AlertDescription>{dictionary.checkoutErrorDescription}</AlertDescription></Alert> : null}
          {unavailable ? <Alert variant="warning"><AlertTitle>{dictionary.checkoutUnavailableHeading}</AlertTitle><AlertDescription>{dictionary.checkoutUnavailableDescription}</AlertDescription></Alert> : null}
          <Button aria-busy={submitting || undefined} disabled={submitting || unavailable} type="submit">{submitting ? <Spinner data-icon="inline-start" /> : null}{submitting ? dictionary.checkoutSubmitting : attempt ? dictionary.checkoutRetry : dictionary.checkoutSubmit}</Button>
        </FieldGroup>
      </form>
      {payment ? <section aria-live="polite" className="checkout-payment" aria-label={dictionary.checkoutPaymentHeading}>
        <Separator />
        <div className="checkout-payment__heading"><h2>{dictionary.checkoutPaymentHeading}</h2><Badge variant={TERMINAL_STATES.has(payment.state) && payment.state !== "CONFIRMED" ? "destructive" : "secondary"}>{paymentCopy(dictionary, payment.state)}</Badge></div>
        {payment.pixQrCodeUrl ? <>
          {/* The opaque, short-lived provider QR URL must be used directly; optimizing it would proxy payment data. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt={dictionary.checkoutQrAlt} className="checkout-qr" src={payment.pixQrCodeUrl} />
        </> : null}
        {payment.pixCopyPaste ? <div className="checkout-copy"><Input aria-label={dictionary.checkoutPixLabel} readOnly value={payment.pixCopyPaste} /><Button onClick={() => { void copyPix(); }} type="button" variant="outline">{dictionary.checkoutCopyPix}</Button></div> : null}
        {!payment.pixCopyPaste && !payment.pixQrCodeUrl && !TERMINAL_STATES.has(payment.state) ? <Alert role="status"><AlertDescription>{dictionary.checkoutWaitingPaymentData}</AlertDescription></Alert> : null}
        {copyState ? <p aria-live="polite">{copyState === "success" ? dictionary.checkoutCopySuccess : dictionary.checkoutCopyError}</p> : null}
        {statusError ? <Alert variant="warning"><AlertTitle>{dictionary.checkoutStatusErrorHeading}</AlertTitle><AlertDescription>{dictionary.checkoutStatusErrorDescription}</AlertDescription></Alert> : null}
        {statusError ? <Button onClick={() => setStatusRetry((value) => value + 1)} type="button" variant="outline">{dictionary.checkoutRetryStatus}</Button> : null}
      </section> : null}
    </CardContent>
    <CardFooter><p className="checkout-privacy">{dictionary.checkoutPrivacyNotice}</p></CardFooter>
  </Card>;
}
