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
      onStartOver={vi.fn()}
      state={state}
      total="12.50"
      {...overrides}
    />,
  );
}

describe("checkout payment view", () => {
  it("renders exactly eight distinct outcome compositions — RESERVED/CREATING/CREATED share one waiting shell — with the confirmed total and the refunded neutral badge", () => {
    const states: readonly CheckoutPaymentViewState[] = [
      "CANCELLED", "CONFIRMED", "CREATED", "CREATING", "EXPIRED", "INDETERMINATE", "PENDING", "REFUNDED", "REJECTED", "RESERVED",
    ];
    const renders = new Map(states.map((state) => [state, render(state, { pixCopyPaste: "pix-payload" })]));
    // RESERVED, CREATING and CREATED all project to the same "created"
    // provider state and the same waiting shell, so they render
    // identically — the closed vocabulary still exposes exactly eight
    // distinct views (PENDING with a payload renders the QR view; PENDING
    // is otherwise supplied without a payload below).
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

    for (const state of ["RESERVED", "CREATING", "CREATED"] as const) {
      expect(renders.get(state)).toContain(dictionary.checkoutAmountDueLabel);
    }
    expect(renders.get("INDETERMINATE")).toContain(dictionary.checkoutStartOver);
  });

  it("names PENDING without a payload, and INDETERMINATE, as PIX-unavailable — no QR frame, no retry action", () => {
    const noPayload = render("PENDING");
    expect(noPayload).toContain(dictionary.checkoutPixUnavailableTitle);
    expect(noPayload).toContain(dictionary.checkoutStartOver);
    expect(noPayload).not.toMatch(/role="img"/);

    const indeterminate = render("INDETERMINATE", { pixCopyPaste: "pix-payload" });
    expect(indeterminate).toContain(dictionary.checkoutPixUnavailableTitle);
    expect(indeterminate).not.toMatch(/role="img"/);
  });

  it("renders the honest waiting treatment for RESERVED/CREATING/CREATED — aria-busy, no QR frame, no caption promising data", () => {
    for (const state of ["RESERVED", "CREATING", "CREATED"] as const) {
      const markup = render(state, { pixCopyPaste: "pix-payload" });
      expect(markup).toContain('aria-busy="true"');
      expect(markup).not.toMatch(/role="img"/);
      expect(markup).not.toContain(dictionary.checkoutScanCaption);
    }
  });

  it("renders the status-unavailable named state whenever a status read has failed, regardless of the interrupted state", () => {
    const markup = render("CREATED", { pixCopyPaste: "pix-payload", statusReadFailed: true });
    expect(markup).toContain(dictionary.checkoutStatusUnavailableTitle);
    expect(markup).toContain(dictionary.checkoutStartOver);
    expect(markup).not.toMatch(/role="img"/);
  });

  it("renders PENDING with a payload as QR plus copy-paste", () => {
    const markup = render("PENDING", { pixCopyPaste: "pix-payload" });
    expect(markup).toContain(dictionary.checkoutScanCaption);
    expect(markup).toMatch(/role="img"/);
  });

  it("wraps the state badge in exactly one polite live region on the live payment view, never enclosing a role=alert node (C1)", () => {
    for (const state of ["RESERVED", "CREATING", "CREATED"] as const) {
      const markup = render(state, { pixCopyPaste: "pix-payload" });
      expect(markup.match(/aria-live="polite"/g)).toHaveLength(1);
      expect(markup).not.toContain('role="alert"');
    }

    const pending = render("PENDING", { pixCopyPaste: "pix-payload" });
    expect(pending.match(/aria-live="polite"/g)).toHaveLength(1);
    expect(pending).not.toContain('role="alert"');

    // The named states (terminal failures, INDETERMINATE, status-unavailable)
    // render through `EmptyState`'s own `role="alert"`/`role="status"` and
    // carry no live region of their own.
    const indeterminate = render("INDETERMINATE", { pixCopyPaste: "pix-payload" });
    expect(indeterminate).not.toContain('aria-live="polite"');
  });

  it("feeds the merchant identity into the QR display's identity slot on the live view (C03.a)", () => {
    const markup = render("PENDING", { merchantIdentity: <span data-testid="merchant-mark">mark</span>, pixCopyPaste: "pix-payload" });
    expect(markup).toContain('data-testid="merchant-mark"');
  });

  it("never emits a retired checkout-* class name in any state (C03.c)", () => {
    for (const state of ["CANCELLED", "CONFIRMED", "CREATED", "CREATING", "EXPIRED", "INDETERMINATE", "PENDING", "REFUNDED", "REJECTED", "RESERVED"] as const) {
      expect(render(state, { pixCopyPaste: "pix-payload" })).not.toMatch(/class="[^"]*\bcheckout-[a-z-]+/);
    }
  });

  it("never emits the retired retry surfaces in any state", () => {
    for (const state of ["CANCELLED", "CONFIRMED", "CREATED", "CREATING", "EXPIRED", "INDETERMINATE", "PENDING", "REFUNDED", "REJECTED", "RESERVED"] as const) {
      const markup = render(state, { pixCopyPaste: "pix-payload", statusReadFailed: state === "PENDING" });
      expect(markup).not.toContain("checkoutRetry");
      expect(markup).not.toContain("checkoutCheckAgain");
      expect(markup).not.toContain("checkoutPollErrorBanner");
    }
  });
});
