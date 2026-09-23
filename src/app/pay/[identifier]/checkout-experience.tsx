"use client";

import { useEffect, useRef, useState } from "react";

import type { getDictionary } from "@/i18n/dictionaries";
import type { CheckoutDataPolicy, CustomerSnapshotV1 } from "@/orders/order-v2-policies";

import { isValidCpfFormat, isValidEmailFormat, isValidPostalCodeFormat, maskCpf, maskPostalCode } from "./checkout-form-validation";
import { createPollingController } from "./public-checkout-form";

type Dictionary = ReturnType<typeof getDictionary>;

export type CheckoutFieldName = "name" | "email" | "cpf" | "street" | "number" | "district" | "city" | "stateUf" | "postalCode";
export type CheckoutFormValues = Record<CheckoutFieldName | "complement", string>;
export type CheckoutAttempt = Readonly<{ idempotencyKey: string; customer: CustomerSnapshotV1 }>;
export type CheckoutPayment<S extends string> = Readonly<{ state: S; pixCopyPaste?: string; pixQrCodeUrl?: string }>;
export type CheckoutExperiencePhase = "form" | "submitting" | "payment" | "terminal";

const ADDRESS_FIELDS: readonly CheckoutFieldName[] = ["street", "number", "district", "city", "stateUf", "postalCode"];
export const CHECKOUT_INITIAL_VALUES: CheckoutFormValues = { name: "", email: "", cpf: "", street: "", number: "", district: "", city: "", stateUf: "", postalCode: "", complement: "" };
export const BRAZILIAN_UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"] as const;

// Field order defines the scroll-and-focus target on an invalid submit
// (14.6.1 F03, C04): the first field in reading order that failed either the
// required-field or the format check.
const FIELD_ORDER: readonly CheckoutFieldName[] = ["name", "email", "cpf", "street", "number", "district", "city", "stateUf", "postalCode"];

export function requiredCheckoutFields(policy: CheckoutDataPolicy): readonly CheckoutFieldName[] {
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

function customerSnapshot(policy: CheckoutDataPolicy, values: CheckoutFormValues): CustomerSnapshotV1 {
  const address = policy === "NAME_EMAIL_CPF_ADDRESS"
    ? { street: values.street, number: values.number, district: values.district, city: values.city, stateUf: values.stateUf, postalCode: values.postalCode, country: "BR" as const, complement: values.complement || null }
    : null;
  return {
    name: policy === "NAME_EMAIL" || policy === "NAME_EMAIL_CPF" || policy === "NAME_EMAIL_CPF_ADDRESS" ? values.name : null,
    email: policy === "NAME_EMAIL" || policy === "EMAIL" || policy === "NAME_EMAIL_CPF" || policy === "NAME_EMAIL_CPF_ADDRESS" ? values.email : null,
    cpf: policy === "NAME_EMAIL_CPF" || policy === "NAME_EMAIL_CPF_ADDRESS" ? values.cpf : null,
    address,
  };
}

function fieldErrors(dictionary: Dictionary, policy: CheckoutDataPolicy, values: CheckoutFormValues): Partial<Record<CheckoutFieldName, string>> {
  const errors: Partial<Record<CheckoutFieldName, string>> = {};
  for (const name of requiredCheckoutFields(policy)) {
    const value = values[name].trim();
    if (!value) { errors[name] = dictionary.checkoutValidationError; continue; }
    if (name === "email" && !isValidEmailFormat(value)) errors.email = dictionary.checkoutEmailFormatError;
    else if (name === "cpf" && !isValidCpfFormat(value)) errors.cpf = dictionary.checkoutCpfFormatError;
    else if (name === "postalCode" && !isValidPostalCodeFormat(value)) errors.postalCode = dictionary.checkoutCepFormatError;
  }
  return errors;
}

// Reduced motion still wins over the CSS `scroll-behavior` collapse: a JS
// `scrollIntoView({ behavior: "smooth" })` overrides the computed value, so
// the gate lives here. `matchMedia` is absent in some test environments —
// feature-detected and treated as "no preference" rather than thrown.
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function focusFirstInvalid(errors: Partial<Record<CheckoutFieldName, string>>) {
  const target = FIELD_ORDER.find((name) => errors[name]);
  if (!target) return;
  const element = document.getElementById(`checkout-${target}`);
  if (!(element instanceof HTMLElement)) return;
  element.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
  element.focus({ preventScroll: true });
}

export type UseCheckoutExperienceConfig<S extends string> = Readonly<{
  currencyLabel?: string;
  dictionary: Dictionary;
  identifier: string;
  parsePayment: (value: unknown) => CheckoutPayment<S> | null;
  policy: CheckoutDataPolicy;
  terminalStates: ReadonlySet<S>;
  total?: string;
}>;

export type CheckoutExperience<S extends string> = Readonly<{
  attempt: CheckoutAttempt | null;
  checkoutError: boolean;
  errors: Partial<Record<CheckoutFieldName, string>>;
  payment: CheckoutPayment<S> | null;
  phase: CheckoutExperiencePhase;
  startOver: () => void;
  statusReadFailed: boolean;
  submit: (event: React.FormEvent<HTMLFormElement>) => void;
  submitLabel: string;
  submitting: boolean;
  unavailable: boolean;
  updateField: (field: keyof CheckoutFormValues, value: string) => void;
  values: CheckoutFormValues;
}>;

/**
 * Shared client controller for `/pay/[identifier]` (14.6.1 F03): one buyer
 * attempt survives typing and a failed request, the form yields to the
 * payment/outcome view the moment a payment is issued, and start-over is the
 * only path back — it alone re-keys the idempotency key. `PublicCheckoutV2Form`
 * is a thin adapter that supplies its own state union, response parser and
 * terminal-state set (must not share a loose union that accepts a state its
 * era cannot return).
 */
export function useCheckoutExperience<S extends string>(config: UseCheckoutExperienceConfig<S>): CheckoutExperience<S> {
  const { currencyLabel, dictionary, identifier, parsePayment, policy, terminalStates, total } = config;
  const [values, setValues] = useState<CheckoutFormValues>(CHECKOUT_INITIAL_VALUES);
  const [errors, setErrors] = useState<Partial<Record<CheckoutFieldName, string>>>({});
  const [attempt, setAttempt] = useState<CheckoutAttempt | null>(null);
  const [payment, setPayment] = useState<CheckoutPayment<S> | null>(null);
  const [capability, setCapability] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [checkoutError, setCheckoutError] = useState(false);
  const [statusReadFailed, setStatusReadFailed] = useState(false);
  const terminalRef = useRef(false);

  useEffect(() => {
    if (!capability || terminalRef.current) return;
    const polling = createPollingController(document, async ({ signal, isCurrent, schedule }) => {
      try {
        const response = await fetch(`/api/payment-links/${identifier}/checkout/status`, { method: "POST", cache: "no-store", credentials: "omit", headers: { "content-type": "application/json" }, body: JSON.stringify({ statusCapability: capability }), signal });
        if (!isCurrent()) return;
        if (response.status === 404) { setUnavailable(true); return; }
        if (!response.ok) throw new Error("status-read-failed");
        const body: unknown = await response.json();
        if (!isCurrent()) return;
        const next = body && typeof body === "object" && "payment" in body ? parsePayment((body as { payment?: unknown }).payment) : null;
        if (!next) throw new Error("status-read-failed");
        setPayment(next);
        terminalRef.current = terminalStates.has(next.state);
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
  }, [capability, identifier, parsePayment, terminalStates]);

  const updateField = (field: keyof CheckoutFormValues, rawValue: string) => {
    const value = field === "cpf" ? maskCpf(rawValue) : field === "postalCode" ? maskPostalCode(rawValue) : rawValue;
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!(field in current)) return current;
      const next = { ...current };
      delete next[field as CheckoutFieldName];
      return next;
    });
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = fieldErrors(dictionary, policy, values);
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      focusFirstInvalid(nextErrors);
      return;
    }
    setErrors({});
    // Every submit mints a fresh idempotency key (no reused attempt): a
    // failed submit renders the named submit-failure state and the only way
    // back is `startOver`, which re-keys the next attempt anyway.
    const currentAttempt = { idempotencyKey: createRetryKey(), customer: customerSnapshot(policy, values) };
    setAttempt(currentAttempt);
    setSubmitting(true);
    setCheckoutError(false);
    setUnavailable(false);
    void (async () => {
      try {
        const response = await fetch(`/api/payment-links/${identifier}/checkout`, { method: "POST", cache: "no-store", credentials: "omit", headers: { "content-type": "application/json" }, body: JSON.stringify(currentAttempt) });
        if (response.status === 404) { setUnavailable(true); return; }
        if (!response.ok) { setCheckoutError(true); return; }
        const body: unknown = await response.json();
        const accepted = body && typeof body === "object" && "payment" in body && "statusCapability" in body
          ? { payment: parsePayment((body as { payment?: unknown }).payment), statusCapability: (body as { statusCapability?: unknown }).statusCapability }
          : null;
        if (!accepted?.payment || typeof accepted.statusCapability !== "string") { setCheckoutError(true); return; }
        terminalRef.current = terminalStates.has(accepted.payment.state);
        setPayment(accepted.payment);
        setCapability(accepted.statusCapability);
      } catch {
        setCheckoutError(true);
      } finally {
        setSubmitting(false);
      }
    })();
  };

  // The only reset (C03): clears attempt, payment and capability and returns
  // to the form; the next submit mints a fresh idempotency key because
  // `attempt` is null again. Also clears the failed-status-read flag.
  const startOver = () => {
    terminalRef.current = false;
    setValues(CHECKOUT_INITIAL_VALUES);
    setErrors({});
    setAttempt(null);
    setPayment(null);
    setCapability(null);
    setSubmitting(false);
    setUnavailable(false);
    setCheckoutError(false);
    setStatusReadFailed(false);
  };

  const isTerminal = payment ? terminalStates.has(payment.state) : false;
  const phase: CheckoutExperiencePhase = payment ? (isTerminal ? "terminal" : "payment") : (submitting ? "submitting" : "form");
  const submitLabel = total
    ? dictionary.checkoutPayWithTotal.replace("{total}", currencyLabel ? `${total} ${currencyLabel}` : total)
    : dictionary.checkoutSubmit;

  return { attempt, checkoutError, errors, payment, phase, startOver, statusReadFailed, submit, submitLabel, submitting, unavailable, updateField, values };
}
