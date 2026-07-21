# Spec - Checkout and order lifecycle

- **Project:** [[PROJECT|QR Pagamentos]]
- **Epoch/Phase:** [[roadmap/4-checkout-and-orders|Phase 4.1-4.3]]
- **Status:** approved — task 4.1.2 contract revision approved by yolo 003, round 2
- **Created:** 2026-07-21
- **Updated:** 2026-07-21 — yolo 003, round 2 approved the `CustomerSnapshotV1` Brazil address and `SettlementMapV1` contracts; 005 verification returned only for this stale status correction.

## What it covers

This spec defines the durable owner, customer-data, and payment-state contract for payment-link checkout and resulting orders. Provider transport details remain in the Nautt integration spec.

## Requirements

- Every product, payment link, and link-generated order has one persisted owner account. A payment link may reference only a product with the same persisted owner; persistence and server operations reject an owner mismatch. An authenticated account may access only its own products, links, checkout policy, and orders. Administrator authority over users, global settings/catalog, and protected order inspection does not create an implicit cross-owner product or payment-link management path; public access is limited to an active link's checkout and its opaque payment-status capability.
- The account-level checkout data policy defaults to `NONE`. The only supported policies are `NONE`, `NAME_EMAIL`, `EMAIL`, `NAME_EMAIL_CPF`, and `NAME_EMAIL_CPF_ADDRESS`.
- Public checkout renders and validates exactly the fields required by the link owner's policy. Trusted server state, rather than browser input, determines the owner, products, currency, amount, policy, and provider credential.
- A link-generated order persists the payment-link identity, owner identity, amount and currency values used for the provider attempt, the policy applied, and the customer data accepted for that attempt.
- Customer data is available only to the order owner and administrators through protected interfaces. It is not included in public status responses, payment-link resolution responses, logs, or URLs.
- **Customer snapshot V1:** an order has exactly four customer members: nullable `name`, nullable `email`, nullable `cpf`, and nullable `address`. The policy tuple is exact: `NONE = (null, null, null, null)`; `NAME_EMAIL = (name, email, null, null)`; `EMAIL = (null, email, null, null)`; `NAME_EMAIL_CPF = (name, email, cpf, null)`; and `NAME_EMAIL_CPF_ADDRESS = (name, email, cpf, address)`. Every non-null member is required; no policy accepts an additional customer field.
- **Name, email, and CPF normalization:** `name` is Unicode NFC, trimmed of leading/trailing Unicode whitespace, 1–160 Unicode code points, and contains no control character. `email` is Unicode NFC, trimmed, 3–254 Unicode code points, contains no Unicode whitespace or control character, and has one non-empty local part and domain separated by `@`; its case is preserved. `cpf` accepts only the usual formatted or unformatted Brazilian CPF input, is persisted as exactly 11 ASCII digits, and must pass the CPF check-digit validation. Blank or malformed input is rejected; fields are never silently invented or coerced.
- **Brazil address V1:** `address` is a fixed structured snapshot, not free-form JSON, with required `street`, `number`, `district`, `city`, `stateUf`, `postalCode`, and `country`, plus optional nullable `complement`. `street` is 1–160, `number` 1–32, `district` 1–120, `city` 1–120, and `complement` 1–160 Unicode code points when supplied. These text members are NFC-normalized, trimmed, and reject control characters; blank optional `complement` becomes `null`. `stateUf` is persisted uppercase and must be one of the 27 Brazilian UFs (`AC`, `AL`, `AP`, `AM`, `BA`, `CE`, `DF`, `ES`, `GO`, `MA`, `MT`, `MS`, `MG`, `PA`, `PB`, `PR`, `PE`, `PI`, `RJ`, `RN`, `RS`, `RO`, `RR`, `SC`, `SP`, `SE`, `TO`). `postalCode` accepts only `NNNNNNNN` or `NNNNN-NNN`, and is persisted as eight ASCII digits. `country` is the literal persisted value `BR`. Limits apply after normalization. The persisted model has fixed members/columns only: no opaque address blob, unknown key, or future country is permitted without a new approved contract.
- Customer snapshots, including every address member, are never publicly exposed, provider-facing, logged, or placed in a URL. They may be selected only by a future re-authorized owner/administrator projection.
- A single-use payment link is consumed only when one linked order reaches confirmed successful payment. Pending, failed, cancelled, or indeterminate attempts do not consume it.
- An expired link cannot create a new checkout order. A reusable link accepts successful payments until the owner disables it or it expires.
- Concurrent settlement notifications cannot yield more than one successful order for a single-use link.
- **Settlement map V1:** this is a closed provider-to-local mapping based solely on an owner-bound authoritative `GET /orders/{uuid}` reconciliation already defined by the Nautt contract. Provider notification payloads, event names, recovered-history fields, and unknown provider status strings are not settlement evidence and cause no local transition. `new → PENDING`; `processing`, `paid`, and `finished → CONFIRMED`; `rejected → REJECTED`; `canceled → CANCELLED`; `expired → EXPIRED`; and `refunded → REFUNDED`. No other provider status is mapped. `CONFIRMED` is the only successful local state; only the three explicitly listed authoritative provider statuses may enter it.
- A reconciliation may apply this map only through one transaction that matches the attached provider order's owner, immutable provider UUID, observed reconciliation version, and current authoritative mapped status, then conditionally matches the local order's current version and eligible state. `CREATED` never reconciles because it has no attached provider order. `PENDING` and `INDETERMINATE` may move to `PENDING`, `CONFIRMED`, `REJECTED`, `CANCELLED`, or `EXPIRED`; `CONFIRMED` may move only to `REFUNDED`; all other terminal states are immutable. A version/current-state mismatch, an unattached or cross-owner provider order, an unknown status, or a losing single-use claim is a fenced no-op/opaque loser outcome, not a retry or alternate success. The successful mapping atomically records the one single-use claim before marking `CONFIRMED`; an already matching state is idempotent and never creates another claim.
- Task 4.1.2 creates persistence and the server-only reconciliation seam only. It makes no Nautt request and changes no polling, webhook, or recovery execution; a later task supplies those existing authoritative reads to this seam.

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
