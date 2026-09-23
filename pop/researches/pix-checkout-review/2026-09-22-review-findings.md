---
author: agent
created: 2026-09-22
---

# PIX and checkout review — findings that ground Epoch 15

- **Ingested:** 2026-09-22 — read-only review (Recon + three parallel reconnaissance passes over onboarding/webhook/reconciliation, catalog/routing, UI inventory).
- **Feeds:** [[roadmap/15-v2-only-pix-integrity-and-explicit-checkout|Epoch 15]] — *read before planning any task of that epoch*. Decisions: [[notes/decisions/2026-09-22-v1-removal-and-checkout-decisions|2026-09-22 decisions]].
- **Scope note:** `NAUTT_API_BASE_URL` findings were dropped by user decision; webhook delivery is never tested locally.

## PIX data path (confirmed)

`POST /orders/onramp` → `parseOrderView` normalizes `pix_qrcode ?? qrcode` and `pix_qrcode_url` (`src/integrations/nautt/pricing-orders-client.ts:205-208`) → `completeCreation` persists `provider_order.pix_copy_paste`/`pix_qrcode_url` (`provider-order-store.ts:107-114`) → public status routes re-read the database every 5 s and emit PIX only while local state is exactly `PENDING` (`src/checkout/payment-status-v2.ts:50-51`, `standalone-payment-status.ts:50-51`, `checkout-experience.tsx:130-142`) → `QrDisplay` renders the SVG client-side from `pixCopyPaste` (`checkout-payment-views.tsx:152-158`). No provider call happens during buyer polling.

## Confirmed findings

| # | Sev. | Finding | Evidence |
|---|------|---------|----------|
| A1 | High | Reconciliation erases PIX: `orderData` sets `pixCopyPaste: order.pixCopyPaste ?? null` and `reconcile` spreads it into `updateMany`; any authoritative `GET` lacking `payment_data.qrcode`/`pix_qrcode` writes NULL over a stored payload. Fires on every active-order webhook (`order.created`, `order.processing`, `order.paid`). No test protects it: every reconciliation fixture starts with PIX null. | `provider-order-store.ts:49-61,150-164`; `provider-order-reconciliation.test.ts:19-29,44-45` |
| A2 | High | No production polling consumer: `pollOrder`/`recoverOrder` exist only in the service and tests; the webhook (and delivery recovery) is the only live reconciliation trigger. A PIX absent at creation is never backfilled. | `owner-pricing-orders.ts:182-188`; `webhook-intake.ts:128` |
| A4 | Medium | Every non-201 creation response, including documented `400 order.exchange_not_configured`, `400 order.payment_method_not_available`, `400 order.quote_expired`, `422 order.deposit_fields_required`, collapses into `NauttOrderCreationIndeterminateError`; the attempt becomes `INDETERMINATE` and the buyer reads "confirming with your bank" for a deterministic configuration error. All live checkouts send `{}` as order options. | `pricing-orders-client.ts:333`; `public-checkout-v2.ts:126`; `standalone-checkout.ts:121`; `researches/nautt-finance/raw/orders/create-onramp-order.md:225-281` |
| A5 | Medium | Nothing asserts a configured pair is BRL/PIX: admin stores opaque UUIDs; `GlobalPaymentSettings` (BRL/PIX) is never read by checkout; `CatalogPaymentMethod` is never sent to Nautt; no seed exists. A non-PIX `payment_data` yields undefined `pixCopyPaste`. | `src/app/admin/catalog/currency-pairs/route.ts:14-18`; `src/auth/payment-settings.ts:4-5`; `standalone-checkout.ts:150-158` |
| A6 | Medium | QR states have no exit: `pending={!pixCopyPaste}` pulses indefinitely; a rejected generation only clears `aria-busy` and renders an empty white frame with no message. | `checkout-payment-views.tsx:153-158`; `qr-display.tsx:49,62-81` |
| A7 | Medium | Provider errors are opaque in logs: 4xx bodies collapse into typed errors without the documented `code`. | `pricing-orders-client.ts:289,333`; `main-wallet-balance.ts:70-72` |
| A8 | Low | `pixQrCodeUrl` travels to the UI and is never rendered (decision 14.6.1: provider image is not the QR source). | `checkout-payment-views.tsx:78` |
| A9 | Medium | Template vocabulary drift: `text-muted-foreground` ~180 uses in 40 files vs 21 files using declared names (`text-text-2/3`, `bg-surface`, `rounded-card`); `max-w-checkout`/`max-w-app`/`max-w-auth-form` declared and unused (shell writes `max-w-[var(--checkout-max)]`); `font-display` bypassed in 9 sites; `bg-primary` where the role is `bg-accent`. | `DESIGN.md:75-95`; `checkout-shell.tsx:18,51,55`; `checkout-payment-views.tsx:100,115` |
| A10 | Medium | Checkout a11y: no `aria-live` around the state badge; `text-warning` strong role as body text on INDETERMINATE; `/pay` `loading.tsx` hardcodes `defaultLocale`; `scrollIntoView` smooth scroll not gated on reduced motion. | `checkout-payment-views.tsx:141,151`; `pay/[identifier]/loading.tsx:8,11`; `checkout-experience.tsx:71`; `DESIGN.md:590-601` |
| A11 | Low | Targets under 44 px: quantity steppers (32 px), period controls (~30 px), inline privacy button. | `link-lines-editor.tsx:195-223`; `merchant-controls.tsx:29`; `admin-controls.tsx:46`; `checkout-privacy-notice.tsx:20` |
| A12 | Low | Harness: `qrcode` is the only caret dependency (`^1.5.4`); ledger `D-20260922` lives in `memory/` at the repo root instead of `pop/memory/`; local Node 26.9.0 differs from the 26.4.0 pin so `pnpm` aborts (use `./node_modules/.bin/*`). | `package.json:91`; `memory/2026-09-22/` |
| A13 | Medium | Policy `NONE` renders a "Customer data" heading plus `Alert role="status"` saying no data is required; the template hides the whole block (`needsForm`). | `public-checkout-v2-form.tsx:105-111`; `standalone-payment-experience.tsx:197`; `docs/template/app/src/pages/checkout/CheckoutPage.tsx:416,495-575` |

## Retry surfaces removed by decision 3

Backoff `1s·2^n` and `retryPoll` (`checkout-experience.tsx:143-150,205`); "check again" banner (`checkoutPollErrorBanner`, `checkoutCheckAgain`, `checkoutRetryStatus`); same-attempt resubmit label `checkoutRetry` (`checkout-experience.tsx:225-227`); waiting caption `checkoutGeneratingQr`. Template's "new payment" button (`CheckoutPage.tsx:675-678`) is not adopted; `checkoutStartOver` is the only action.

## V1 footprint (confirmed, to remove)

- **Code (V1-only modules):** `src/checkout/public-checkout.ts`, `public-checkout-presentation.ts`, `payment-status.ts`; `src/orders/payment-link-order.ts`, `order-view.ts`; `src/auth/payment-link.ts`; `src/app/payment-links/route.ts`; `src/app/pay/[identifier]/public-checkout-form.tsx`; `src/app/(merchant)/links/legacy-links.tsx`; `src/app/(merchant)/orders/legacy-order-table.tsx`, `src/app/admin/orders/legacy-order-table.tsx`; `src/app/orders/order-views.tsx`; pages `/orders/[id]`, `/admin/orders/[id]`.
- **V1-first branches:** `POST /api/payment-links/[identifier]/checkout` and `/status` routes, `/pay/[identifier]/page.tsx` presentation resolution, `/orders`, `/admin/orders`, `/links` legacy sections.
- **Tests (10 V1 files):** `public-checkout.test.ts`, `public-checkout-presentation.test.ts`, `payment-status.test.ts`, `order-view.test.ts`, `payment-link-order.test.ts`, `public-checkout-form.test.tsx`, plus V1 branches inside `page.test.tsx`, `page.identity-wiring.test.tsx`, `checkout-shell.test.tsx`, `checkout-footer.test.tsx`; `tests/checkout.evidence.spec.ts` "both eras" grid.
- **Persistence:** `payment_link`, `payment_link_order`, `checkout_attempt`, `payment_link_single_use_settlement`, column `provider_order.payment_link_order_id` (`prisma/schema.prisma:293,557,578,615`); bootstrap grants; the 19-directory baseline pinned by SHA-256 (`prisma/migration-policy-baseline.json`).
- **Contracts:** 42 V1 mentions in `pop/specs/checkout-and-order-lifecycle.md` (its normative body is V1), 25 in `catalog-and-payment-links.md`, 9 in `administrative-foundation.md`; `src/checkout/AGENTS.md`, root `AGENTS.md`; 475 parity records targeting `/orders/[id]` and `/admin/orders/[id]` (`docs/frontend-template-parity/obligations.ndjson`); the immutable template still describes V1 (`docs/template/info.md:229`).

## Gaps

- **L1:** `/exchange-currencies` documentation is not ingested (which methods a currency offers, `deposit_fields`) — prompt in `RESEARCHES.md`.
- **L2:** no rendered template-vs-app diff harness; parity is hash-record proof only.
- **L3:** webhook HMAC suspended (M-5.1) — Epoch 13.
