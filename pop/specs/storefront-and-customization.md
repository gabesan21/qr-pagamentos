# Spec - Storefront and customization

- **Project:** [[PROJECT|QR Pagamentos]]
- **Epoch/Phase:** [[roadmap/5-storefront-and-production|Phase 5.1-5.2]]
- **Status:** aprovada
- **Created:** 2026-07-21
- **Updated:** 2026-07-24 — task 7.1.2 persists the extended store settings (theme, layout, logo, standalone toggle, default currency) with merge semantics and gated currency assignment.

## What it covers

This spec defines the durable per-owner storefront contract: the persisted settings an owner controls, their validation and defaults, and the redaction boundary of the future public storefront page. Checkout and order behavior stays in [[specs/checkout-and-order-lifecycle|Checkout and order lifecycle]].

## Requirements

- Every account owns exactly one storefront settings record, persisted on the account itself: a nullable public slug, a nullable display name per supported locale (`pt-BR` and `en`), a nullable brand accent color, an `enabled` flag, a nullable theme id, a nullable layout, a nullable logo media identifier, a standalone-payments flag, and a nullable default exchange currency code. The `enabled` flag defaults to disabled; no storefront is ever public until its owner opts in. The standalone-payments flag defaults to enabled, preserving payment-link behavior for every existing merchant.
- **Slug V1:** a storefront slug is lowercase ASCII, matches `^[a-z0-9](-?[a-z0-9])*$`, and is 1–63 characters. It is globally unique across all accounts; a collision on save is one opaque conflict outcome that never identifies the other owner or confirms that any particular slug is taken. Blank input clears the slug (null). Slugs appear only under the `/store/[slug]` path prefix, so no reserved-word list exists.
- **Display names V1:** each localized display name is nullable, NFC-normalized, trimmed, single-line, and at most 160 Unicode code points when present; blank input becomes null. Fallback rendering when a display name is absent belongs to the public page task, not to this settings contract.
- **Accent color V1:** the brand accent color is exactly one `#RRGGBB` hex value (uppercase persisted) or null; blank input becomes null.
- **Theme and layout V1:** the theme id is one of the closed six design-system themes (single source: the theme modifier contexts of `tokens/resolver.json`, re-exported read-only by `src/design-system/themes.ts` with a contract test pinning the two); the layout is `boxed` or `table`. Both are nullable; blank input clears them. Fallbacks are resolved at read/projection time, never stored: theme falls back to the design-system default (`pix-paper`), layout to `boxed`.
- **Default currency V1:** the store's default exchange currency is one uppercase `[A-Z]{3}` ISO 4217 code (format-validated at the service boundary, with a database `AAA`–`ZZZ` bounds check as defense-in-depth) or null; blank input clears it. Assigning a non-null code requires an active mapping in the dynamic registry defined in [[specs/catalog-and-payment-links|Catalog and payment links]]; a missing or inactive mapping fails the whole save with the same opaque failed outcome. A stored code survives later mapping deactivation for reads — only new assignments gate. No store or storefront surface may expose provider UUIDs, inactive codes, or a public currency-discovery surface.
- **Logo V1:** the settings record stores only the opaque 43-character media identifier of a `STOREFRONT_LOGO` object (no database foreign key; media rows are physically purged after grace). Replacement activates the new object through the canonical media boundary, saves the row, then orphans the previous object; a save failure compensates with a best-effort orphan of the just-activated object, so the worst case is a quota-counted unreferenced `ACTIVE` object, never a broken reference. Clearing saves null and orphans the old object.
- **Absent-versus-clear merge semantics:** every extended field (theme, layout, logo, standalone toggle, default currency) participates in a save only when the submitted form carries it; absent fields leave the stored values unchanged, while explicit blank input clears the nullable fields. This keeps legacy forms that submit only the original fields from silently wiping the extended settings.
- Enabling a storefront requires a valid slug already present in the same save; a save that requests enablement without a valid slug is rejected without mutation. Disabling never requires a slug and never clears the stored slug.
- The two toggles are independent: a disabled storefront keeps `/store/[slug]` unavailable while payment links and checkout stay reachable through the standalone-payments behavior. Consuming the standalone toggle in checkout/link flows is a later task's decision; this contract only persists and documents it.
- Storefront settings change only through the authenticated owner's own re-authorized settings save, scoped to that owner and an `ACTIVE` account; no administrator, cross-owner, or public mutation path exists. Saves report only opaque changed/failed/conflict outcomes.
- **Public redaction boundary:** the future public storefront page may expose only the slug, the two display names, the accent color, the resolved theme id, the resolved layout, the logo media identifier (served or opaquely unavailable through the media read route), and the owner's active products that have at least one active payment link, each linking to its checkout. It never exposes the default currency code, either toggle's raw value beyond the enabled gate, the owner identifier, username, email, checkout data policy, credential state, or any other account data.
- Owner product categories and the product/category association are not part of the current public storefront projection. Their grouped public presentation belongs to task 9.1.1; until then, category identity, names, state, version, ownership, and timestamps remain server-only.

## Implemented slices

- **Task 5.1.1:** Owner columns on the account carry the slug (unique nullable index), both display names, accent color, and `storefront_enabled` defaulting to `false`, with database checks matching the application formats and enable-requires-slug. The server-only `src/auth/storefront-settings.ts` service validates Slug/Display-name/Accent-color V1, enforces enable-requires-slug, and maps uniqueness collisions to an opaque conflict. The bilingual owner dashboard card saves through `POST /storefront`, which re-authorizes the cookie principal and returns only empty `401`/`403` or opaque `?storefront=changed|failed|conflict` redirects. No public `/store/` page exists yet.
- **Task 7.1.2:** The account gains the five extended columns (theme id and layout with closed-set checks, logo media identifier without a foreign key, standalone-payments flag defaulting to true, default currency code with the `AAA`–`ZZZ` bounds check). The settings service merges absent-versus-clear input over the current row, gates new currency assignments on the registry's `requireActivePair`, and orchestrates logo replacement through the media boundary's identifier-based owner-fenced `activateOwned`/`orphanOwned` (activate → save → orphan, with compensating orphan on save failure). `POST /storefront` forwards extended fields only when the form carries them, keeping the legacy dashboard card safe. The public `/store/[slug]` projection surfaces the resolved theme id, resolved layout, and logo identifier only. The settings UI and logo upload remain with task 7.1.3.

## Out of scope

- The public `/store/[slug]` page, its rendering fallbacks, and product/link eligibility belong to Phase 5.2.
- Logo upload or any other visual customization beyond the accent color is out of the MVP.
- Checkout `/pay/[identifier]` pages keep the platform design system; owner accent colors never reach them.

## Open

- The display-name fallback the public page renders when the visitor's locale has no stored name remains to be decided in Phase 5.2.

## Related specs

- [[specs/product-scope|Product scope]] - follow for the MVP product boundary.
- [[specs/checkout-and-order-lifecycle|Checkout and order lifecycle]] - follow for the checkout a storefront product links to.
- [`prisma/AGENTS.md`](../../prisma/AGENTS.md) - follow before changing persisted models or migration history.
