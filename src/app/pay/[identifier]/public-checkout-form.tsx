"use client";

import type { ReactNode } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MoneyText } from "@/components/ui/money-text";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import type { getDictionary } from "@/i18n/dictionaries";
import type { CheckoutDataPolicy, PaymentLinkOrderState } from "@/orders/payment-link-order";

import { BRAZILIAN_UFS, requiredCheckoutFields, useCheckoutExperience, type CheckoutFieldName, type CheckoutPayment } from "./checkout-experience";
import { CheckoutPaymentView } from "./checkout-payment-views";

type Dictionary = ReturnType<typeof getDictionary>;
type PollContext = Readonly<{ signal: AbortSignal; isCurrent: () => boolean; schedule: (delay: number) => void }>;
type VisibilityDocument = Pick<Document, "visibilityState"> & Readonly<{
  addEventListener: (type: "visibilitychange", listener: () => void) => void;
  removeEventListener: (type: "visibilitychange", listener: () => void) => void;
}>;

const V1_PAYMENT_STATES = new Set<PaymentLinkOrderState>(["CREATED", "PENDING", "INDETERMINATE", "CONFIRMED", "REJECTED", "CANCELLED", "EXPIRED", "REFUNDED"]);
// Same five terminal members as `CHECKOUT_PAYMENT_TERMINAL_STATES` (F02),
// narrowed to the V1 state union so the two eras never share a loose set
// that accepts a state its own era cannot return.
const V1_TERMINAL_STATES = new Set<PaymentLinkOrderState>(["CONFIRMED", "REJECTED", "CANCELLED", "EXPIRED", "REFUNDED"]);

// Frozen export (14.6.1 F03 contract): `src/app/store/[slug]/pay/standalone-payment-experience.tsx`
// imports this from this exact path, name and signature — never move, rename
// or reshape it.
export function createPollingController(document: VisibilityDocument, poll: (context: PollContext) => Promise<void>) {
  let stopped = false;
  let polling = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  let activePoll = 0;

  const clearTimer = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
  };
  const isVisible = () => document.visibilityState !== "hidden";
  const pause = () => {
    activePoll += 1;
    clearTimer();
    controller?.abort();
    controller = undefined;
    polling = false;
  };
  const schedule = (delay: number) => {
    if (stopped || !isVisible()) return;
    clearTimer();
    timer = setTimeout(() => {
      timer = undefined;
      void run();
    }, delay);
  };
  const run = async () => {
    if (stopped || polling || !isVisible()) return;
    polling = true;
    const requestController = new AbortController();
    controller = requestController;
    const pollId = ++activePoll;
    const isCurrent = () => !stopped && isVisible() && pollId === activePoll;
    try {
      await poll({ signal: requestController.signal, isCurrent, schedule: (delay) => { if (isCurrent()) schedule(delay); } });
    } finally {
      if (pollId === activePoll) polling = false;
    }
  };
  const onVisibilityChange = () => {
    if (!isVisible()) { pause(); return; }
    schedule(0);
  };

  return {
    start: () => { document.addEventListener("visibilitychange", onVisibilityChange); schedule(0); },
    stop: () => { stopped = true; pause(); document.removeEventListener("visibilitychange", onVisibilityChange); },
  };
}

function parsePayment(value: unknown): CheckoutPayment<PaymentLinkOrderState> | null {
  if (!value || typeof value !== "object" || !("state" in value)) return null;
  const payment = value as { state?: unknown; pixCopyPaste?: unknown; pixQrCodeUrl?: unknown };
  if (typeof payment.state !== "string" || !V1_PAYMENT_STATES.has(payment.state as PaymentLinkOrderState)) return null;
  if (payment.pixCopyPaste !== undefined && typeof payment.pixCopyPaste !== "string") return null;
  if (payment.pixQrCodeUrl !== undefined && typeof payment.pixQrCodeUrl !== "string") return null;
  return { state: payment.state as PaymentLinkOrderState, ...(payment.pixCopyPaste ? { pixCopyPaste: payment.pixCopyPaste } : {}), ...(payment.pixQrCodeUrl ? { pixQrCodeUrl: payment.pixQrCodeUrl } : {}) };
}

function CheckoutField({ autoComplete, dictionary, errors, name, onChange, required, type = "text", value }: Readonly<{ autoComplete?: string; dictionary: Dictionary; errors: Partial<Record<CheckoutFieldName, string>>; name: CheckoutFieldName; onChange: (value: string) => void; required: boolean; type?: string; value: string }>) {
  const label: Record<CheckoutFieldName, string> = {
    name: dictionary.checkoutNameLabel,
    email: dictionary.checkoutEmailLabel,
    cpf: dictionary.checkoutCpfLabel,
    street: dictionary.checkoutStreetLabel,
    number: dictionary.checkoutNumberLabel,
    district: dictionary.checkoutDistrictLabel,
    city: dictionary.checkoutCityLabel,
    stateUf: dictionary.checkoutStateUfLabel,
    postalCode: dictionary.checkoutPostalCodeLabel,
  };
  const inputMode = name === "cpf" || name === "postalCode" ? "numeric" : undefined;
  return (
    <Field data-invalid={errors[name] ? true : undefined}>
      <FieldLabel htmlFor={`checkout-${name}`}>{label[name]}</FieldLabel>
      <Input aria-invalid={errors[name] ? true : undefined} autoComplete={autoComplete} id={`checkout-${name}`} inputMode={inputMode} name={name} onChange={(event) => onChange(event.target.value)} required={required} type={type} value={value} />
      {errors[name] ? <FieldError>{errors[name]}</FieldError> : null}
    </Field>
  );
}

export function PublicCheckoutForm({ dictionary, identifier, merchantIdentity, policy, product }: Readonly<{ dictionary: Dictionary; identifier: string; merchantIdentity?: ReactNode; policy: CheckoutDataPolicy; product: { title: string; description: string; price: string } }>) {
  const experience = useCheckoutExperience<PaymentLinkOrderState>({
    dictionary,
    identifier,
    parsePayment,
    policy,
    terminalStates: V1_TERMINAL_STATES,
    total: product.price,
  });
  const { checkoutError, errors, payment, submit, submitLabel, submitting, unavailable, updateField, values } = experience;
  const required = requiredCheckoutFields(policy);

  const field = (name: CheckoutFieldName, type = "text", autoComplete?: string) => (
    <CheckoutField autoComplete={autoComplete} dictionary={dictionary} errors={errors} name={name} onChange={(value) => updateField(name, value)} required={required.includes(name)} type={type} value={values[name]} />
  );

  if (payment) {
    return (
      <Card className="w-full">
        <CardContent className="grid gap-6">
          {unavailable ? (
            <Alert variant="warning">
              <AlertTitle>{dictionary.checkoutUnavailableHeading}</AlertTitle>
              <AlertDescription>{dictionary.checkoutUnavailableDescription}</AlertDescription>
            </Alert>
          ) : (
            <CheckoutPaymentView
              dictionary={dictionary}
              merchantIdentity={merchantIdentity}
              merchantName={product.title}
              onRetryPoll={experience.retryPoll}
              onStartOver={experience.startOver}
              pixCopyPaste={payment.pixCopyPaste}
              pixQrCodeUrl={payment.pixQrCodeUrl}
              pollFailed={experience.pollFailed}
              state={payment.state}
              total={product.price}
            />
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="w-full">
        <CardHeader>
          <CardTitle>{dictionary.checkoutSummaryHeading}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6">
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold leading-7">{product.title}</h2>
            <p className="m-0 max-w-[var(--layout-max)] whitespace-pre-wrap text-muted-foreground">{product.description}</p>
          </div>
          <Separator />
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-semibold">{dictionary.checkoutTotalLabel}</span>
            <MoneyText size="large" value={product.price} />
          </div>
        </CardContent>
      </Card>

      <Card className="w-full">
        <CardHeader>
          <CardTitle>{dictionary.checkoutCustomerHeading}</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-6" noValidate onSubmit={submit}>
            <FieldGroup>
              {required.length === 0 ? <Alert role="status"><AlertDescription>{dictionary.checkoutNoCustomerData}</AlertDescription></Alert> : null}
              {required.includes("name") ? field("name", "text", "name") : null}
              {required.includes("email") ? field("email", "email", "email") : null}
              {required.includes("cpf") ? field("cpf", "text", "off") : null}
              {policy === "NAME_EMAIL_CPF_ADDRESS" ? (
                <FieldSet>
                  <FieldLegend>{dictionary.checkoutAddressLegend}</FieldLegend>
                  <FieldGroup>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
                      {field("street", "text", "street-address")}
                      {field("number")}
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {field("district")}
                      {field("city", "text", "address-level2")}
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Field data-invalid={errors.stateUf ? true : undefined}>
                        <FieldLabel htmlFor="checkout-stateUf">{dictionary.checkoutStateUfLabel}</FieldLabel>
                        <NativeSelect aria-invalid={errors.stateUf ? true : undefined} id="checkout-stateUf" name="stateUf" onChange={(event) => updateField("stateUf", event.target.value)} required value={values.stateUf}>
                          <NativeSelectOption value="">{dictionary.checkoutStateUfPlaceholder}</NativeSelectOption>
                          {BRAZILIAN_UFS.map((uf) => <NativeSelectOption key={uf} value={uf}>{uf}</NativeSelectOption>)}
                        </NativeSelect>
                        {errors.stateUf ? <FieldError>{errors.stateUf}</FieldError> : null}
                      </Field>
                      {field("postalCode", "text", "postal-code")}
                    </div>
                    <Field>
                      <FieldLabel htmlFor="checkout-complement">{dictionary.checkoutComplementLabel}</FieldLabel>
                      <Input autoComplete="address-line2" id="checkout-complement" name="complement" onChange={(event) => updateField("complement", event.target.value)} value={values.complement} />
                    </Field>
                  </FieldGroup>
                </FieldSet>
              ) : null}
              {checkoutError ? (
                <Alert variant="destructive">
                  <AlertTitle>{dictionary.checkoutErrorHeading}</AlertTitle>
                  <AlertDescription>{dictionary.checkoutErrorDescription}</AlertDescription>
                </Alert>
              ) : null}
              {unavailable ? (
                <Alert variant="warning">
                  <AlertTitle>{dictionary.checkoutUnavailableHeading}</AlertTitle>
                  <AlertDescription>{dictionary.checkoutUnavailableDescription}</AlertDescription>
                </Alert>
              ) : null}
              <Button aria-busy={submitting || undefined} disabled={submitting || unavailable} size="lg" type="submit">
                {submitting ? <Spinner data-icon="inline-start" /> : null}
                {submitting ? dictionary.checkoutSubmitting : submitLabel}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
