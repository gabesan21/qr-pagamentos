---
author: agent
date: 2026-09-08
status: active
---

# Template fidelity convergence — gap outcome (Epoch 14)

Synthesis alongside the [[pop/researches/template-fidelity-convergence/template-fidelity-audit|audit]] and
its five family files. One row per gap the audit named, with a named
destination: **closed** by the memory ledger that fixed it, **open** in the
spec that records it as a fact, or **not reproduced** by design. Compiled by
`14.7.1` F03 after `14.1`–`14.6` converged the route families and retired the
route-scoped BEM system (see [[DESIGN|DESIGN.md]] › "BEM retirement").

## Closed

| Gap (audit source) | Closed by |
|---|---|
| No theme switching / dead `data-theme` on authenticated shell (`foundation-shell-auth`) | `14.2.2` — `qr_theme` cookie + shell picker; see `pop/specs/application-frontend-system.md` line 74 |
| Split visual system: template utility vocabulary never wired into Tailwind (`template-fidelity-audit` root cause 2) | `14.2.1`/`14.2.2` token wiring, plus this task's BEM retirement |
| AA contrast failure on soft-tint pills (4 pairs below 4.5:1) | [[pop/memory/2026-09-08/14.3.3-project-aa-soft-tone-foregrounds|14.3.3]], handed off by [[pop/memory/2026-09-08/14.2.5-phase-verification.05-aa-finding-handoff|14.2.5]] |
| Admin dashboard/directories drift, retired `.admin-dashboard__*` BEM, dead allowlist entries | [[pop/memory/2026-09-08/14.4.2-converge-admin-dashboard-and-directories.04-contracts-and-gaps|14.4.2]]; allowlist pruned by this task (F03) |
| Admin accounts/settings drift (modal, redirect, tabs) | [[pop/memory/2026-09-08/14.4.3-converge-admin-accounts-and-settings.04-contracts-and-gaps|14.4.3]] |
| Merchant dashboard/orders drift, `.merchant-dashboard__*` BEM | [[pop/memory/2026-09-08/14.5.1-converge-merchant-dashboard-and-orders.04-contracts-and-gaps|14.5.1]] |
| Merchant payment-links era split, float subtotals | [[pop/memory/2026-09-08/14.5.2-converge-merchant-payment-links.04-contracts-and-gate|14.5.2]] |
| Catalog/settings/profile drift, product archive/activate refs, `.storefront-*`/`.profile-*` merchant-only BEM | [[pop/memory/2026-09-08/14.5.3-converge-catalog-settings-profile.04-contracts-gaps-and-bem|14.5.3]] |
| Public checkout drift, outcome-view collapse (partial), V1 branding | [[pop/memory/2026-09-08/14.6.1-converge-public-checkout.04-contracts|14.6.1]] |
| Public `.storefront-*`/`.checkout-*` BEM, `EmptyState` over `Card`+`Alert` | [[pop/memory/2026-09-08/14.6.2-converge-storefront-and-standalone-pay.03-bem-retirement|14.6.2]] |
| `.receipt-rail*` (kept alive by `/design-system` after `14.6.2`) | this task (F01 migrated `/design-system` off it; F03 deleted the rule — 0 referrers) |
| Auth/login/reset/workspace/settings/nautt/design-system route BEM (`admin-shell*`, `admin-account*`, `admin-product*`, `ds-*`, `nautt-facts*`, `settings-surface*`, `auth-page`, `auth-card__{tagline,caption,strip,swatch,form--tight,footer,panel-brand}`, `auth-password-field*`, `auth-forgot*`, `auth-totp-actions`, `auth-mode-toggle`, `login-*`, `reset-password-*`) | this task, `14.7.1` (F01 + F02 dropped consumers, F03 deleted the rules against a zero grep) |

## Open (recorded in a spec, not fixed here)

| Gap | Recorded in |
|---|---|
| No current-local-outcome filter, no unified V1+V2 admin table, no dynamic pair-label filter, no dashboard sparkline | `administrative-foundation` (per `14.4.2`) |
| Admin §1 initial status/UUID columns/inactive rows, store slug on directory row | `administrative-foundation` (per `14.4.3`) |
| No outcome/currency-pair filter, no unified V1+V2 order list, no payment-data card, no stale strip, no V2 line-title column | `checkout-and-order-lifecycle` (per `14.5.1`) |
| No active-state control on catalog create, no inline edit for inactive category, no credential replace outside `UNREGISTERED`, no enrolled-since date | `catalog-and-payment-links` (per `14.5.3`) |
| Countdown, single-use badge, order reference excluded from public checkout (would leak into the pinned DTO); no-JS `<form action>` fallback (JSON-only API, out of scope) | `checkout-and-order-lifecycle` (per `14.6.1`) |
| `.auth-brand` descendant override into `BrandIdentity` internals — a size prop would retire it | `src/brand/AGENTS.md` (this task, F03) and [[pop/memory/2026-09-08/14.7.1-retire-bem-and-refresh-contracts.f02-auth-consumers|F02's report]] |
| Password reset 2-state collapse (`validateResetChallenge`/`findValidToken` fold invalid/expired/used into one `null`) | `pop/specs/application-frontend-system.md` line 85 |

## Deliberately not reproduced / still un-triaged follow-ups

| Gap | Reason |
|---|---|
| `ImageUploader` second/third call sites' upstream insufficiency finding stays recorded, never promoted to `owners` | `src/components/ui/inventory.json` `localAdditions` (per `12.2.4`/`14.5.3`), unchanged by this task |
| `AssociatedOrdersCard` `{await ...}` idiom now that it has coverage | flagged by [[pop/memory/2026-09-08/14.4.4-phase-verification.06-gate-result-and-human-checklist|14.4.4]] as a follow-up outside that task; still open, no task claims it |
| `"{count} products"` with no plural form | flagged by `14.4.4` as a follow-up; still open, no task claims it |
| `merchantDashboardSalesEmpty` dictionary key: present in `pt-BR`/`en` and asserted by `(merchant)/page.test.tsx`, but no production `.tsx` renders it (dead key) | discovered by this task's grep sweep; out of F03's `Owns` (dictionaries), reported as a new gap for the next dictionary-owning task |
| Rendered-parity harness (screenshot/DOM comparison replacing hash-record proof) | proposed epoch step 1, not yet a task; `pop/specs/application-frontend-system.md` "Evidence protocol" still describes the hash-record proof only |
| Domain component families beyond what `12.2.4`/`14.2.4` delivered (full badge families were already closed) | no further gap found in the six audit files beyond what is listed above |

## Gaps this task itself created

None. `14.7.1` F03 performed CSS deletion and contract documentation only; every migration requiring a component API change (the one case, `.auth-brand`) was already refused by F02 and is carried into the "Open" table above, not repeated as a new gap.
