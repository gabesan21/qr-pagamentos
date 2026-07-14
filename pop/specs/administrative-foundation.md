# Spec - Administrative foundation

- **Project:** [[PROJECT|QR Pagamentos]]
- **Epoch/Phase:** [[roadmap/1-administrative-foundation|Epoch 1]]
- **Status:** aprovada
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
- Every user has a required unique normalized username; username and password are the only login credentials. Email is optional profile/contact data and is never accepted as a login identifier. Public registration is disabled and administrators create later user accounts.
- Passwords accept 12 to 128 characters without composition rules; the deployment operator can securely recover the initial administrator from the server without email delivery.
- The closed role set is `ADMIN` and `USER`.
- Session cookies are `HttpOnly`, `Secure` in production, `SameSite=Lax`, scoped to `Path=/`, and never stored in browser storage.
- Sessions expire after 30 minutes of inactivity or 12 hours absolutely, and each user can have at most five concurrent sessions.
- Logout, account disablement, password change, and role change revoke affected sessions server-side.
- Authorization denies by default and is rechecked at every data read and mutation, not only in layouts or client components.
- Only administrators can manage users, roles, account status, currencies, and payment methods.
- The system prevents removal or demotion of the final active administrator.
- User DTOs never expose password hashes, session identifiers, secrets, or internal authorization fields.
- The admin shell provides equivalent `pt-BR` and English dictionaries, metadata, validation, and error messages, resolving the language transparently from the persisted user preference without locale-prefixed URLs.
- The admin shell is responsive at 320 CSS pixels, keyboard operable, and meets WCAG 2.2 AA contrast and focus requirements.
- The visual system is commercially vibrant while never relying on color alone to communicate state.

## Out of scope

- Nautt credentials, provider orders, polling, and webhooks belong to [[specs/nautt-finance-integration|Nautt Finance integration]].
- Product, payment-link, checkout, and storefront behavior belongs to later epochs.
- External identity providers and external authentication frameworks are excluded by product decision.
- Email-based password reset and administrator TOTP MFA are deferred until after the currently planned roadmap.

## Open

- Initial currency and payment-method allowlists.
- Exact component library, typography, palette, and dark-mode policy.
- Default language before a user preference exists and whether browser negotiation seeds that preference.

## Implemented slices

- [[1.1.1-scaffold-next-platform]] (2026-07-14) — pinned Node.js 24.18.0 and pnpm 11.13.0; added the typed Next.js baseline, frozen dependency graph, independent quality gates, explicit `pt-BR`/`en` routes and dictionary parity, and application-only `/api/health`. Database, migration, and container readiness remain pending in Phase 1.1, so this spec remains approved rather than fully implemented.
- [[1.1.2-establish-prisma-database]] (2026-07-14) — pinned Prisma 7.8.0 and PostgreSQL 18.4 contracts; added a reviewed fixture-only migration, isolated schema-owning migrator and least-privilege runtime roles, secret-free connection boundaries, and disposable executable replay/constraint/CRUD/denial probes. Production Compose readiness and ordered startup remain pending in 1.1.3, so this spec remains approved.
- [[1.1.3-containerize-self-hosted-runtime]] (2026-07-14) — added pinned non-root production images, ordered PostgreSQL/bootstrap/migration/runtime startup, file-backed least-grant secrets, loopback-only configurable application publication, clean-clone container contracts, and privilege-free install/uninstall procedures. Integrated Docker installation passed human critical verification; later identity and admin phases remain pending, so this spec remains approved.
- [[1.2.1-review-clean-code-baseline]] (2026-07-14) — reviewed nine Phase 1.1 code surfaces; hardened quoted environment/published-port parsing, removed the installer's undeclared host `curl` dependency, and removed redundant container secret staging. All database-free, disposable database, installer, and seven clean-clone container gates passed independently; identity and admin requirements remain pending, so this spec remains approved.

## Planned slices

- Phase 1.3 candidate `1.3.1-user-language-preference` — persist each user's `pt-BR` or `en` preference and remove locale prefixes from application URLs; planning must decide the deterministic fallback before a preference exists.

## Related specs

- [[specs/product-scope|Product scope]] - follow when an administrative decision changes the MVP boundary.
- [`AGENTS.md`](../AGENTS.md) - follow before changing the root application structure or DOX contracts.
