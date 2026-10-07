import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { act } from "react";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getDictionary } from "@/i18n/dictionaries";

function textContent(markup: string): string {
  return markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
import type { CheckoutDataPolicy } from "@/orders/order-v2-policies";

import {
  StandalonePaymentExperience,
  StandalonePaymentView,
  canonicalStandaloneBrlInput,
  formatStandaloneBrl,
  standalonePaymentFromResponse,
  type StandaloneFormValues,
  type StandalonePaymentState,
} from "./standalone-payment-experience";

type JSDOMWindow = Readonly<{ document: Document; navigator: Navigator; Event: typeof Event }>;
type JSDOMConstructor = new (markup: string, options: Readonly<{ url: string }>) => Readonly<{ window: JSDOMWindow }>;
const localRequire = createRequire(import.meta.url);
const { JSDOM } = localRequire("jsdom") as Readonly<{ JSDOM: JSDOMConstructor }>;
const interactionDom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalActEnvironment = Object.getOwnPropertyDescriptor(globalThis, "IS_REACT_ACT_ENVIRONMENT");
Object.defineProperty(globalThis, "document", { configurable: true, writable: true, value: interactionDom.window.document });
Object.defineProperty(globalThis, "navigator", { configurable: true, writable: true, value: interactionDom.window.navigator });
Object.defineProperty(globalThis, "window", { configurable: true, writable: true, value: interactionDom.window });
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, writable: true, value: true });
const { cleanup, fireEvent, render, waitFor } = localRequire("@testing-library/react") as typeof import("@testing-library/react");

function restoreGlobalDescriptor(name: "document" | "navigator" | "window" | "IS_REACT_ACT_ENVIRONMENT", descriptor: PropertyDescriptor | undefined) {
  if (descriptor) Object.defineProperty(globalThis, name, descriptor);
  else Reflect.deleteProperty(globalThis, name);
}

afterAll(() => {
  restoreGlobalDescriptor("document", originalDocument);
  restoreGlobalDescriptor("navigator", originalNavigator);
  restoreGlobalDescriptor("window", originalWindow);
  restoreGlobalDescriptor("IS_REACT_ACT_ENVIRONMENT", originalActEnvironment);
});

const dictionary = getDictionary("en");
const values: StandaloneFormValues = { name: "", email: "", cpf: "", street: "", number: "", district: "", city: "", stateUf: "", postalCode: "", complement: "" };

function renderView(overrides: Partial<Parameters<typeof StandalonePaymentView>[0]> = {}) {
  return renderToStaticMarkup(
    <StandalonePaymentView
      amount=""
      amountDraft=""
      amountFrozen={false}
      frozenAmountDisplay={null}
      amountInvalid={false}
      checkoutError={false}
      currencyCode="BRL"
      dictionary={dictionary}
      invalid={new Set()}
      onAmountChange={vi.fn()}
      onAmountBlur={vi.fn()}
      onFieldChange={vi.fn()}
      onStartOver={vi.fn()}
      onSubmit={vi.fn()}
      payment={null}
      policy="NAME_EMAIL_CPF"
      slug="ana-store"
      statusReadFailed={false}
      submittedAmount={null}
      submittedAmountDisplay={null}
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
    expect(markup).toContain("Amount");
  });

  it("renders no status notice when the policy needs no customer fields", () => {
    const markup = renderView({ policy: "NONE" });

    expect(markup).not.toContain('role="status"');
    expect(markup).toContain('id="standalone-amount"');
  });

  it("hides collection copy and the local privacy statement for NONE while retaining the frozen amount form", () => {
    const markup = renderView({ amount: "12.5", amountFrozen: true, frozenAmountDisplay: "R$ 12,50", policy: "NONE" });

    expect(markup).toContain("R$ 12,50");
    expect(markup).not.toContain(dictionary.storefrontPayIntroduction);
    expect(markup).not.toContain(dictionary.checkoutPrivacyNotice);
    expect(markup).toContain(dictionary.checkoutSubmit);
  });

  it("renders no status notice when the policy needs customer fields", () => {
    const markup = renderView({ policy: "NAME_EMAIL" });

    expect(markup).not.toContain('role="status"');
    expect(markup).toContain('id="standalone-name"');
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

  it("renders the named submit-failure state with Start over as the only action, no resubmit affordance", () => {
    const markup = renderView({ checkoutError: true });

    expect(markup).toContain("Payment could not be submitted");
    expect(markup).toContain(dictionary.checkoutStartOver);
    expect(markup).not.toContain('id="standalone-amount"');
    expect(markup).not.toContain("<form");
    expect(markup).toContain('href="/store/ana-store"');
  });

  // Payment/outcome phases render through 14.6.1's `CheckoutPaymentView`
  // (14.6.2 F02, C3/C4): no page-local tone map, `QrDisplay`/`CopyField`
  // composition, or terminal markup survives here.
  it.each([
    ["RESERVED", "Preparing payment"],
    ["CREATING", "Preparing payment"],
    ["CREATED", "Preparing payment"],
  ] as const)("renders %s as the honest waiting treatment, never an error", (state: StandalonePaymentState, label: string) => {
    const markup = renderView({ payment: { state }, submittedAmount: "12.5" });

    expect(textContent(markup)).toContain(label);
    expect(textContent(markup)).toContain("R$ 12,50");
    expect(markup).not.toContain("bg-danger-soft");
    expect(markup).toContain('href="/store/ana-store"');
  });

  // PENDING without a payload and INDETERMINATE are named PIX-unavailable
  // states, not the waiting shell (15.3.1 C05/C03): the badge label still
  // carries the provider state, but the amount is not restated and
  // `checkoutStartOver` is the only action — no retry, never a danger tone.
  it.each([
    ["PENDING", "Waiting for payment"],
    ["INDETERMINATE", "Payment status is being checked"],
  ] as const)("names %s as PIX-unavailable, never an error", (state: StandalonePaymentState, label: string) => {
    const markup = renderView({ payment: { state }, submittedAmount: "12.5" });

    expect(textContent(markup)).toContain(label);
    expect(markup).toContain(dictionary.checkoutPixUnavailableTitle);
    expect(markup).toContain(dictionary.checkoutStartOver);
    expect(markup).not.toContain("bg-danger-soft");
    expect(markup).toContain('href="/store/ana-store"');
  });

  it("renders the QR and copy affordances once payment data exists", () => {
    const markup = renderView({ payment: { state: "PENDING", pixCopyPaste: "pix-code", pixQrCodeUrl: undefined }, submittedAmount: "12.5" });

    expect(textContent(markup)).toContain("pix-code");
    expect(textContent(markup)).toContain("Copy PIX code");
  });

  it("renders the named status-unavailable state on a failed status read, Start over as the only action", () => {
    const markup = renderView({ payment: { state: "PENDING" }, statusReadFailed: true });

    expect(markup).toContain(dictionary.checkoutStatusUnavailableTitle);
    expect(markup).toContain(dictionary.checkoutStartOver);
    expect(markup).toContain('href="/store/ana-store"');
  });

  // C3: refunded renders neutral, never the danger tone the other terminal
  // outcomes use — `ProviderStateBadge`'s own domain-tone map, not a
  // page-local one.
  it.each([
    ["CONFIRMED", "Payment confirmed", false],
    ["REJECTED", "Payment rejected", true],
    ["CANCELLED", "Payment cancelled", true],
    ["EXPIRED", "Payment expired", true],
    ["REFUNDED", "Payment refunded", false],
  ] as const)("renders the terminal %s view with the return link", (state: StandalonePaymentState, label: string, danger: boolean) => {
    const markup = renderView({ payment: { state }, submittedAmount: "12.5" });

    expect(markup).toContain(label);
    expect(markup.includes("bg-danger-soft")).toBe(danger);
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
  let visibilityDescriptor: PropertyDescriptor | undefined;
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    if (visibilityDescriptor) Object.defineProperty(document, "visibilityState", visibilityDescriptor);
    else Reflect.deleteProperty(document, "visibilityState");
    visibilityDescriptor = undefined;
    vi.unstubAllGlobals();
  });

  function visibleDocument() {
    visibilityDescriptor = Object.getOwnPropertyDescriptor(document, "visibilityState");
    let visibility: DocumentVisibilityState = "visible";
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
    return (next: DocumentVisibilityState) => {
      visibility = next;
      document.dispatchEvent(new interactionDom.window.Event("visibilitychange"));
    };
  }

  it("formats BRL through exact string transformation and keeps non-BRL values unchanged", () => {
    expect(formatStandaloneBrl("1234567.123456")).toBe("R$ 1.234.567,123456");
    expect(formatStandaloneBrl("10")).toBe("R$ 10,00");
    expect(formatStandaloneBrl("12.5")).toBe("R$ 12,50");
    expect(canonicalStandaloneBrlInput("R$ 1.234.567,123456")).toBe("1234567.123456");
    expect(canonicalStandaloneBrlInput("R$ 12,5")).toBe("12.5");
    for (const malformed of ["10.50", "1.2.3", "R$ 12,1234567", "1.23,45"]) {
      expect(canonicalStandaloneBrlInput(malformed)).toBe("");
    }
  });

  it("prefills only a grammatically valid amount", () => {
    const valid = renderToStaticMarkup(<StandalonePaymentExperience currencyCode="BRL" dictionary={dictionary} policy="NONE" prefillAmount="12.5" slug="ana-store" />);
    expect(valid).toContain("R$ 12,50");
    expect(valid).not.toContain('id="standalone-amount"');

    const invalid = renderToStaticMarkup(<StandalonePaymentExperience currencyCode="BRL" dictionary={dictionary} policy="NONE" prefillAmount="0" slug="ana-store" />);
    expect(invalid).not.toContain('value="0"');
    expect(invalid).toContain('id="standalone-amount"');

    const absent = renderToStaticMarkup(<StandalonePaymentExperience currencyCode="BRL" dictionary={dictionary} policy="NONE" prefillAmount={null} slug="ana-store" />);
    expect(absent).toContain('id="standalone-amount"');
  });

  it("keeps a valid legacy amount read-only and idle until the buyer submits", () => {
    const fetchImplementation = vi.fn();
    vi.stubGlobal("fetch", fetchImplementation);

    const view = render(<StandalonePaymentExperience currencyCode="BRL" dictionary={dictionary} policy="NONE" prefillAmount="1234.500001" slug="ana-store" />);

    expect(fetchImplementation).not.toHaveBeenCalled();
    expect(view.queryByLabelText(dictionary.storefrontCustomAmountLabel)).toBeNull();
    expect(view.getByText("R$ 1.234,500001")).toBeTruthy();
    expect(view.getByRole("button", { name: dictionary.checkoutSubmit })).toBeTruthy();
  });

  it("collects policy fields only after freezing the mounted storefront amount and supports editing back", () => {
    const view = render(<StandalonePaymentExperience currencyCode="BRL" dictionary={dictionary} flow="storefront" policy="NAME_EMAIL" prefillAmount={null} slug="ana-store" />);

    fireEvent.change(view.getByLabelText(dictionary.storefrontCustomAmountLabel), { target: { value: "R$ 1.234,500001" } });
    fireEvent.click(view.getByRole("button", { name: dictionary.storefrontStandaloneContinue }));

    expect(view.queryByLabelText(dictionary.storefrontCustomAmountLabel)).toBeNull();
    expect(view.getByText("R$ 1.234,500001")).toBeTruthy();
    expect(view.getByLabelText(dictionary.checkoutNameLabel)).toBeTruthy();
    expect(view.getByLabelText(dictionary.checkoutEmailLabel)).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: dictionary.storefrontEditAmount }));
    expect(view.getByLabelText(dictionary.storefrontCustomAmountLabel)).toBeTruthy();
  });

  it("applies the BRL cents mask while typing and keeps the logical caret at the inserted digit", () => {
    const view = render(<StandalonePaymentExperience currencyCode="BRL" dictionary={dictionary} flow="storefront" policy="NONE" prefillAmount={null} slug="ana-store" />);

    const amount = view.getByLabelText(dictionary.storefrontCustomAmountLabel) as HTMLInputElement;
    for (const key of "1000") fireEvent.keyDown(amount, { key });

    expect(amount.value).toBe("R$ 10,00");
    expect(canonicalStandaloneBrlInput(amount.value)).toBe("10");
    expect(amount.selectionStart).toBe(amount.value.length);
  });

  it("handles replacement, backspace, and delete against masked BRL digits", () => {
    const view = render(<StandalonePaymentExperience currencyCode="BRL" dictionary={dictionary} flow="storefront" policy="NONE" prefillAmount={null} slug="ana-store" />);
    const amount = view.getByLabelText(dictionary.storefrontCustomAmountLabel) as HTMLInputElement;

    for (const key of "12") fireEvent.keyDown(amount, { key });
    expect(amount.value).toBe("R$ 0,12");

    amount.setSelectionRange(0, amount.value.length);
    fireEvent.keyDown(amount, { key: "5" });
    expect(amount.value).toBe("R$ 0,05");

    fireEvent.keyDown(amount, { key: "Backspace" });
    expect(amount.value).toBe("R$ 0,00");
    amount.setSelectionRange(0, amount.value.length);
    fireEvent.keyDown(amount, { key: "Backspace" });
    expect(amount.value).toBe("");

    for (const key of "12") fireEvent.keyDown(amount, { key });
    amount.setSelectionRange(4, 4);
    fireEvent.keyDown(amount, { key: "Delete" });
    expect(amount.value).toBe("R$ 0,02");
  });

  it("keeps cents semantics for incremental input events that do not send keydown", () => {
    const view = render(<StandalonePaymentExperience currencyCode="BRL" dictionary={dictionary} flow="storefront" policy="NONE" prefillAmount={null} slug="ana-store" />);
    const amount = view.getByLabelText(dictionary.storefrontCustomAmountLabel) as HTMLInputElement;

    fireEvent.input(amount, { data: "1", inputType: "insertText", target: { selectionEnd: 1, selectionStart: 1, value: "1" } });
    fireEvent.input(amount, { data: "0", inputType: "insertText", target: { selectionEnd: 8, selectionStart: 8, value: "R$ 0,010" } });
    fireEvent.input(amount, { data: "0", inputType: "insertText", target: { selectionEnd: 8, selectionStart: 8, value: "R$ 0,100" } });
    fireEvent.input(amount, { data: "0", inputType: "insertText", target: { selectionEnd: 8, selectionStart: 8, value: "R$ 1,000" } });

    expect(amount.value).toBe("R$ 10,00");
  });

  it("keeps mobile delete and selection replacement in the cash-mask edit path", () => {
    const view = render(<StandalonePaymentExperience currencyCode="BRL" dictionary={dictionary} flow="storefront" policy="NONE" prefillAmount={null} slug="ana-store" />);
    const amount = view.getByLabelText(dictionary.storefrontCustomAmountLabel) as HTMLInputElement;

    fireEvent.input(amount, { data: "1", inputType: "insertText", target: { selectionEnd: 1, selectionStart: 1, value: "1" } });
    fireEvent.input(amount, { data: "0", inputType: "insertText", target: { selectionEnd: 8, selectionStart: 8, value: "R$ 0,010" } });
    fireEvent.input(amount, { data: "0", inputType: "insertText", target: { selectionEnd: 8, selectionStart: 8, value: "R$ 0,100" } });
    fireEvent.input(amount, { data: "0", inputType: "insertText", target: { selectionEnd: 8, selectionStart: 8, value: "R$ 1,000" } });

    fireEvent.input(amount, { inputType: "deleteContentBackward", target: { selectionEnd: 7, selectionStart: 7, value: "R$ 10,0" } });
    expect(amount.value).toBe("R$ 1,00");

    fireEvent.input(amount, { inputType: "deleteContentForward", target: { selectionEnd: 6, selectionStart: 6, value: "R$ 1,0" } });
    expect(amount.value).toBe("R$ 0,10");

    fireEvent.input(amount, { data: "5", inputType: "insertText", target: { selectionEnd: 1, selectionStart: 1, value: "5" } });
    expect(amount.value).toBe("R$ 0,05");
  });

  it("parses exact localized BRL pastes without rounding and keeps malformed grouping invalid", () => {
    const view = render(<StandalonePaymentExperience currencyCode="BRL" dictionary={dictionary} flow="storefront" policy="NONE" prefillAmount={null} slug="ana-store" />);
    const amount = view.getByLabelText(dictionary.storefrontCustomAmountLabel) as HTMLInputElement;

    fireEvent.paste(amount, { clipboardData: { getData: () => "R$ 1.234,500001" } });
    expect(amount.value).toBe("R$ 1.234,500001");
    expect(canonicalStandaloneBrlInput(amount.value)).toBe("1234.500001");

    fireEvent.paste(amount, { clipboardData: { getData: () => "1.23,45" } });
    fireEvent.click(view.getByRole("button", { name: dictionary.storefrontStandaloneContinue }));

    expect(amount.value).toBe("1.23,45");
    expect(amount.getAttribute("aria-invalid")).toBe("true");
  });

  it("leaves non-BRL amount entry unmasked", () => {
    const view = render(<StandalonePaymentExperience currencyCode="USD" dictionary={dictionary} flow="storefront" policy="NONE" prefillAmount={null} slug="ana-store" />);
    const amount = view.getByLabelText(`${dictionary.storefrontCustomAmountLabel} (USD)`) as HTMLInputElement;

    fireEvent.change(amount, { target: { value: "1000" } });
    expect(amount.value).toBe("1000");
  });

  it.each(["10.50", "1.2.3", "R$ 12,1234567"])("keeps malformed BRL %s visibly invalid instead of submitting a canonical amount", (draft) => {
    const view = render(<StandalonePaymentExperience currencyCode="BRL" dictionary={dictionary} flow="storefront" policy="NONE" prefillAmount={null} slug="ana-store" />);
    const amount = view.getByLabelText(dictionary.storefrontCustomAmountLabel) as HTMLInputElement;

    fireEvent.change(amount, { target: { value: draft } });
    fireEvent.click(view.getByRole("button", { name: dictionary.storefrontStandaloneContinue }));

    expect(amount.value).toBe(draft);
    expect(amount.getAttribute("aria-invalid")).toBe("true");
  });

  it("freezes one NONE attempt synchronously for rapid duplicate submits and renders its named failure", async () => {
    let resolveRequest: (response: Response) => void = () => undefined;
    const fetchImplementation = vi.fn(() => new Promise<Response>((resolve) => { resolveRequest = resolve; }));
    vi.stubGlobal("fetch", fetchImplementation);

    const view = render(<StandalonePaymentExperience currencyCode="BRL" dictionary={dictionary} flow="storefront" policy="NONE" prefillAmount={null} slug="ana-store" />);
    fireEvent.change(view.getByLabelText(dictionary.storefrontCustomAmountLabel), { target: { value: "R$ 12,500001" } });
    const submit = view.getByRole("button", { name: dictionary.storefrontStandaloneContinue });
    fireEvent.click(submit);
    fireEvent.click(submit);

    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    expect(view.queryByRole("button", { name: dictionary.storefrontEditAmount })).toBeNull();
    const [, request] = fetchImplementation.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(request.body))).toMatchObject({ amount: "12.500001", customer: { name: null, email: null, cpf: null, address: null } });
    resolveRequest(new Response(null, { status: 500 }));
    expect(await view.findByText(dictionary.checkoutSubmitFailureTitle)).toBeTruthy();
    expect(view.queryByLabelText(dictionary.storefrontCustomAmountLabel)).toBeNull();
  });

  it("allows NAME_EMAIL amount editing before submit, then removes it during a delayed request and reaches the PIX payment view", async () => {
    let resolveCheckout: (response: Response) => void = () => undefined;
    const fetchImplementation = vi.fn((url: string) => {
      if (url.endsWith("/status")) {
        return Promise.resolve(new Response(JSON.stringify({ payment: { state: "PENDING", pixCopyPaste: "name-email-pix" } }), { status: 200 }));
      }
      return new Promise<Response>((resolve) => { resolveCheckout = resolve; });
    });
    vi.stubGlobal("fetch", fetchImplementation);

    const view = render(<StandalonePaymentExperience currencyCode="BRL" dictionary={dictionary} flow="storefront" policy="NAME_EMAIL" prefillAmount={null} slug="ana-store" />);
    fireEvent.change(view.getByLabelText(dictionary.storefrontCustomAmountLabel), { target: { value: "R$ 12,50" } });
    fireEvent.click(view.getByRole("button", { name: dictionary.storefrontStandaloneContinue }));

    expect(view.getByRole("button", { name: dictionary.storefrontEditAmount })).toBeTruthy();
    fireEvent.change(view.getByLabelText(dictionary.checkoutNameLabel), { target: { value: "Ana" } });
    fireEvent.change(view.getByLabelText(dictionary.checkoutEmailLabel), { target: { value: "ana@example.test" } });
    fireEvent.click(view.getByRole("button", { name: dictionary.checkoutSubmit }));
    expect(view.queryByRole("button", { name: dictionary.storefrontEditAmount })).toBeNull();

    resolveCheckout(new Response(JSON.stringify({ payment: { state: "PENDING", pixCopyPaste: "name-email-pix" }, statusCapability: "capability" }), { status: 201 }));
    expect(await view.findByRole("button", { name: dictionary.checkoutCopyPix })).toBeTruthy();
    await waitFor(() => expect(fetchImplementation).toHaveBeenCalledTimes(2));
    expect(fetchImplementation.mock.calls.map(([url]) => url)).toEqual([
      "/api/store/ana-store/checkout",
      "/api/store/ana-store/checkout/status",
    ]);
    view.unmount();
  });

  it("renders NONE's delayed successful response as awaiting PIX without returning to amount entry or collection copy", async () => {
    let resolveCheckout: (response: Response) => void = () => undefined;
    const fetchImplementation = vi.fn((url: string) => {
      if (url.endsWith("/status")) {
        return Promise.resolve(new Response(JSON.stringify({ payment: { state: "PENDING", pixCopyPaste: "none-pix" } }), { status: 200 }));
      }
      return new Promise<Response>((resolve) => { resolveCheckout = resolve; });
    });
    vi.stubGlobal("fetch", fetchImplementation);

    const view = render(<StandalonePaymentExperience currencyCode="BRL" dictionary={dictionary} flow="storefront" policy="NONE" prefillAmount={null} slug="ana-store" />);
    fireEvent.change(view.getByLabelText(dictionary.storefrontCustomAmountLabel), { target: { value: "R$ 12,50" } });
    fireEvent.click(view.getByRole("button", { name: dictionary.storefrontStandaloneContinue }));
    expect(view.queryByLabelText(dictionary.storefrontCustomAmountLabel)).toBeNull();
    expect(view.queryByText(dictionary.storefrontPayIntroduction)).toBeNull();
    expect(view.queryByText(dictionary.checkoutPrivacyNotice)).toBeNull();

    resolveCheckout(new Response(JSON.stringify({ payment: { state: "PENDING", pixCopyPaste: "none-pix" }, statusCapability: "capability" }), { status: 201 }));
    expect(await view.findByRole("button", { name: dictionary.checkoutCopyPix })).toBeTruthy();
    await waitFor(() => expect(fetchImplementation).toHaveBeenCalledTimes(2));
    expect(view.queryByLabelText(dictionary.storefrontCustomAmountLabel)).toBeNull();
    expect(view.queryByText(dictionary.storefrontPayIntroduction)).toBeNull();
    expect(view.queryByText(dictionary.checkoutPrivacyNotice)).toBeNull();
    expect(fetchImplementation.mock.calls.map(([url]) => url)).toEqual([
      "/api/store/ana-store/checkout",
      "/api/store/ana-store/checkout/status",
    ]);
    view.unmount();
  });
  it("polls a submitted prefilled NONE payment every five seconds until confirmation, then never resumes", async () => {
    const setVisibility = visibleDocument();
    vi.useFakeTimers();
    let reads = 0;
    const fetchMock = vi.fn((url: string) => url.endsWith("/status")
      ? Promise.resolve(new Response(JSON.stringify({ payment: reads++ < 2
        ? { state: "PENDING", pixCopyPaste: "pix-code" }
        : { state: "CONFIRMED" } }), { status: 200 }))
      : Promise.resolve(new Response(JSON.stringify({ payment: { state: "PENDING", pixCopyPaste: "pix-code" }, statusCapability: "same-capability" }), { status: 201 })));
    vi.stubGlobal("fetch", fetchMock);
    const view = render(<StandalonePaymentExperience currencyCode="BRL" dictionary={dictionary} policy="NONE" prefillAmount="12.5" slug="ana-store" />);
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(view.getByRole("button", { name: dictionary.checkoutSubmit }));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(view.getByRole("button", { name: dictionary.checkoutCopyPix })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (let read = 2; read <= 3; read++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
      expect(fetchMock).toHaveBeenCalledTimes(read + 1);
    }
    expect(view.getAllByText(dictionary.checkoutOutcomeConfirmedTitle).length).toBeGreaterThan(0);
    expect(view.queryByRole("button", { name: dictionary.checkoutCopyPix })).toBeNull();
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("/checkout"))).toHaveLength(1);
    await act(async () => { setVisibility("hidden"); setVisibility("visible"); await vi.advanceTimersByTimeAsync(15_000); });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it.each([500, 404])("stops standalone status reads after %i even across visibility changes", async (status) => {
    const setVisibility = visibleDocument();
    vi.useFakeTimers();
    const fetchMock = vi.fn((url: string) => url.endsWith("/status")
      ? Promise.resolve(new Response(null, { status }))
      : Promise.resolve(new Response(JSON.stringify({ payment: { state: "PENDING", pixCopyPaste: "pix-code" }, statusCapability: "same-capability" }), { status: 201 })));
    vi.stubGlobal("fetch", fetchMock);
    const view = render(<StandalonePaymentExperience currencyCode="BRL" dictionary={dictionary} policy="NONE" prefillAmount="12.5" slug="ana-store" />);
    fireEvent.click(view.getByRole("button", { name: dictionary.checkoutSubmit }));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(view.getByText(status === 404 ? dictionary.storefrontUnavailableHeading : dictionary.checkoutStatusUnavailableTitle)).toBeTruthy();
    await act(async () => { setVisibility("hidden"); setVisibility("visible"); await vi.advanceTimersByTimeAsync(15_000); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("/checkout"))).toHaveLength(1);
  });
});

