---
author: user
created: 2026-07-13
---

# Project foundation decisions - 2026-07-13

- **Product boundary:** QR Pagamentos owns products, links, checkout, and storefront. Nautt Finance is limited to order opening, order queries/polling, and webhook delivery; Nautt payment links must never be used.
- **Success:** the MVP is complete when every scoped function is tested, functional, and deployable to production.
- **Stack:** Next.js full-stack with pnpm and Node.js LTS, Prisma, PostgreSQL, and self-hosted Docker.
- **Repository:** `included` PoP harness in `https://github.com/gabesan21/qr-pagamentos.git`; `main` is the final PR branch.
- **Delivery:** every phase is a yolo scope. Task branches merge into `develop`; the human tests the phase deliverable and merges `develop` into `main` before the next phase.
- **Identity:** authentication and simple session management are local first-party code without external authentication tools; deployment seed creates the first admin.
- **Nautt administrative identifiers:** `currency_uuid` and `exchange_currency_uuid` are stored in administrative configuration when the system is operating. The pricing endpoint is an allowed preparatory operation because it converts those identifiers into the `quote_uuid` required to open an onramp order; this refines the earlier integration boundary.
- **API key onboarding:** the user settings screen that stores the Nautt API key also queries and displays the authenticated user's main-wallet balance, token, and network; the endpoint is part of the Epoch 2 MVP.
- **Language:** project material and code comments use English; the application supports `pt-BR` and English.
- **Operations and style:** deployment is self-hosted Docker and the visual direction is commercially vibrant.
- **Isolation:** the project has no relationship to another project in the vault.
