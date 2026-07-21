# Spec - Catalog and payment links

- **Project:** [[PROJECT|QR Pagamentos]]
- **Epoch/Phase:** [[roadmap/3-catalog-and-payment-links|Epoch 3]]
- **Status:** aprovada
- **Created:** 2026-07-20
- **Updated:** 2026-07-21 — closeout ledger records the delivered catalog slices; task 4.1.1 preserves the owner-management boundary.

## What it covers

This spec defines the administrator-managed catalog of Nautt provider UUIDs, account-owned products, and payment links that expose those products to buyers.

## Requirements

- Only authenticated administrators may create, update, deactivate, or delete catalog records.
- Authenticated account owners create, update, deactivate, or delete only their own products and create, activate, deactivate, or revoke only their own payment links. Administrators retain the separate global catalog role but have no implicit cross-owner product or payment-link management path.
- Catalog records live in PostgreSQL and are versioned through normal Prisma migrations.
- Every protected catalog or owner-mutating route re-authorizes the cookie principal and returns only its documented empty `401`/`403` protected outcomes or opaque owner outcome, never disclosing a target record to an unauthorized caller.
- The application remains bilingual (`pt-BR`/`en`); all user-visible labels, validation messages, and empty states are dictionary-backed.

### Nautt currency and payment-method catalog

- Administrators manage **currency pairs** (`currency_uuid`, `exchange_currency_uuid`, `label`) and **payment methods** (`payment_method_uuid`, `label`) that the application will allow on products and payment links.
- UUIDs are validated as non-empty canonical UUID strings at the server boundary; malformed values are rejected with a localized validation outcome.
- The application never sources these UUIDs from environment variables, request headers, or browser input; they are always read from this catalog.
- A currency pair or payment method can be marked inactive; inactive records cannot be selected for new payment links but do not break existing links.
- The catalog UI reuses the shared shadcn-based admin design system, responsive tables, and accessible forms.

### Products

- Authenticated account owners manage only their own products with: internal name, public title (i18n), description (i18n), exact-decimal price, active/inactive status.
- A product price is persisted and exchanged inside the server as one canonical positive ASCII decimal string. Its grammar is `^(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{0,5}[1-9])?$`, with the all-zero value excluded: no sign, exponent, comma, grouping separator, surrounding whitespace, leading integer zero, or trailing fractional zero is accepted. This gives at most 12 integer digits, 6 fractional digits, and 18 total digits; values outside those precision/scale limits are rejected rather than rounded. The application never converts the value through JavaScript `Number`.
- The protected product form accepts that canonical dot-decimal contract; it does not silently trim or rewrite malformed prices. Presentation alone formats the exact value according to the persisted `pt-BR` or `en` locale and never changes the stored canonical value.
- Internal names are required and limited to 128 Unicode code points; each public title is required and limited to 160 Unicode code points; each public description is required and limited to 2,000 Unicode code points.
- Text fields are validated after removing leading and trailing Unicode whitespace. The trimmed value is persisted; whitespace-only values are rejected. Internal whitespace is preserved, but internal names and public titles reject CR/LF and therefore remain single-line; descriptions preserve internal spaces and line breaks. Limits apply to the trimmed persisted value.
- A product can be deactivated; inactive products cannot be linked to new payment links.
- Product mutations are atomic and idempotent where practical; concurrent edits are rejected with an opaque conflict outcome.
- Public read surfaces for checkout expose only redacted product fields: public title, description, and price. The application-internal public-product read boundary is server-only and accepts a trusted canonical product UUID plus the closed `pt-BR` or `en` locale. Each uncached read must query only an active product and return either `null` (malformed, absent, or inactive are indistinguishable) or exactly `{ title, description, price }`, selecting the requested locale's persisted public title/description. `price` remains the unchanged canonical positive ASCII decimal string; it is never converted through `Number`, formatted, rounded, or paired with a currency here. The result excludes every identifier, internal/admin field, state/version/timestamp, and provider field. This boundary creates no HTTP route, UI, dictionary copy, payment-link binding, or checkout behavior.

## Implemented slices

- **Task 3.1.1:** Versioned Nautt currency-pair and payment-method catalog persistence, canonical UUID validation, protected administrator mutations, and bilingual management UI with active/inactive state.
- **Task 3.1.2:** Route-level authorization and malformed-UUID hardening for every catalog mutation, including lowercase normalization and opaque protected failure outcomes.
- **Task 3.2.1:** PostgreSQL/Prisma versioned products, canonical positive 18/6 decimal-string pricing, trimmed Unicode-code-point text constraints, re-authorized opaque administrator CRUD with compare-and-swap conflicts, and a localized multiline admin UI that preserves description line breaks. Task 4.1.1 supersedes only that initial administrator-only product-management boundary.
- **Task 3.2.2:** Active-only, localized server read with exactly the redacted `{ title, description, price }` product projection and uniform `null` for malformed, missing, or inactive input. Payment-link binding and checkout remain future work.
- **Task 3.3.1:** PaymentLink persistence with a unique 24-character server-generated URL-safe identifier, type, restrictive product/pair references, nullable expiry, active/created metadata, and commit-boundary active dependency enforcement serialized with deactivation. Active administrators can list, create, and one-way manually revoke links through opaque protected mutations and localized `/admin` management. Task 4.1.1 supersedes only that initial administrator-only payment-link-management boundary. Public `href`, checkout/orders/provider requests, automatic expiry inactivation, and automatic `SINGLE_USE` consumption remain future work.
- **Task 3.3.2:** Sessionless exact-token public resolution with a localized, redacted DTO, strict read-time expiry, and uniform empty `404` plus `no-store` for unavailable input. It performs no write, provider request, checkout, order, or automatic consumption.
- **Task 4.1.1:** Required persisted owner isolation for products and payment links, moved product/link management to the authenticated owner surface, and added the account-level checkout-data policy. The public resolver and checkout/order/provider behavior remain unchanged.

### Payment links

- An authenticated account owner generates a payment link bound to exactly one active product with that same owner and one active currency pair. Creation atomically persists the matching owner and checks both dependencies at its commit boundary; it mutually serializes with their activation-state changes: a deactivation committed first rejects generation, while a deactivation that follows a successful creation leaves the existing link intact.
- Links may be **reusable** (many checkouts, e.g. a donation link) or **single-use**; automatic single-use consumption after order creation belongs to later checkout work, while manual revocation is already available.
- Each link carries: slug/identifier, optional expiration timestamp, active/inactive flag, created-at metadata.
- The link identifier is unique, URL-safe, and non-sequential; it is derived server-side and never editable.
- **Task 3.3.2 public-resolution contract — approved at yolo 003:** `GET /api/payment-links/[identifier]` is unlocalized and sessionless. It accepts only the exact persisted 24-character URL-safe identifier, without trimming, case-folding, or other transformation, chooses only `pt-BR` or `en` through the request `Accept-Language` negotiation, and returns `Cache-Control: no-store` on every outcome. An active, unexpired link whose product remains publicly active returns exactly `{ product: { title, description, price }, currencyPair: { currencyUuid, exchangeCurrencyUuid } }`; `price` stays the exact canonical decimal string. The two currency UUIDs are the sole provider identifiers permitted because later checkout quoting needs the configured pair. No cookies, session/principal lookup, dictionary, UI, route-localized preference, IDs, link metadata, admin fields, pair label/status, timestamps, type, or other provider data may be read or returned. Malformed, absent, inactive, expired, and product-unavailable links all return the same empty `404` with `no-store`; expiry is evaluated at read time only. This endpoint makes no mutation, including automatic expiry inactivation or `SINGLE_USE` consumption, and makes no checkout, order, or provider request.

## Out of scope

- Checkout flow, order creation, and storefront presentation belong to later epochs.
- Real-time validation of catalog UUIDs against Nautt production endpoints is optional; if implemented, it must not block the admin UI or leak provider errors.
- Customer authentication, carts, and persistent buyer sessions.

## Related specs

- [[specs/administrative-foundation|Administrative foundation]] - follow for admin authorization, i18n, and design-system constraints.
- [[specs/nautt-finance-integration|Nautt Finance integration]] - follow for Nautt UUID usage, exact-decimal handling, and provider-boundary rules.
