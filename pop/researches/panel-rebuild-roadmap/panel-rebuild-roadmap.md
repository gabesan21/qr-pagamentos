# Panel rebuild roadmap recon

- **Date:** 2026-07-23
- **Feeds:** [[ROADMAP|Roadmap]], Epochs 6–11, and every task materialized from this recon.
- **Method:** three read-only agent fronts inspected the current administrator surfaces, merchant/public commerce, and cross-cutting schema/security/deployment contracts; the principal reconciled their evidence against the existing specs and source. No web research, application code, assets, schema, or runtime state changed.

## Established current state

- Login always redirects to `/`, `requireOwnerFromCookie` accepts any authenticated principal, and the root page loads merchant Nautt, product, payment-link, checkout-policy, and storefront services for administrators. Role-exclusive panel behavior is therefore a critical prerequisite, not a navigation-only change.
- `/admin` is protected and bilingual but remains one long control page; its navigation exposes only Home, Orders, and Logout. There is no administrative dashboard, global link directory, user profile page, settings hub, or persistent sidebar.
- The merchant root is likewise a monolithic ledger of forms. There is no merchant dashboard, route-level product/link/settings workspace, sidebar, profile security area, or store-view action.
- Existing owner isolation, exact-decimal handling, opaque public identifiers, single-use settlement, capability polling, customer snapshots, and redacted order projections are valuable safety contracts to extend.
- Current products have bilingual text, one exact price, active/version state, and ownership, but no category, image, explicit store currency, or archive policy.
- Current payment links require exactly one product and one currency pair. Current visible orders require both a payment link and a product. Multi-item carts, fixed-value descriptions, and standalone payments therefore require additive compatible records and projections.
- Future migrations are additive-only and the 19 migrations through `20260721060000_storefront_settings` are immutable. Commerce V2 must preserve readable V1 links/orders rather than assume destructive normalization or data rewrites.
- Owner/admin order lists are read-only and capped at the most recent 50 records. They have no stable pagination, requested filters, provider UUID search, local operator outcome, or owner comment.
- Storefront settings currently contain only slug, bilingual display names, one accent color, and enablement. The public store renders cards that link to pre-existing single-product links; it has no cart, layout choice, logo, theme, default currency, or standalone-payment item.
- No upload/media service or durable media volume exists. The production app filesystem is read-only, so host-persistent media needs a dedicated writable mount, secure validation/serving, lifecycle rules, and install/update/backup coverage.
- The design system has one OS-selected light/dark pair and no manual theme selection; only a favicon exists. Six stable themes and a reusable logo asset family are new contracts.
- Email delivery, reset challenges, TOTP secrets, recovery codes, and MFA challenge routes do not exist. Email remains optional and must never become a login credential.

## Planning decisions

- The plan uses six new yolo epochs: secure foundation, merchant settings/catalog, Commerce V2 operations, public storefront/checkout, administrative operations, and identity/release closure.
- The prompt asks for six themes while naming only two light and two dark. The plan requires six stable themes with at least two light and two dark; the exact 3/3 or 4/2 composition is resolved in task 6.2.1 through contrast and product-fit evidence.
- Manual order finalization/cancellation is local operator metadata and never overwrites authoritative Nautt status. Task 8.1.1 fixes precedence, one-time-link effects, and audit semantics before persistence changes.
- Commerce V2 is additive and compatibility-first. Task 8.1.1 selects the exact new-table/bridge design, and tasks 8.1.2–8.1.3 implement it without editing immutable history.
- Public cart issuance uses a separate sessionless, rate-limited command that derives owner, products, prices, currency, and totals server-side. The merchant command remains authenticated and owner-scoped.
- Admin order and payment-link surfaces stay read-only. Merchant order actions are local-only and payment-link management never rewrites existing order snapshots.
- All new UI remains bilingual (`pt-BR`, `en`), responsive, keyboard operable, and token-driven across the six themes.

## Dependency and write-lane conclusions

- Critical path: 6.1.1 → 6.1.2 → 7.1/7.2 foundations → 8.1.1 → 8.1.2/8.1.3 → public/admin consumers → Epoch 11 verification.
- Logical parallel work begins with permission/spec reconciliation and dictionary modularization, then role enforcement, theme design, and media storage can proceed as an isolated wave.
- Prisma schema, safe migrations, grants, and database tests are one serialized write lane even when tasks are logically independent.
- `compose.yaml`, container/install/update/runbook changes are one serialized operations lane.
- `globals.css`, `DESIGN.md`, token checks, shared component inventory, and browser evidence are one visual integration lane.
- Domain-split dictionaries must land before feature UIs run in parallel; otherwise `pt-BR` and `en` files serialize every UI task.
- Closed public rate-limit and request-log route inventories serialize new public API integration unless one task owns their final merge.

## Recon to resolve inside planned tasks

- **Currency semantics:** map BRL/ARS/BOB/COP to Nautt currency/exchange UUIDs and define behavior when an in-use currency is disabled — resolved before 7.1.1 implementation.
- **Commerce compatibility:** select new tables versus a bridge projection and prove V1 identifiers/orders remain readable — resolved by 8.1.1.
- **Manual state:** define local finalize/cancel precedence, one-time consumption, later provider reconciliation, and audit evidence — resolved by 8.1.1.
- **Metrics:** define active user, abandoned/finalized order, reporting timezone/windows, historical USD/USDT source, top-owner/product ranking, and soft-deleted-owner treatment — resolved by 10.1.1.
- **Soft deletion:** define retention, identifier reuse, recovery, credential/webhook behavior, public resource withdrawal, and historical attribution — resolved by 10.3.1.
- **Images:** fix accepted formats, encoded/decoded limits, ideal product/logo dimensions, quotas, orphan grace, and backup ownership — resolved by 6.3.2.
- **Reset/MFA:** fix SMTP/relay configuration, public origin, token TTL/rates, TOTP scope, recovery, secret encryption, and administrator recovery authority — resolved by 11.1.1 and 11.1.3.
- **Store-disabled behavior:** reconcile store disabled versus standalone-payment-only routing and enablement constraints — resolved by 7.1.2 before public routes.
