import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getDictionary } from "@/i18n/dictionaries";

function textContent(markup: string): string {
  return markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
import type { CheckoutDataPolicy } from "@/orders/payment-link-order";

import {
  StandalonePaymentExperience,
  StandalonePaymentView,
  standalonePaymentFromResponse,
  type StandaloneFormValues,
  type StandalonePaymentState,
} from "./standalone-payment-experience";

const dictionary = getDictionary("en");
const values: StandaloneFormValues = { name: "", email: "", cpf: "", street: "", number: "", district: "", city: "", stateUf: "", postalCode: "", complement: "" };

function renderView(overrides: Partial<Parameters<typeof StandalonePaymentView>[0]> = {}) {
  return renderToStaticMarkup(
    <StandalonePaymentView
      amount=""
      amountInvalid={false}
      attemptMade={false}
      checkoutError={false}
      copyState={null}
      currencyCode="BRL"
      dictionary={dictionary}
      invalid={new Set()}
      onAmountChange={vi.fn()}
      onCopyPix={vi.fn()}
      onFieldChange={vi.fn()}
      onStatusRetry={vi.fn()}
      onSubmit={vi.fn()}
      payment={null}
      policy="NAME_EMAIL_CPF"
      slug="ana-store"
      statusError={false}
      submittedAmount={null}
      submitting={false}
      unavailable={false}
      values={values}
      {...overrides}
    />,
  );
}

describe("standalone payment view", () => {
  it.each([
    ["NONE", []],
    ["EMAIL", ["email"]],
    ["NAME_EMAIL", ["name", "email"]],
    ["NAME_EMAIL_CPF", ["name", "email", "cpf"]],
    ["NAME_EMAIL_CPF_ADDRESS", ["name", "email", "cpf", "street", "number", "district", "city", "stateUf", "postalCode"]],
  ] as const)("renders exactly the %s policy fields", (policy: CheckoutDataPolicy, fields: readonly string[]) => {
    const markup = renderView({ policy });

    for (const field of ["name", "email", "cpf", "street", "number", "district", "city", "stateUf", "postalCode"]) {
      expect(markup.includes(`standalone-${field}`), `${policy}.${field}`).toBe(fields.includes(field));
    }
    expect(markup).toContain('id="standalone-amount"');
    expect(markup).toContain("Amount (BRL)");
  });

  it("renders the amount validation error inline with aria-invalid", () => {
    const markup = renderView({ amount: "abc", amountInvalid: true });

    expect(markup).toContain("Enter a valid amount greater than zero, with up to six decimal places.");
    expect(markup).toContain('aria-invalid="true"');
  });

  it("renders the customer field validation errors inline", () => {
    const markup = renderView({ invalid: new Set(["name", "cpf"] as const) });

    expect(markup.match(/Complete this required field before continuing\./g)).toHaveLength(2);
  });

  it("marks the submit busy and disabled while submitting", () => {
    const markup = renderView({ submitting: true });

    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain("Preparing payment");
    expect(markup).toContain("disabled");
  });

  it("offers the retry label after a failed attempt and the opaque submit error", () => {
    const markup = renderView({ attemptMade: true, checkoutError: true });

    expect(markup).toContain("Try payment again");
    expect(markup).toContain("Payment could not be prepared");
    expect(markup).toContain('href="/store/ana-store"');
  });

  it.each([
    ["RESERVED", "Preparing payment"],
    ["CREATING", "Preparing payment"],
    ["CREATED", "Preparing payment"],
    ["PENDING", "Waiting for payment"],
    ["INDETERMINATE", "Payment status is being checked"],
  ] as const)("renders %s as the waiting treatment, never an error", (state: StandalonePaymentState, label: string) => {
    const markup = renderView({ payment: { state }, submittedAmount: "12.5" });

    expect(textContent(markup)).toContain(label);
    expect(textContent(markup)).toContain("12.5 BRL");
    expect(markup).not.toContain("bg-destructive");
    expect(textContent(markup)).toContain("Payment details are still being prepared.");
    expect(markup).toContain('href="/store/ana-store"');
  });

  it("renders the QR and copy affordances without the waiting notice when payment data exists", () => {
    const markup = renderView({ payment: { state: "PENDING", pixCopyPaste: "pix-code", pixQrCodeUrl: "https://provider.example/qr.png" }, submittedAmount: "12.5" });

    expect(markup).toContain('src="https://provider.example/qr.png"');
    expect(markup).toContain('alt="PIX payment QR code"');
    expect(textContent(markup)).toContain("pix-code");
    expect(textContent(markup)).toContain("Copy PIX code");
    expect(textContent(markup)).not.toContain("Payment details are still being prepared.");
  });

  it("announces copy feedback politely", () => {
    const success = renderView({ copyState: "success", payment: { state: "PENDING", pixCopyPaste: "pix-code" } });
    expect(success).toContain("PIX code copied.");
    expect(success).toContain('aria-live="polite"');

    const failure = renderView({ copyState: "error", payment: { state: "PENDING", pixCopyPaste: "pix-code" } });
    expect(failure).toContain("The PIX code could not be copied.");
  });

  it("renders the polling status error with the manual retry and the return link", () => {
    const markup = renderView({ payment: { state: "PENDING" }, statusError: true });

    expect(markup).toContain("Payment status could not be refreshed");
    expect(markup).toContain("Check status again");
    expect(markup).toContain('href="/store/ana-store"');
  });

  it.each([
    ["CONFIRMED", "Payment confirmed", false],
    ["REJECTED", "Payment rejected", true],
    ["CANCELLED", "Payment cancelled", true],
    ["EXPIRED", "Payment expired", true],
    ["REFUNDED", "Payment refunded", true],
  ] as const)("renders the terminal %s view with the return link", (state: StandalonePaymentState, label: string, destructive: boolean) => {
    const markup = renderView({ payment: { state }, submittedAmount: "12.5" });

    expect(markup).toContain(label);
    expect(markup.includes("bg-danger-soft text-danger")).toBe(destructive);
    expect(markup).not.toContain("bg-destructive");
    expect(markup).not.toContain("Payment details are still being prepared.");
    expect(markup).toContain('href="/store/ana-store"');
  });

  it("renders the one opaque unavailable view with only the return affordance", () => {
    const markup = renderView({ unavailable: true });

    expect(markup).toContain("This storefront is unavailable");
    expect(markup).not.toContain('id="standalone-amount"');
    expect(markup).not.toContain("<form");
    expect(markup).toContain('href="/store/ana-store"');
    expect(markup).toContain("Back to the store");
  });
});

describe("standalonePaymentFromResponse", () => {
  it.each(["RESERVED", "CREATING", "CREATED", "PENDING", "INDETERMINATE", "CONFIRMED", "REJECTED", "CANCELLED", "EXPIRED", "REFUNDED"] as const)("accepts the pinned %s state", (state: StandalonePaymentState) => {
    expect(standalonePaymentFromResponse({ state })).toEqual({ state });
  });

  it("keeps only string payment data members", () => {
    expect(standalonePaymentFromResponse({ state: "PENDING", pixCopyPaste: "code", pixQrCodeUrl: "https://provider.example/qr.png" }))
      .toEqual({ state: "PENDING", pixCopyPaste: "code", pixQrCodeUrl: "https://provider.example/qr.png" });
    expect(standalonePaymentFromResponse({ state: "PENDING", pixCopyPaste: 42 })).toBeNull();
  });

  it("rejects unknown states, foreign payloads, and non-objects", () => {
    expect(standalonePaymentFromResponse({ state: "SETTLED" })).toBeNull();
    expect(standalonePaymentFromResponse({})).toBeNull();
    expect(standalonePaymentFromResponse(null)).toBeNull();
    expect(standalonePaymentFromResponse("PENDING")).toBeNull();
  });
});

describe("standalone payment experience", () => {
  it("prefills only a grammatically valid amount", () => {
    const valid = renderToStaticMarkup(<StandalonePaymentExperience currencyCode="BRL" dictionary={dictionary} policy="NONE" prefillAmount="12.5" slug="ana-store" />);
    expect(valid).toContain('value="12.5"');

    const invalid = renderToStaticMarkup(<StandalonePaymentExperience currencyCode="BRL" dictionary={dictionary} policy="NONE" prefillAmount="0" slug="ana-store" />);
    expect(invalid).not.toContain('value="0"');
    expect(invalid).toContain('id="standalone-amount"');

    const absent = renderToStaticMarkup(<StandalonePaymentExperience currencyCode="BRL" dictionary={dictionary} policy="NONE" prefillAmount={null} slug="ana-store" />);
    expect(absent).toContain('id="standalone-amount"');
  });
});
