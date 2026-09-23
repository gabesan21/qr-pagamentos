---
author: agent
created: 2026-09-08
---

# Epoch 14 — human verification checklist

Consolidates every `verify: user` item across Phases 14.1–14.7 (template
fidelity convergence) into one pass. Check both locales (`pt-BR`, `en`) and
all six themes (`pix-paper`, `cashier-daylight`, `settlement-sand`,
`midnight-clearing`, `vault-blue`, `terminal-amber`) unless a row narrows it;
320 px is the mandatory small viewport everywhere, wider widths are named per
group. Source: the entries named in [[14.7.2-phase-verification.g01-phase-gate]]
C09.

## Authentication (`/login`, `/reset-password`, TOTP challenge)

- 320/768/1440 px, both locales, six themes: no overflow, the 900px split
  card panel/brand/language slots hold their layout (14.4.1).
- Catalog-style forced failures keep the typed values on return (14.1.1/14.1.4).
- Theme switcher (authenticated shell) persists per role and revalidates on
  navigation (14.2.2/14.2.5).
- TOTP enrol/confirm/disable/recovery: WCAG 2.2 AA, keyboard-only completion
  (14.2.4/14.2.5/14.4.4).

## App shell chrome (rail, mobile nav, account menu)

- Keyboard operation and visible focus on the account menu and its dialogs
  (14.1.3/14.1.4).
- Mobile boundary: rail collapses correctly at 320 px, no clipped labels
  (14.4.1).

## Admin — dashboard, orders, payment-links directories

- Filtered directory (`?link=` gone) resolves at runtime; keyboard + focus on
  destructive dialogs and the sign-out menu (14.1.3/14.1.4).
- Live filtering with no "Apply" button; malformed-query reset with JS on and
  off (14.3.1/14.3.4).
- Six themes at 12px: soft-tint status pills readable (AA fixed by 14.3.3;
  spot-check pix-paper `danger`/`info`, cashier-daylight `success`/`warning`).
- Scroll-spy, tabs and toasts on `admin/accounts/[id]` and `admin/settings`;
  320 px, both locales, six themes (14.4.3/14.4.4).
- Associated-orders card and account editor tabs render the real backing data
  (14.4.2/14.4.4).

## Merchant workspace — dashboard, orders, links, catalog, settings, profile

- `/settings` visual pass at 320/768/1440, both locales — two-column hub,
  scroll-mt anchors, nav active state (14.1.2/14.1.4).
- Live orders/links directories: five-filter row, oldest-first comments,
  V1+V2 era badges and currency column (14.5.1/14.5.2/14.5.4).
- Payment-link v2 create/edit form: banners gated on `hasCheckoutAttempt`,
  action row and real summary (14.5.2).
- Password change keeps the session; typed text survives a submit failure
  (14.3.4/14.5.3).
- A mutation (order/link/profile/settings) returns on its own page with a
  toast, no redirect (14.3.2).
- Catalog/category flat forms: pre-selected currency reaches create, logo
  upload `<noscript>` fallback un-nested (14.5.3).
- Nautt credential surface and profile TOTP flows: keyboard, focus, AA
  (14.5.3/14.5.4).

## Public checkout, storefront, standalone payment

- Both checkout eras (V1/V2), both locales/themes, 320–1440 px: masks,
  inline error focus, total shown on submit, QR with centred mark, retry
  after the first poll failure, modal focus trap, forced `404` view
  (14.6.1/14.6.3).
- `/store/[slug]` and `/store/[slug]/pay`: six themes, both locales,
  320/375/768/1440 — no overflow in `boxed`/`table` presentation, visible
  focus, identity/tone parity with `/pay`, language switch keeps state
  (14.6.2).
- Standalone payment phases: typing never mutates state, `startOver` is the
  only reset, refunded shows the neutral `EmptyState` (14.6.2/14.6.3).

## Design-system specimen page

- `/design-system`: primitive/composition specimens render at parity with
  the regenerated evidence below; no residual `ds-*`/`receipt-rail` visual
  drift (this task, F01/F03).

## Docker-driven evidence — stale, never run here

Regenerate and verify each pair after `develop` moves; every pair below sits
behind `docker compose` and is out of this task's reach.

| Area | Regenerate | Verify |
|---|---|---|
| Admin (base) | `pnpm admin:evidence` | `pnpm admin:evidence:verify` |
| Admin settings | `pnpm admin-settings:evidence` | `pnpm admin-settings:evidence:verify` |
| App shell | `pnpm app-shell:evidence` | `pnpm app-shell:evidence:verify` |
| Profile | `pnpm profile:evidence` | `pnpm profile:evidence:verify` |
| Store settings | `pnpm store-settings:evidence` | `pnpm store-settings:evidence:verify` |
| Storefront | `pnpm storefront:evidence` | `pnpm storefront:evidence:verify` |
| Catalog | `pnpm catalog:evidence` | `pnpm catalog:evidence:verify` |
| Payment links (merchant) | `pnpm links:evidence` | `pnpm links:evidence:verify` |
| Merchant dashboard | `pnpm merchant-dashboard:evidence` | `pnpm merchant-dashboard:evidence:verify` |
| Orders (merchant) | `pnpm orders:evidence` | `pnpm orders:evidence:verify` |
| Admin orders | `pnpm admin-orders:evidence` | `pnpm admin-orders:evidence:verify` |
| Admin dashboard | `pnpm admin-dashboard:evidence` | `pnpm admin-dashboard:evidence:verify` |
| Admin users | `pnpm admin-users:evidence` | `pnpm admin-users:evidence:verify` |
| Standalone payment | `pnpm standalone-payment:evidence` | `pnpm standalone-payment:evidence:verify` |
| Checkout | `pnpm checkout:evidence` | `pnpm checkout:evidence:verify` |
| Admin payment-links | `pnpm admin-payment-links:evidence` | `pnpm admin-payment-links:evidence:verify` |
| Reset password | `pnpm reset-password:evidence` | `pnpm reset-password:evidence:verify` |

## Close-out

Run `pnpm check` at the repository root on integrated `develop` (C13) before
opening the `develop` → `main` PR; review and merge the PR (C14).
