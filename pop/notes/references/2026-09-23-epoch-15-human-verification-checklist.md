---
author: agent
created: 2026-09-23
---

# Epoch 15 — human verification checklist

Consolidates every `verify: user` item across Phases 15.1-15.4
(V2-only, PIX integrity, explicit checkout) into one pass. Check both
locales (`pt-BR`, `en`); wider matrices are named per row. Sources:
[[pop/memory/2026-09-23/15.1.4-phase-verification|15.1.4]],
[[pop/memory/2026-09-23/15.3.4-phase-verification|15.3.4]],
[[pop/memory/2026-09-23/15.4.1-migrate-template-vocabulary|15.4.1]],
[[pop/memory/2026-09-23/15.4.2-fix-target-sizes-and-dictionary-debt|15.4.2]]
(15.2.4 had zero `verify: user` items — no Docker, no local webhook).

## Database and install (Docker, no browser)

- **15.1.4 C9** — `pnpm db:test` on a disposable fixture: green run,
  `to_regclass` of the four removed V1 tables is `null`.
- **15.1.4 C10** — `install/test.sh` (or a clean-checkout install): succeeds,
  no V1 table created.

## Evidence-spec recapture (V2-only screens)

- **15.1.4 C11** — recapture the affected `tests/*.evidence.spec.ts`:
  V2-only captures, no missing screen, no V1 page targeted.
- **This task's C1 lacuna** — `tests/merchant-dashboard.evidence.spec.ts`
  still asserts two dictionary keys (`merchantDashboardSalesEmpty`,
  `merchantDashboardLinksEmpty`) retired by 15.4.2; `tsc --noEmit` fails on
  it today. The file is outside this task's `owns` (`tests/**` is not
  `src/**`) — repair it (assert the surviving empty-state keys) before or
  during this recapture, then re-run `pnpm check`.

## Checkout and standalone payment (15.3.1/15.3.3)

- **15.3.4 U1** — `pnpm checkout:evidence` then `pnpm checkout:evidence:verify`:
  6 themes × 2 locales × 4 widths; the three named states (PIX-unavailable,
  status-unavailable, submit-failure) show `Start over` as the only action,
  no retry control; state line and privacy trigger read at AA; axe reports
  no new violation.
- **15.3.4 U2** — `pnpm standalone-payment:evidence` then
  `pnpm standalone-payment:evidence:verify`: same matrix, same named states,
  axe clean.
- **15.3.4 U3** — visual check of the `NONE` customer-block path on both
  checkout surfaces (with `NONE` and with a fields-required policy): no
  empty slot or displacement, pay action and privacy line keep position.

## Template-vocabulary migration and target sizes (15.4.1/15.4.2)

- **15.4.1 criterion 8** — rendered capture of every migrated family
  (merchant, admin, shell/public/checkout) shows no visual regression —
  the rename is value-identical, so nothing should move.
- **Flagged deviation (15.4.1 entry 02)** — `LanguageSwitcher`
  (`src/app/language-preference/language-switcher.tsx`) composes
  `NativeSelect` inside a manually chromed wrapper (`border`+`bg-bg`+
  `rounded-md`); `NativeSelect`'s own inner `<select>` renders its own
  `border`+`bg-background`+`rounded-md` chrome (`src/components/ui/native-select.tsx`),
  with no `className` hook exposed on the `<select>` itself to suppress it.
  Static reading of both files confirms nested chrome is structurally
  possible; confirm visually on `/login`, `/reset-password` (compact
  locale switcher) whether a double border/background is actually visible,
  and reduce it if so (fix belongs to a future task — this repo's
  `src/app/language-preference/**` is outside every 15.4.x task's `owns`).
- **15.4.2 C11** — `link-lines-editor.tsx` steppers/remove button and
  `merchant-controls.tsx`'s segmented control render ≥44×44 px with no
  layout break at 375/768/1440.

## Docker-driven evidence — regenerate after `develop` moves

Every pair below sits behind `docker compose`; none ran in this task.

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

Run `pnpm check` at the repository root on integrated `develop` before
opening the `develop` → `main` PR (repair the lacuna above first); review
and merge the PR yourself — the agent only suggests it.
