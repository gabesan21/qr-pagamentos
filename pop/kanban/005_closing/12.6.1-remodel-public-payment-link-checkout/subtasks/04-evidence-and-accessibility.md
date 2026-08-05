# 04 — State matrix, accessibility, and evidence update

## Context

`tests/checkout.evidence.spec.ts` seeds `checkout_attempt_v2`/`order_v2`/`provider_order` rows and captures 127 screenshots across themes, locales, widths, and states. The test asserts accessibility, target sizes, overflow, focus, console errors, and source hashes.

## Goal

Keep the evidence run valid after the visual remodeling and preserve its complete state matrix.

## Work

1. Update test selectors and assertions that depend on class names or DOM structure changed by the remodeling.
2. Ensure the same state captures are produced: inline validation, submit-pending, opaque checkout error, QR/copy, waiting-for-payment-data, status-error with manual retry, confirmed, rejected, expired-capability, unavailable (unknown/inactive/expired), paid fixed/product-lines, unbranded and branded grids.
3. Verify WCAG 2.2 AA: run the existing axe scan, confirm all interactive targets are ≥44×44 px, confirm visible focus, confirm no horizontal overflow at 320 px.
4. Update the `sourceInventory` and source hashes in the evidence manifest if any owned file changes.
5. Add or update dictionary entries only for labels introduced by the template; do not change capability or disclosure copy.

## Boundaries

- Do not reduce the capture count or drop state coverage.
- Do not rely on Docker for verification in this planning stage; actual evidence runs are user-exclusive.
