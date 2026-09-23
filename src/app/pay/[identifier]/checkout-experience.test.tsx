// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { en as dictionary } from "@/i18n/dictionaries/en";

import { PublicCheckoutV2Form } from "./public-checkout-v2-form";

const identifier = "AbCdEfGhIjKlMnOpQrStUvWx";
const submitLabel = dictionary.checkoutSubmit;

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}

function fillMinimalForm() {
  fireEvent.change(screen.getByLabelText(dictionary.checkoutNameLabel), { target: { value: "Ana Buyer" } });
  fireEvent.change(screen.getByLabelText(dictionary.checkoutEmailLabel), { target: { value: "ana@example.com" } });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("checkout experience state machine (public-checkout-v2-form adapter)", () => {
  it("keeps typing free of side effects: field edits never touch attempt, payment or capability", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<PublicCheckoutV2Form dictionary={dictionary} identifier={identifier} policy="NAME_EMAIL" />);

    fillMinimalForm();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(submitLabel)).not.toBeNull();
  });

  it("submits one attempt and moves the form to the payment phase", async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      if (String(input).endsWith("/checkout")) return jsonResponse({ payment: { state: "CREATED" }, statusCapability: "capability-1" });
      return jsonResponse({ payment: { state: "CREATED" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<PublicCheckoutV2Form dictionary={dictionary} identifier={identifier} policy="NAME_EMAIL" />);

    fillMinimalForm();
    fireEvent.click(screen.getByText(submitLabel));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [, firstInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const firstKey = (JSON.parse(String(firstInit.body)) as { idempotencyKey: string }).idempotencyKey;
    expect(typeof firstKey).toBe("string");
    expect(firstKey.length).toBeGreaterThan(0);

    await waitFor(() => expect(screen.queryByText(submitLabel)).toBeNull());
  });

  it("a non-ok submit renders the named submit-failure state, replacing the form, with Start over as the only action (C06)", async () => {
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse({}, 500));
    vi.stubGlobal("fetch", fetchMock);
    render(<PublicCheckoutV2Form dictionary={dictionary} identifier={identifier} policy="NAME_EMAIL" />);

    fillMinimalForm();
    fireEvent.click(screen.getByText(submitLabel));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    expect(await screen.findByText(dictionary.checkoutSubmitFailureTitle)).not.toBeNull();
    expect(screen.queryByLabelText(dictionary.checkoutNameLabel)).toBeNull();
    expect(screen.getByText(dictionary.checkoutStartOver)).not.toBeNull();
  });

  it("a submit-404 (opaque unavailable) leaves the form in place — distinct from the named submit-failure state", async () => {
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse({}, 404));
    vi.stubGlobal("fetch", fetchMock);
    render(<PublicCheckoutV2Form dictionary={dictionary} identifier={identifier} policy="NAME_EMAIL" />);

    fillMinimalForm();
    fireEvent.click(screen.getByText(submitLabel));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect((screen.getByLabelText(dictionary.checkoutNameLabel) as HTMLInputElement).value).toBe("Ana Buyer");
    expect(await screen.findByText(dictionary.checkoutUnavailableHeading)).not.toBeNull();
  });

  it("clicking start-over after a submit failure returns to a blank form and mints a distinct idempotency key on the next submit (C02, C06)", async () => {
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse({}, 500));
    vi.stubGlobal("fetch", fetchMock);
    render(<PublicCheckoutV2Form dictionary={dictionary} identifier={identifier} policy="NAME_EMAIL" />);

    fillMinimalForm();
    fireEvent.click(screen.getByText(submitLabel));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const firstKey = (JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body)) as { idempotencyKey: string }).idempotencyKey;

    fireEvent.click(await screen.findByText(dictionary.checkoutStartOver));
    expect(await screen.findByText(submitLabel)).not.toBeNull();
    expect((screen.getByLabelText(dictionary.checkoutNameLabel) as HTMLInputElement).value).toBe("");

    fillMinimalForm();
    fireEvent.click(screen.getByText(submitLabel));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const secondKey = (JSON.parse(String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body)) as { idempotencyKey: string }).idempotencyKey;
    expect(secondKey).not.toBe(firstKey);
  });

  it("a failed status read stops the loop and renders the named status-unavailable state, no reschedule (C01, C02)", async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      if (String(input).endsWith("/checkout")) return jsonResponse({ payment: { state: "CREATED" }, statusCapability: "capability-1" });
      return jsonResponse({}, 500);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<PublicCheckoutV2Form dictionary={dictionary} identifier={identifier} policy="NAME_EMAIL" />);

    fillMinimalForm();
    fireEvent.click(screen.getByText(submitLabel));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    expect(await screen.findByText(dictionary.checkoutStatusUnavailableTitle)).not.toBeNull();
    expect(screen.getByText(dictionary.checkoutStartOver)).not.toBeNull();
  });

  it("marks CPF and postal code inputs with the numeric inputMode (C02)", () => {
    render(<PublicCheckoutV2Form dictionary={dictionary} identifier={identifier} policy="NAME_EMAIL_CPF_ADDRESS" />);
    expect(screen.getByLabelText(dictionary.checkoutCpfLabel).getAttribute("inputmode")).toBe("numeric");
    expect(screen.getByLabelText(dictionary.checkoutPostalCodeLabel).getAttribute("inputmode")).toBe("numeric");
    expect(screen.getByLabelText(dictionary.checkoutNameLabel).getAttribute("inputmode")).toBeNull();
  });

  it("focuses the first invalid field, in field order, on an invalid submit (C02)", () => {
    // jsdom has no layout engine, so `Element.scrollIntoView` does not exist.
    Element.prototype.scrollIntoView = vi.fn();
    render(<PublicCheckoutV2Form dictionary={dictionary} identifier={identifier} policy="NAME_EMAIL_CPF" />);
    // Only `email` is filled — `name` (first in field order) and `cpf` fail.
    fireEvent.change(screen.getByLabelText(dictionary.checkoutEmailLabel), { target: { value: "ana@example.com" } });
    fireEvent.click(screen.getByText(submitLabel));

    expect(document.activeElement).toBe(screen.getByLabelText(dictionary.checkoutNameLabel));
  });

  it("never emits a retired checkout-card/-form/-payment/-description class once the form yields to the payment phase (C03.c)", async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      if (String(input).endsWith("/checkout")) return jsonResponse({ payment: { state: "CREATED", pixCopyPaste: "pix-payload" }, statusCapability: "capability-1" });
      return jsonResponse({ payment: { state: "CREATED", pixCopyPaste: "pix-payload" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<PublicCheckoutV2Form dictionary={dictionary} identifier={identifier} policy="NAME_EMAIL" />);

    fillMinimalForm();
    fireEvent.click(screen.getByText(submitLabel));
    await waitFor(() => expect(screen.queryByText(submitLabel)).toBeNull());

    expect(container.innerHTML).not.toMatch(/\bcheckout-(card|form|payment|description)\b/);
  });

  it("renders the unavailable warning inside the payment phase, reachable after the status poll returns 404 (C03.b)", async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      if (String(input).endsWith("/checkout")) return jsonResponse({ payment: { state: "CREATED" }, statusCapability: "capability-1" });
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<PublicCheckoutV2Form dictionary={dictionary} identifier={identifier} policy="NAME_EMAIL" />);

    fillMinimalForm();
    fireEvent.click(screen.getByText(submitLabel));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    expect(await screen.findByText(dictionary.checkoutUnavailableHeading)).not.toBeNull();
  });
});
