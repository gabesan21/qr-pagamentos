# Epoch 5 - Storefront and production

- **Project:** [[PROJECT|QR Pagamentos]] - read for local identity, authorization, i18n, runtime, and secret constraints.
- **Roadmap:** [[ROADMAP|Roadmap]] - read for epoch boundaries.
- **Status:** concluída
- **Yolo:** sim
- **Description:** Add the optional public storefront, visual customization, hardening, observability, and production release.

## Recon and decisions

- At epoch start, public surfaces were only `/pay/[identifier]` and its API; the completed epoch adds the opt-in storefront, headers/origin checks, public API rate limiting, structured request logging, and operator release documentation. Runtime release exercises remain explicitly skipped by user direction in [[docs/release-evidence|Release evidence]].
- Storefront is opt-in per owner: disabled by default, an owner publishes a public store page under a unique slug listing their active products; a product appears only with at least one active payment link, and the public contract stays redacted like the existing public link boundary.
- Visual customization is deliberately minimal: bilingual store display name plus one brand accent color applied to the storefront. No logo upload (avoids binary storage); checkout `/pay` pages keep the platform design system.
- Hardening assumes the documented self-hosted single-instance topology: in-memory rate limiting is sufficient; security headers live in `next.config.ts`; mutation routes gain origin verification. No audit-log table in this epoch.
- Observability stays first-party (no new vendor deps): structured JSON server logging with request ids on mutation/API routes; `/api/health` keeps its exact `{"status":"ok"}` contract.
- Production release closes with a runbook (TLS reverse proxy, backups, upgrade) and a full evidence run; deployment mechanics themselves are already owned by `install/` and `container/`.
- Every new UI surface is bilingual (`pt-BR`, `en`) with dictionary parity tests; no new locale.

## Phase 5.1 — Storefront settings and customization

- **Status:** concluída
- **Description:** Let each owner configure and enable their storefront: unique slug, bilingual display name, and brand accent color.
- **Specs:** [[specs/product-scope|Product scope]] (new spec `storefront-and-customization` drafted in the first task)

| Task | Description | Status |
|------|-------------|--------|

## Phase 5.2 — Public storefront

- **Status:** concluída
- **Description:** Publish the opted-in owner's redacted bilingual storefront page linking active products to checkout.
- **Specs:** [[specs/product-scope|Product scope]], storefront spec from 5.1

| Task | Description | Status |
|------|-------------|--------|

## Phase 5.3 — Hardening

- **Status:** concluída
- **Description:** Add security headers, mutation origin verification, and bounded in-memory rate limiting for public endpoints.

| Task | Description | Status |
|------|-------------|--------|

## Phase 5.4 — Observability

- **Status:** concluída
- **Description:** Add first-party structured JSON server logging with request ids, preserving the exact health contract.

| Task | Description | Status |
|------|-------------|--------|

## Phase 5.5 — Production release

- **Status:** concluída
- **Description:** Document TLS proxy, backup, and upgrade operations and record the release evidence ledger; runtime release exercises were skipped by explicit user direction.

| Task | Description | Status |
|------|-------------|--------|
