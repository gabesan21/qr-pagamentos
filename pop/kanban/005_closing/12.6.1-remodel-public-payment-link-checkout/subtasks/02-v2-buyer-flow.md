# 02 — V2 buyer flow and paid terminal remodeling

## Context

`src/app/pay/[identifier]/public-checkout-v2-page.tsx` and `public-checkout-v2-form.tsx` own the branded Commerce V2 checkout and the 9.3.2 paid terminal view. Branding resolves from the owner record independently of `storefront_enabled`; the paid view is keyed only to the persisted single-use settlement claim.

## Goal

Align the V2 checkout and paid terminal with the template while preserving the redaction boundary, claim-keying, and two-column composition contract unless a recorded parity decision changes it.

## Work

1. Apply template tokens to the branded `CheckoutV2Shell` (`data-theme-preview`, `--storefront-accent`, logo, display name) without exposing new owner data.
2. Remodel the summary column as a template card: order-summary heading, product lines or fixed description, total with `MoneyText`, and the resolved display currency code or explicit unlabeled treatment.
3. Remodel the customer-form column with shared `Field` components and token spacing; keep the same policy-exact validation and idempotency-key retry behavior.
4. Convert the payment section to use `QrDisplay`, `CopyField`, `StatusBadge`, and template error/retry banners; preserve 5-second visibility-aware polling and exponential backoff.
5. Remodel the paid terminal view as a template success/info card with a non-color paid marker, the public composition summary, and exact total; continue to omit order state, timestamps, payer data, and policy.
6. Preserve the opaque unavailable view for unknown, inactive, expired, and consumed-single-use-when-unavailable cases.

## Boundaries

- The paid DTO must still carry only branding, composition, currency code, and total.
- Do not read live order state in the paid branch.
- No new route, rate-limit surface, or request-log entry.
