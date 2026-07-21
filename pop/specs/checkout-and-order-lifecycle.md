# Spec - Checkout and order lifecycle

- **Project:** [[PROJECT|QR Pagamentos]]
- **Epoch/Phase:** [[roadmap/4-checkout-and-orders|Phase 4.1-4.3]]
- **Status:** rascunho
- **Created:** 2026-07-21
- **Updated:** 2026-07-21

## What it covers

This spec defines the durable owner, customer-data, and payment-state contract for payment-link checkout and resulting orders. Provider transport details remain in the Nautt integration spec.

## Requirements

- Every product, payment link, and link-generated order has one persisted owner account. A payment link may reference only a product with the same persisted owner; persistence and server operations reject an owner mismatch. An authenticated account may access only its own products, links, checkout policy, and orders. Administrator authority over users, global settings/catalog, and protected order inspection does not create an implicit cross-owner product or payment-link management path; public access is limited to an active link's checkout and its opaque payment-status capability.
- The account-level checkout data policy defaults to `NONE`. The only supported policies are `NONE`, `NAME_EMAIL`, `EMAIL`, `NAME_EMAIL_CPF`, and `NAME_EMAIL_CPF_ADDRESS`.
- Public checkout renders and validates exactly the fields required by the link owner's policy. Trusted server state, rather than browser input, determines the owner, products, currency, amount, policy, and provider credential.
- A link-generated order persists the payment-link identity, owner identity, amount and currency values used for the provider attempt, the policy applied, and the customer data accepted for that attempt.
- Customer data is available only to the order owner and administrators through protected interfaces. It is not included in public status responses, payment-link resolution responses, logs, or URLs.
- A single-use payment link is consumed only when one linked order reaches confirmed successful payment. Pending, failed, cancelled, or indeterminate attempts do not consume it.
- An expired link cannot create a new checkout order. A reusable link accepts successful payments until the owner disables it or it expires.
- Concurrent settlement notifications cannot yield more than one successful order for a single-use link.

## Out of scope

- The precise Nautt HTTP request, webhook authentication, and provider recovery protocol are defined by [[specs/nautt-finance-integration|Nautt Finance integration]].
- Optional public storefront discovery and visual customization belong to Epoch 5.
- Customer-data retention schedules and external privacy-law compliance processes are not defined by this MVP contract.

## Open

- The behavior of in-flight orders after an owner disables a reusable link remains to be specified before that transition is exposed.

## Related specs

- [[specs/product-scope|Product scope]] - follow for the MVP product boundary.
- [[specs/nautt-finance-integration|Nautt Finance integration]] - follow when creating provider orders or processing provider status.
- [`prisma/AGENTS.md`](../../prisma/AGENTS.md) - follow before changing persisted models or migration history.
