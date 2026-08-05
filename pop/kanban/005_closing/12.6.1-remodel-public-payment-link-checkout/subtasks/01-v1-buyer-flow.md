# 01 — V1 buyer flow remodeling

## Context

`src/app/pay/[identifier]/public-checkout-form.tsx` and the V1 branch of `page.tsx` render the legacy single-column checkout. The V1 presentation DTO (`{ product: { title, description, price }, checkoutPolicy }`) and the V1 `POST /api/payment-links/[identifier]/checkout/status` contract are byte-frozen in behavior.

## Goal

Apply the template visual system to the V1 checkout without changing request bodies, endpoints, polling cadence, retry semantics, or state machine.

## Work

1. Wrap the V1 page in the template shell: centered max-width checkout container, page background, and card elevation.
2. Replace the current receipt rail with a template order-summary card that shows product title, description, price, and a submit CTA that formats the total using `MoneyText`.
3. Remodel the customer form to use the shared `Field`/`FieldGroup` components and token-driven spacing; keep the exact policy-driven field set (`NONE`, `EMAIL`, `NAME_EMAIL`, `NAME_EMAIL_CPF`, `NAME_EMAIL_CPF_ADDRESS`).
4. Convert the payment section to the template payment card: status badge, `QrDisplay` frame, `CopyField` for the PIX copy-paste code, amount due, and inline status-error retry affordance.
5. Render terminal states (`CONFIRMED`, `REJECTED`, `CANCELLED`, `EXPIRED`, `REFUNDED`) with `StatusBadge` and template confirmation/failure cards.
6. Keep `createPollingController` imported and reused unchanged.

## Boundaries

- Do not change `src/checkout/public-checkout.ts`, `payment-status.ts`, or any route.
- Do not introduce motion that moves focus or hides content under reduced motion.
