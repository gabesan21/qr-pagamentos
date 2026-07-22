# Spec - Storefront and customization

- **Project:** [[PROJECT|QR Pagamentos]]
- **Epoch/Phase:** [[roadmap/5-storefront-and-production|Phase 5.1-5.2]]
- **Status:** aprovada
- **Created:** 2026-07-21
- **Updated:** 2026-07-21 — task 5.1.1 delivered per-owner storefront settings (slug, bilingual display name, accent color, enabled flag) with the owner settings surface; the public storefront page remains in Phase 5.2.

## What it covers

This spec defines the durable per-owner storefront contract: the persisted settings an owner controls, their validation and defaults, and the redaction boundary of the future public storefront page. Checkout and order behavior stays in [[specs/checkout-and-order-lifecycle|Checkout and order lifecycle]].

## Requirements

- Every account owns exactly one storefront settings record, persisted on the account itself: a nullable public slug, a nullable display name per supported locale (`pt-BR` and `en`), a nullable brand accent color, and an `enabled` flag. The flag defaults to disabled; no storefront is ever public until its owner opts in.
- **Slug V1:** a storefront slug is lowercase ASCII, matches `^[a-z0-9](-?[a-z0-9])*$`, and is 1–63 characters. It is globally unique across all accounts; a collision on save is one opaque conflict outcome that never identifies the other owner or confirms that any particular slug is taken. Blank input clears the slug (null). Slugs appear only under the `/store/[slug]` path prefix, so no reserved-word list exists.
- **Display names V1:** each localized display name is nullable, NFC-normalized, trimmed, single-line, and at most 160 Unicode code points when present; blank input becomes null. Fallback rendering when a display name is absent belongs to the public page task, not to this settings contract.
- **Accent color V1:** the brand accent color is exactly one `#RRGGBB` hex value (uppercase persisted) or null; blank input becomes null.
- Enabling a storefront requires a valid slug already present in the same save; a save that requests enablement without a valid slug is rejected without mutation. Disabling never requires a slug and never clears the stored slug.
- Storefront settings change only through the authenticated owner's own re-authorized settings save, scoped to that owner and an `ACTIVE` account; no administrator, cross-owner, or public mutation path exists. Saves report only opaque changed/failed/conflict outcomes.
- **Public redaction boundary:** the future public storefront page may expose only the slug, the two display names, the accent color, and the owner's active products that have at least one active payment link, each linking to its checkout. It never exposes the owner identifier, username, email, checkout data policy, credential state, or any other account data.

## Implemented slices

- **Task 5.1.1:** Owner columns on the account carry the slug (unique nullable index), both display names, accent color, and `storefront_enabled` defaulting to `false`, with database checks matching the application formats and enable-requires-slug. The server-only `src/auth/storefront-settings.ts` service validates Slug/Display-name/Accent-color V1, enforces enable-requires-slug, and maps uniqueness collisions to an opaque conflict. The bilingual owner dashboard card saves through `POST /storefront`, which re-authorizes the cookie principal and returns only empty `401`/`403` or opaque `?storefront=changed|failed|conflict` redirects. No public `/store/` page exists yet.

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
