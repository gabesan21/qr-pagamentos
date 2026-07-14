# Spec - Administrative foundation

- **Project:** [[categories/applications/qr-pagamentos/PROJECT|QR Pagamentos]]
- **Epoch/Phase:** [[categories/applications/qr-pagamentos/roadmap/1-administrative-foundation|Epoch 1]]
- **Status:** rascunho
- **Created:** 2026-07-13

## What it covers

This spec defines the reproducible runtime, local identity boundary, role model, global settings, and bilingual admin shell required before payment features are built.

## Requirements

- The application uses a pinned Node.js LTS release, pnpm lockfile, TypeScript, linting, automated tests, and a production build command.
- A clean self-hosted Docker environment starts PostgreSQL, applies all Prisma migrations once, and starts a non-root Next.js production container.
- Health checks distinguish database readiness, migration completion, and application availability.
- The database uses separate migration and runtime roles; the runtime role cannot perform DDL or role administration.
- The deployment seed creates the first administrator without persisting plaintext credentials in Git or image layers.
- Authentication uses local credentials and first-party opaque sessions persisted in PostgreSQL.
- Session cookies are `HttpOnly`, `Secure` in production, `SameSite`, scoped to `Path=/`, and never stored in browser storage.
- Logout, account disablement, password change, and role change revoke affected sessions server-side.
- Authorization denies by default and is rechecked at every data read and mutation, not only in layouts or client components.
- Only administrators can manage users, roles, account status, currencies, and payment methods.
- The system prevents removal or demotion of the final active administrator.
- User DTOs never expose password hashes, session identifiers, secrets, or internal authorization fields.
- The admin shell provides equivalent `pt-BR` and English routes, dictionaries, metadata, validation, and error messages.
- The admin shell is responsive at 320 CSS pixels, keyboard operable, and meets WCAG 2.2 AA contrast and focus requirements.
- The visual system is commercially vibrant while never relying on color alone to communicate state.

## Out of scope

- Nautt credentials, provider orders, polling, and webhooks belong to [[categories/applications/qr-pagamentos/specs/nautt-finance-integration|Nautt Finance integration]].
- Product, payment-link, checkout, and storefront behavior belongs to later epochs.
- External identity providers and external authentication frameworks are excluded by product decision.

## Open

- Exact password policy, reset mechanism, and administrator recovery process.
- Idle and absolute session timeouts and the allowed number of concurrent sessions.
- Whether administrators require TOTP MFA before production.
- Initial currency and payment-method allowlists.
- Exact component library, typography, palette, dark-mode policy, and locale negotiation behavior.

## Related specs

- [[categories/applications/qr-pagamentos/specs/product-scope|Product scope]] - follow when an administrative decision changes the MVP boundary.
- [`AGENTS.md`](../AGENTS.md) - follow before changing the root application structure or DOX contracts.
