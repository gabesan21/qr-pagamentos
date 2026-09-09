"use client";

import type { ReactNode } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import type { getDictionary } from "@/i18n/dictionaries";
import type { CheckoutDataPolicy, PaymentLinkOrderState } from "@/orders/payment-link-order";

import { BRAZILIAN_UFS, requiredCheckoutFields, useCheckoutExperience, type CheckoutFieldName, type CheckoutPayment } from "./checkout-experience";
import { CHECKOUT_PAYMENT_TERMINAL_STATES, CheckoutPaymentView } from "./checkout-payment-views";

type Dictionary = ReturnType<typeof getDictionary>;
// The submit response carries attempt states (RESERVED/CREATING/PENDING/
// INDETERMINATE); polling carries the V1 order-state vocabulary. The closed
// client set is exactly that union.
export type CheckoutV2PaymentState = "RESERVED" | "CREATING" | PaymentLinkOrderState;

const V2_PAYMENT_STATES = new Set<CheckoutV2PaymentState>(["RESERVED", "CREATING", "CREATED", "PENDING", "INDETERMINATE", "CONFIRMED", "REJECTED", "CANCELLED", "EXPIRED", "REFUNDED"]);

export function paymentFromResponse(value: unknown): CheckoutPayment<CheckoutV2PaymentState> | null {
  if (!value || typeof value !== "object" || !("state" in value)) return null;
  const payment = value as { state?: unknown; pixCopyPaste?: unknown; pixQrCodeUrl?: unknown };
  if (typeof payment.state !== "string" || !V2_PAYMENT_STATES.has(payment.state as CheckoutV2PaymentState)) return null;
  if (payment.pixCopyPaste !== undefined && typeof payment.pixCopyPaste !== "string") return null;
  if (payment.pixQrCodeUrl !== undefined && typeof payment.pixQrCodeUrl !== "string") return null;
  return { state: payment.state as CheckoutV2PaymentState, ...(payment.pixCopyPaste ? { pixCopyPaste: payment.pixCopyPaste } : {}), ...(payment.pixQrCodeUrl ? { pixQrCodeUrl: payment.pixQrCodeUrl } : {}) };
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

// `total`/`currencyLabel` are optional: when absent the submit button falls
// back to the era's generic label, exactly as before.
export function PublicCheckoutV2Form({ currencyLabel, dictionary, identifier, merchantIdentity, policy, total }: Readonly<{ currencyLabel?: string; dictionary: Dictionary; identifier: string; merchantIdentity?: ReactNode; policy: CheckoutDataPolicy; total?: string }>) {
  const experience = useCheckoutExperience<CheckoutV2PaymentState>({
    currencyLabel,
    dictionary,
    identifier,
    parsePayment: paymentFromResponse,
    policy,
    terminalStates: CHECKOUT_PAYMENT_TERMINAL_STATES,
    total,
  });
  const { checkoutError, errors, payment, submit, submitLabel, submitting, unavailable, updateField, values } = experience;
  const required = requiredCheckoutFields(policy);

  const field = (name: CheckoutFieldName, type = "text", autoComplete?: string) => (
    <CheckoutField autoComplete={autoComplete} dictionary={dictionary} errors={errors} name={name} onChange={(value) => updateField(name, value)} required={required.includes(name)} type={type} value={values[name]} />
  );

  if (payment) {
    return (
      <div className="grid gap-6">
        {unavailable ? (
          <Alert variant="warning">
            <AlertTitle>{dictionary.checkoutUnavailableHeading}</AlertTitle>
            <AlertDescription>{dictionary.checkoutUnavailableDescription}</AlertDescription>
          </Alert>
        ) : (
          <CheckoutPaymentView
            currencyLabel={currencyLabel}
            dictionary={dictionary}
            merchantIdentity={merchantIdentity}
            merchantName={dictionary.storefrontFallbackName}
            onRetryPoll={experience.retryPoll}
            onStartOver={experience.startOver}
            pixCopyPaste={payment.pixCopyPaste}
            pixQrCodeUrl={payment.pixQrCodeUrl}
            pollFailed={experience.pollFailed}
            state={payment.state}
            total={total ?? ""}
          />
        )}
      </div>
    );
  }

  return (
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
  );
}
