// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { en as dictionary } from "@/i18n/dictionaries/en";

import { CheckoutPaymentView, type CheckoutPaymentViewState } from "./checkout-payment-views";

function render(state: CheckoutPaymentViewState, overrides: Partial<Parameters<typeof CheckoutPaymentView>[0]> = {}) {
  return renderToStaticMarkup(
    <CheckoutPaymentView
      dictionary={dictionary}
      merchantName="Ana's Shop"
      onRetryPoll={vi.fn()}
      onStartOver={vi.fn()}
      state={state}
      total="12.50"
      {...overrides}
    />,
  );
}

describe("checkout payment view", () => {
  it("renders exactly eight distinct outcome compositions — RESERVED/CREATING/CREATED share one live shell — with the confirmed total and the refunded neutral badge", () => {
    const states: readonly CheckoutPaymentViewState[] = [
      "CANCELLED", "CONFIRMED", "CREATED", "CREATING", "EXPIRED", "INDETERMINATE", "PENDING", "REFUNDED", "REJECTED", "RESERVED",
    ];
    const renders = new Map(states.map((state) => [state, render(state)]));
    // RESERVED, CREATING and CREATED all project to the same "created"
    // provider state and the same live shell, so they render identically —
    // the closed vocabulary still exposes exactly eight distinct views.
    expect(new Set(renders.values()).size).toBe(8);
    expect(renders.get("RESERVED")).toBe(renders.get("CREATING"));
    expect(renders.get("CREATING")).toBe(renders.get("CREATED"));

    expect(renders.get("CONFIRMED")).toContain(dictionary.checkoutOutcomeConfirmedTitle);
    expect(renders.get("CONFIRMED")).toContain("12.50");

    const refunded = renders.get("REFUNDED")!;
    expect(refunded).toContain(dictionary.checkoutOutcomeRefundedTitle);
    expect(refunded).not.toContain("text-destructive");
    expect(refunded).not.toContain(dictionary.checkoutStartOver);

    for (const state of ["CANCELLED", "EXPIRED", "REJECTED"] as const) {
      expect(renders.get(state)).toContain(dictionary.checkoutStartOver);
    }

    for (const state of ["RESERVED", "CREATING", "CREATED", "PENDING", "INDETERMINATE"] as const) {
      expect(renders.get(state)).toContain(dictionary.checkoutAmountDueLabel);
    }
    expect(renders.get("INDETERMINATE")).toContain(dictionary.checkoutConfirmingWithBank);
  });

  it("renders the poll-error banner with retry only when a poll has failed, on a live state", () => {
    const clean = render("CREATED", { pixCopyPaste: "pix-payload" });
    expect(clean).not.toContain(dictionary.checkoutPollErrorBanner);

    const failed = render("CREATED", { pixCopyPaste: "pix-payload", pollFailed: true });
    expect(failed).toContain(dictionary.checkoutPollErrorBanner);
    expect(failed).toContain(dictionary.checkoutCheckAgain);
  });

  it("feeds the merchant identity into the QR display's identity slot on the live view (C03.a)", () => {
    const markup = render("CREATED", { merchantIdentity: <span data-testid="merchant-mark">mark</span>, pixCopyPaste: "pix-payload" });
    expect(markup).toContain('data-testid="merchant-mark"');
  });

  it("never emits a retired checkout-* class name in any state (C03.c)", () => {
    for (const state of ["CANCELLED", "CONFIRMED", "CREATED", "CREATING", "EXPIRED", "INDETERMINATE", "PENDING", "REFUNDED", "REJECTED", "RESERVED"] as const) {
      expect(render(state, { pixCopyPaste: "pix-payload" })).not.toMatch(/class="[^"]*\bcheckout-[a-z-]+/);
    }
  });
});
