# Epoch 5 - Storefront and production

- **Project:** [[PROJECT|QR Pagamentos]] - read for local identity, authorization, i18n, runtime, and secret constraints.
- **Roadmap:** [[ROADMAP|Roadmap]] - read for epoch boundaries.
- **Status:** em andamento
- **Yolo:** sim
- **Description:** Add the optional public storefront, visual customization, hardening, observability, and production release.

## Recon and decisions

- No storefront, branding, rate limiting, security headers, audit, or structured logging exist today; public surfaces are only `/pay/[identifier]` and its API (`pop/memory/ recon 2026-07-21`). Install/container/Docker already cover deployment, seed, recovery, and rollback docs.
- Storefront is opt-in per owner: disabled by default, an owner publishes a public store page under a unique slug listing their active products; a product appears only with at least one active payment link, and the public contract stays redacted like the existing public link boundary.
- Visual customization is deliberately minimal: bilingual store display name plus one brand accent color applied to the storefront. No logo upload (avoids binary storage); checkout `/pay` pages keep the platform design system.
- Hardening assumes the documented self-hosted single-instance topology: in-memory rate limiting is sufficient; security headers live in `next.config.ts`; mutation routes gain origin verification. No audit-log table in this epoch.
- Observability stays first-party (no new vendor deps): structured JSON server logging with request ids on mutation/API routes; `/api/health` keeps its exact `{"status":"ok"}` contract.
- Production release closes with a runbook (TLS reverse proxy, backups, upgrade) and a full evidence run; deployment mechanics themselves are already owned by `install/` and `container/`.
- Every new UI surface is bilingual (`pt-BR`, `en`) with dictionary parity tests; no new locale.

## Phase 5.1 — Storefront settings and customization

- **Status:** pending
- **Description:** Let each owner configure and enable their storefront: unique slug, bilingual display name, and brand accent color.
- **Specs:** [[specs/product-scope|Product scope]] (new spec `storefront-and-customization` drafted in the first task)

| Task | Description | Status |
|------|-------------|--------|
| [[5.1.1-storefront-settings-and-customization]] | Add per-owner storefront settings (slug, bilingual display name, accent color, enabled flag) with schema migration and owner settings UI. · size: M | 001_initial_task |

## Phase 5.2 — Public storefront

- **Status:** pending
- **Description:** Publish the opted-in owner's redacted bilingual storefront page linking active products to checkout.
- **Specs:** [[specs/product-scope|Product scope]], storefront spec from 5.1

| Task | Description | Status |
|------|-------------|--------|
| [[5.2.1-public-storefront-page]] | Add the public `/store/[slug]` page listing active products with active payment links under the owner's branding, redacted and bilingual. · size: L | 001_initial_task |

## Phase 5.3 — Hardening

- **Status:** pending
- **Description:** Add security headers, mutation origin verification, and bounded in-memory rate limiting for public endpoints.

| Task | Description | Status |
|------|-------------|--------|
| [[5.3.1-security-headers-and-origin-checks]] | Add response security headers and origin verification on session and owner mutation routes. · size: M | 001_initial_task |
| [[5.3.2-public-endpoint-rate-limiting]] | Add bounded in-memory rate limiting to public checkout/storefront endpoints with opaque 429 outcomes. · size: M | 001_initial_task |

## Phase 5.4 — Observability

- **Status:** pending
- **Description:** Add first-party structured JSON server logging with request ids, preserving the exact health contract.

| Task | Description | Status |
|------|-------------|--------|
| [[5.4.1-structured-server-logging]] | Add a first-party JSON logger with request-id propagation on API/mutation routes, never logging secrets or customer snapshots. · size: M | 001_initial_task |

## Phase 5.5 — Production release

- **Status:** pending
- **Description:** Document TLS proxy, backup, and upgrade operations and run the full release evidence suite.

| Task | Description | Status |
|------|-------------|--------|
| [[5.5.1-production-runbook-and-release-evidence]] | Write the production runbook (TLS reverse proxy, backups, upgrade) and run install/container/full-gate evidence for the release. · size: M | 001_initial_task |
