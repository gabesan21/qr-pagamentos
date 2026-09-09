// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { en as dictionary } from "@/i18n/dictionaries/en";

import { PublicCheckoutForm } from "./public-checkout-form";

const identifier = "AbCdEfGhIjKlMnOpQrStUvWx";
// The V1 form always resolves a total from `product.price`, so the submit
// label is the exact-total button, never the generic `checkoutSubmit`.
const submitLabel = dictionary.checkoutPayWithTotal.replace("{total}", "12.50");

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

describe("checkout experience state machine (public-checkout-form era)", () => {
  it("keeps typing free of side effects: field edits never touch attempt, payment or capability", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<PublicCheckoutForm dictionary={dictionary} identifier={identifier} policy="NAME_EMAIL" product={{ title: "Donation", description: "Support the project.", price: "12.50" }} />);

    fillMinimalForm();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(submitLabel)).not.toBeNull();
  });

  it("submits one attempt, moves the form to the payment phase, and mints a single idempotency key across a retried submit", async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      if (String(input).endsWith("/checkout")) return jsonResponse({ payment: { state: "CREATED" }, statusCapability: "capability-1" });
      return jsonResponse({ payment: { state: "CREATED" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<PublicCheckoutForm dictionary={dictionary} identifier={identifier} policy="NAME_EMAIL" product={{ title: "Donation", description: "Support the project.", price: "12.50" }} />);

    fillMinimalForm();
    fireEvent.click(screen.getByText(submitLabel));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [, firstInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const firstKey = (JSON.parse(String(firstInit.body)) as { idempotencyKey: string }).idempotencyKey;
    expect(typeof firstKey).toBe("string");
    expect(firstKey.length).toBeGreaterThan(0);

    await waitFor(() => expect(screen.queryByText(submitLabel)).toBeNull());
  });

  it("resets to the form and re-keys the idempotency key only on explicit start-over, never on a poll or checkout failure alone", async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      if (String(input).endsWith("/checkout")) return jsonResponse({}, 404);
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<PublicCheckoutForm dictionary={dictionary} identifier={identifier} policy="NAME_EMAIL" product={{ title: "Donation", description: "Support the project.", price: "12.50" }} />);

    fillMinimalForm();
    fireEvent.click(screen.getByText(submitLabel));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    // A 404 checkout response sets `unavailable`, but the controller has no
    // payment yet, so the form (not the payment-phase Alert) still renders —
    // start-over is not required to try again, and the field values survive.
    expect((screen.getByLabelText(dictionary.checkoutNameLabel) as HTMLInputElement).value).toBe("Ana Buyer");
  });

  it("renders the unavailable warning inside the payment phase, reachable after the status poll returns 404 (C03.b)", async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      if (String(input).endsWith("/checkout")) return jsonResponse({ payment: { state: "CREATED" }, statusCapability: "capability-1" });
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<PublicCheckoutForm dictionary={dictionary} identifier={identifier} policy="NAME_EMAIL" product={{ title: "Donation", description: "Support the project.", price: "12.50" }} />);

    fillMinimalForm();
    fireEvent.click(screen.getByText(submitLabel));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    expect(await screen.findByText(dictionary.checkoutUnavailableHeading)).not.toBeNull();
  });
});
