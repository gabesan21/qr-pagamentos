# Spec - Catalog and payment links

- **Project:** [[PROJECT|QR Pagamentos]]
- **Epoch/Phase:** [[roadmap/3-catalog-and-payment-links|Epoch 3]]
- **Status:** pendente
- **Created:** 2026-07-20

## What it covers

This spec defines the administrator-facing catalog of Nautt provider UUIDs, the products sold through the application, and the payment links that expose those products to buyers.

## Requirements

- Only authenticated administrators may create, update, deactivate, or delete catalog records.
- Catalog records live in PostgreSQL and are versioned through normal Prisma migrations.
- Every admin-mutating route re-authorizes the cookie principal and returns only empty `401`/`403` protected outcomes, never disclosing a target record to unauthorized callers.
- The application remains bilingual (`pt-BR`/`en`); all user-visible labels, validation messages, and empty states are dictionary-backed.

### Nautt currency and payment-method catalog

- Administrators manage **currency pairs** (`currency_uuid`, `exchange_currency_uuid`, `label`) and **payment methods** (`payment_method_uuid`, `label`) that the application will allow on products and payment links.
- UUIDs are validated as non-empty canonical UUID strings at the server boundary; malformed values are rejected with a localized validation outcome.
- The application never sources these UUIDs from environment variables, request headers, or browser input; they are always read from this catalog.
- A currency pair or payment method can be marked inactive; inactive records cannot be selected for new payment links but do not break existing links.
- The catalog UI reuses the shared shadcn-based admin design system, responsive tables, and accessible forms.

### Products

- Administrators manage products with: internal name, public title (i18n), description (i18n), exact-decimal price, active/inactive status.
- Product price uses a decimal representation; the UI formats it according to the configured locale.
- A product can be deactivated; inactive products cannot be linked to new payment links.
- Product mutations are atomic and idempotent where practical; concurrent edits are rejected with an opaque conflict outcome.
- Public read surfaces for checkout expose only redacted product fields: public title, description, and price.

### Payment links

- Administrators generate payment links bound to exactly one active product and one active currency pair.
- Links may be **reusable** (many checkouts, e.g. a donation link) or **single-use** (one checkout, then automatically inactivated after first successful order creation or explicit manual revocation).
- Each link carries: slug/identifier, optional expiration timestamp, active/inactive flag, created-at metadata.
- The link identifier is unique, URL-safe, and non-sequential; it is derived server-side and never editable.
- A sessionless public GET endpoint resolves a link identifier to its redacted product and currency pair, returning `404` for inactive, expired, or non-existent links.
- Link resolution exposes no internal IDs, no admin-only fields, and no Nautt UUIDs beyond the currency pair needed for checkout quoting.

## Out of scope

- Checkout flow, order creation, and storefront presentation belong to later epochs.
- Real-time validation of catalog UUIDs against Nautt production endpoints is optional; if implemented, it must not block the admin UI or leak provider errors.
- Customer authentication, carts, and persistent buyer sessions.

## Related specs

- [[specs/administrative-foundation|Administrative foundation]] - follow for admin authorization, i18n, and design-system constraints.
- [[specs/nautt-finance-integration|Nautt Finance integration]] - follow for Nautt UUID usage, exact-decimal handling, and provider-boundary rules.
