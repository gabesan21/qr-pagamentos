# Spec - Administrative foundation

- **Project:** [[PROJECT|QR Pagamentos]]
- **Epoch/Phase:** [[roadmap/1-administrative-foundation|Epoch 1]]
- **Status:** implementada
- **Implementation:** partial
- **Created:** 2026-07-13

## What it covers

This spec defines the reproducible runtime, local identity boundary, role model, global settings, and bilingual admin shell required before payment features are built.

## Requirements

- The application uses a pinned Node.js LTS release, pnpm lockfile, TypeScript, linting, automated tests, and a production build command.
- A clean self-hosted Docker environment starts PostgreSQL, applies all Prisma migrations once, and starts a non-root Next.js production container.
- A bare `install/update.sh` updates an existing installer-managed deployment from its clean attached branch by fast-forwarding to the latest protected tracked-upstream commit and binding its one-time handoff, policy gate, candidate images, migration proof, and promoted app to that exact SHA; backup and previous-release inputs are neither required nor accepted.
- Update fails closed on unsafe Git state, incompatible Compose ownership or volume mounting, an unhealthy existing app, missing secret artifacts, or Nautt-key discontinuity, and never generates or rewrites secrets or replaces the PostgreSQL volume.
- The 19-migration baseline is immutable and pinned by exact IDs and SHA-256 values. Every future migration is canonical manifest-generated SQL in a closed language that can only add data-preserving tables, columns, indexes, typed constraints, and privileges; destructive DDL/DML, data rewrites, raw SQL, renames, and type changes are inexpressible.
- Migration policy verification runs before managed build or database mutation in an already-present digest-pinned Docker image with no network, database, secret, or writable-source access.
- The healthy old app remains running through candidate build and a fresh migration run. Prisma migration IDs, checksums, completion, rollback and failure metadata must prove success, and identity seed must finish, before the exact-revision target app is recreated; migration failure retains the old app, volume, key, logs, and protected redacted evidence.
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
- Before an administrative screen is implemented, Phase 1.3 establishes a reusable admin design-system foundation with a single named visual tone, a documented real-world reference, and explicit banned defaults in `DESIGN.md`.
- The design system defines semantic tokens for color, spacing, radius, shadow, and type; raw visual values outside its token source are rejected by lint, and theme changes modify tokens rather than components.
- `DESIGN.md` records the token contract, typography, spacing rhythm, component-state rules, and composition limits; it is updated with every approved visual decision.
- The initial primitive inventory prevents duplicate component variants. Each admin component documents and supports default, loading, empty, error, hover/focus, and disabled states as applicable.
- Every Phase 1.3 frontend task records the mandatory UI workflow in its card: `ui-change` during implementation and `ui-review` during verification, together with the applicable supporting UI/UX skills.

## Panel architecture and permissions

`ADMIN` and merchant `USER` are mutually exclusive business personas. Shared
means only session, login/logout, persisted locale, and common visual sources;
it never grants a business read, mutation, shell, navigation entry, or fallback
to the other role. Every protected read and mutation resolves an active cookie
principal before owner-scoped work. `/` is the compatibility entry: it resolves
the role before merchant work, sends `ADMIN` to `/admin`, and sends an active
`USER` to the merchant dashboard. An administrator may never enter a merchant
route, call an owner-scoped service as the owner, or perform a merchant
mutation. This prohibition preserves explicitly approved administrator-only
global read projections for orders, payment links, and analytics; those
projections remain read-only, re-authorized, redacted, and separate from
merchant routes and owner-scoped services.

Shared data directories use one bounded contract without sharing a business
projection. The only entry points receive an already-resolved active principal:
`USER` derives its own owner scope and `ADMIN` derives an explicit global-read
scope, with exact role denial before adapter I/O. Each registered directory
fixes redacted row DTOs, at most eight text/closed-enum filters, page sizes
25/50/100, and an immutable lexicographic order ending in a unique ID. Adapters
request only `pageSize + 1`; offset, total count, arbitrary sorting, raw query
fragments, client-side full-list filtering, and cross-request snapshot claims
are excluded.

Directory request targets are limited to 2048 exact raw UTF-8 bytes before form
decoding and then strictly decode well-formed percent escapes and fatal UTF-8.
They accept at most 32 entries and serialize valid input in one fixed canonical
order. A valid noncanonical native GET receives one same-path relative `307`
before data I/O; invalid input receives the generic reset state without echo.
Keyset cursors have a separate 512 decoded-byte bound and authenticate a closed,
non-identifying `MERCHANT_OWN`/`ADMIN_GLOBAL` purpose, directory, direction,
size, filter digest, order, and tuple. HKDF/HMAC keys are domain-separated from
the required server key and include the resolved merchant identity only in
server-side derivation; no identity enters the token, and every request still
re-authorizes and reapplies scope.

| Route family | Canonical owner and capability | Unauthenticated / wrong role | Compatibility boundary |
| --- | --- | --- | --- |
| `/`, merchant dashboard, catalog/products, payment links, owner orders, checkout policy, Nautt credentials, storefront settings, and merchant profile/security | `USER` only; own business data and settings | page: `/login` / `/admin`; mutation: empty `401` / empty `403` | Merchant routes stay unprefixed. Owner scoping, redacted projections, opaque unavailable outcomes, and existing V1 identifiers remain unchanged. |
| `/admin`, `/admin/orders`, users/roles/status, global payment settings, currency pairs, payment methods, and planned administrator dashboard, global catalog/link directory, analytics, and system settings | `ADMIN` only; global operator data and configuration, including approved protected read-only global projections | page: `/login` / `/`; mutation: empty `401` / empty `403` | Panel routes stay under `/admin`; global order, payment-link, and analytics projections never grant an owner mutation or reuse a merchant route/service. |
| `/admin-access` | retained administrator authorization probe; no business capability | empty `401` when no active principal resolves, including missing, expired, revoked, or disabled sessions; empty `403` only for an active `USER`; empty `204` for active `ADMIN` | This unprefixed compatibility endpoint is the sole non-panel administrative route exception. It never redirects, reads business data, or mutates state. |
| `/admin/users/[id]/nautt-credentials` | retired denial-only endpoint; no role owns this mutation | empty `401` for unauthenticated; empty `403` for either authenticated role | It has no redirect or successor, parses no target or key, and performs no credential/provider work. A `USER` manages only its own credential through the merchant route family. |
| `/login`, `/login/submit`, `/logout`, `/language-preference` | shared authentication/session or self-only preference | existing generic authentication and opaque mutation outcomes | URLs remain unprefixed; login success dispatches through `/`, and preference never targets another principal. |
| `/pay/[identifier]`, `/store/[slug]`, `/api/payment-links/[identifier]*`, `/api/nautt/webhooks`, `/api/health` | sessionless public/protocol surface; no panel capability | their existing public/protocol outcomes | Never route through either panel or alter public identifiers, rate limits, callback rules, response shapes, or no-store/opaque semantics. |
| `/[lang]/*` legacy UI and mutation stubs | permanently absent | `404` for every visitor | Persisted `pt-BR`/`en` selection remains unprefixed; no locale-prefixed compatibility redirect is introduced. |

The fixed authenticated page map is:

| Persona | Page areas |
| --- | --- |
| `ADMIN` | Dashboard `/admin`; orders `/admin/orders`; payment-link scaffold `/admin/payment-links`; users `/admin/accounts`; settings `/admin/settings` |
| `USER` | Dashboard `/`; orders `/orders`; links `/links`; products `/catalog`; settings `/settings` |

Every page and role layout re-authorize the cookie principal before role-owned
work. Existing mutation endpoints remain `/admin/users*`,
`/admin/payment-settings`, `/admin/catalog/*`, `/products`, `/payment-links*`,
`/checkout-policy`, `/storefront`, `/nautt-credentials*`, and
`/language-preference`; no page shadows them. The dashboard and global
payment-link areas are honest scaffolds and call no unapproved projection.
Nested order pages inherit only their role shell.

`/profile` is secondary to the five merchant business links and reads only the active merchant's username, nullable contact email, and profile version. Identity updates use own-user CAS, retain sessions, map stale/unique collisions to one conflict, and map invalid/unavailable input to failure. Every parsed password attempt performs exactly one fixed verification scrypt, using forced-false dummy work for malformed or unavailable records. Sign-in, admin reset, and merchant rotation share one per-user transaction lock; successful rotation conditionally replaces the observed credential, revokes every session atomically, expires the cookie, and returns `/login?password=changed`. Email remains contact-only and never enters sign-in or public projections.

## Out of scope

- Nautt credentials, provider orders, polling, and webhooks belong to [[specs/nautt-finance-integration|Nautt Finance integration]].
- Product, payment-link, checkout, and storefront behavior belongs to later epochs.
- External identity providers and external authentication frameworks are excluded by product decision.
- Email-based password reset and administrator TOTP MFA are deferred until after the currently planned roadmap.

## Open

- The self-updating and closed-migration contract is integrated in stage 004 but remains partial until independent critical verification and task closeout.

## Implemented slices

- [[7.3.1-build-merchant-profile-management]] (2026-07-24) — added the active-merchant-only secondary `/profile` area, dedicated identity CAS, opaque uniqueness mapping, exactly-one verification-scrypt failure shape, shared sign-in/admin/rotation serialization, atomic credential replacement and complete session revocation, and the finite bilingual native route/UI contract.
- [[1.1.1-scaffold-next-platform]] (2026-07-14) — pinned Node.js 24.18.0 and pnpm 11.13.0; added the typed Next.js baseline, frozen dependency graph, independent quality gates, explicit `pt-BR`/`en` routes and dictionary parity, and application-only `/api/health`. Database, migration, and container readiness remain pending in Phase 1.1, so this spec remains approved rather than fully implemented.
- [[1.1.2-establish-prisma-database]] (2026-07-14) — pinned Prisma 7.8.0 and PostgreSQL 18.4 contracts; added a reviewed fixture-only migration, isolated schema-owning migrator and least-privilege runtime roles, secret-free connection boundaries, and disposable executable replay/constraint/CRUD/denial probes. Production Compose readiness and ordered startup remain pending in 1.1.3, so this spec remains approved.
- [[1.1.3-containerize-self-hosted-runtime]] (2026-07-14) — added pinned non-root production images, ordered PostgreSQL/bootstrap/migration/runtime startup, file-backed least-grant secrets, loopback-only configurable application publication, clean-clone container contracts, and privilege-free install/uninstall procedures. Integrated Docker installation passed human critical verification; later identity and admin phases remain pending, so this spec remains approved.
- [[1.2.1-review-clean-code-baseline]] (2026-07-14) — reviewed nine Phase 1.1 code surfaces; hardened quoted environment/published-port parsing, removed the installer's undeclared host `curl` dependency, and removed redundant container secret staging. All database-free, disposable database, installer, and seven clean-clone container gates passed independently; session, access-control, and admin-management requirements remain pending, so this spec remains approved.
- [[1.2.2-establish-local-identities]] (2026-07-15) — delivered required normalized unique usernames as the sole login identifier, nullable canonical unique email profile data, password credentials with the pinned scrypt record contract, and closed `ADMIN`/`USER` plus `ACTIVE`/`DISABLED` states. The explicitly unshipped local-identity baseline migration now enforces least-privilege identity invariants; deployment creates the initial admin from file-backed inputs, and recovery remains UUID-targeted and password-only. Safe DTOs expose username and nullable email without hashes or secrets. Disposable database, clean-clone seed/recovery, installer, aggregate, static no-email-login, and human reset/fresh-install verification passed; sessions, authorization, and admin UI remain pending, so this spec remains approved.
- [[1.2.3-implement-database-sessions]] (2026-07-16) — aligned project and container pins with Node.js 26.4.0 and pnpm 11.3.0, retaining the amd64 digest-pinned Node image. Added PostgreSQL-backed opaque sessions with SHA-256 digest-only storage, user-cascade deletion, 30-minute idle and 12-hour absolute expiry, transactional five-session eviction, and server-side logout revocation. Locale-aware username/password forms post to first-party handlers, set HttpOnly/Lax/path-scoped cookies (Secure in production), and expose only generic authentication failures. Disposable migration/privilege probes, deterministic service/route tests, and aggregate quality gates passed; authorization and administrative UI remain pending, so this spec remains approved.
- [[1.2.4-enforce-access-control]] (2026-07-16) — added deny-by-default server authorization, role/status-aware safe user projections, authenticated access boundaries, session revocation, and transactional protection of the final active administrator. Deterministic authorization and route tests, the disposable database contract, and the aggregate quality gate passed; administrative design and management UI remain pending, so this spec remains approved.
- [[1.3.1-establish-admin-design-system]] (2026-07-16) — established the `PIX ledger` visual contract in `DESIGN.md`, light/dark semantic CSS tokens, reusable action/field/panel/status primitives, and a localized exercise route. A lint-integrated guard rejects raw visual values outside token sources, including unitless line-height; contrast and primitive tests plus the aggregate gate passed. Playwright was unavailable, so the documented no-capture fallback was used. User management, language preference, and global settings remain pending.
- [[1.3.2-user-language-preference]] (2026-07-16) — added nullable constrained persisted `pt-BR`/`en` preferences, atomic server-side first-sign-in negotiation with `pt-BR` fallback, and authenticated explicit preference changes that cannot target another user. UI and auth URLs are unprefixed; legacy locale-prefixed surfaces return 404 while `/api/health` remains unlocalized. Database replay/privilege probes, focused concurrency/authorization/route/dictionary/control tests, and the aggregate gate passed; Playwright remains unavailable for capture execution.
- [[1.3.3-manage-administrative-users]] (2026-07-16) — delivered an unprefixed localized `/admin` shell and server-authorized account creation, password, role, and status management. Exact protected-route and opaque unknown-target responses prevent data disclosure; final-active-administrator protection remains transactional. Service, route, page, dictionary, aggregate, and static database-contract gates passed; the disposable Docker test is environment-blocked by socket permission.
- [[1.3.4-manage-global-payment-settings]] (2026-07-16) — delivered the singleton, administrator-managed `BRL` currency and `PIX` payment-method allowlists, constrained to that initial closed catalog and exposed through the localized `/admin` shell. Server-side authorization, opaque protected outcomes, migration/replay/privilege contracts, focused service/route/page/dictionary tests, and the aggregate gate cover the delivered scope; no additional catalog values or payment-provider integration are included.
- [[1.4.1-repair-login-submit-reliability]] (2026-07-16) — reproduced the production `/login/submit` failure and repaired PostgreSQL advisory-lock execution without deserializing its `void` result. Real Compose coverage now proves valid and invalid login, cookie attributes, locale persistence, and opaque infrastructure failures. The hardening pass also removed inherited write privileges from the global-settings singleton through a forward migration and guarded bootstrap replay normalization, refreshed the exact Node image index pin across all consumers, and added deterministic pin-consistency coverage. Disposable database replay, database/container contracts, installer checks, clean-clone login, and the aggregate gate passed.
- [[1.4.2-rebuild-design-system-with-shadcn]] (2026-07-16) — replaced the temporary custom-only primitives with one owned Radix/nova shadcn source system, locally bundled IBM Plex Sans, semantic token aliases, deprecated compatibility adapters, and an unprefixed localized specimen. The production evidence runner captures and hashes all eight light/dark responsive cases with automated axe, target, font, focus, overflow, action, status-cue, and prose assertions.
- [[1.4.3-redesign-login-experience]] (2026-07-17) — recomposed the unauthenticated `/login` presentation exclusively from the owned shadcn inventory while preserving username/password-only sign-in, the unprefixed route and `/login/submit` POST contract, opaque generic invalid-credential recovery, and persisted-locale bilingual behavior. Focused contract tests (including a static source-import inventory and bilingual copy parity), an eight-capture run-bound production browser evidence pass with manifest-bound review, and the aggregate quality gate passed. Its detached `useFormStatus` advisory was recorded for and resolved by the final Phase 1.4 hardening slice.
- [[1.4.4-refactor-admin-surfaces-onto-design-system]] (2026-07-17) — decomposed the bilingual `/admin` shell into direct owned-source compositions while keeping authorization and safe DTO reads server-only and preserving every account, final-active-admin, BRL/PIX, locale, logout, and opaque mutation route contract. The authenticated home, notices, locale controls, and submit states now share the same inventory; ruled account sections remain operable without document overflow at 320px, and destructive demotion/disablement values require an inline confirmation before the unchanged native POST. Authenticated production evidence covers both themes at four widths with keyboard, target, font, status, overflow, external-request, and serious/critical axe assertions.
- [[1.4.5-audit-and-harden-epoch1-code-and-ui]] (2026-07-17) — closed the login pending advisory with native click/Enter browser evidence; made every authenticated read and preference mutation status-aware; preserved unexpected admin read failures for the recovery boundary; equalized unknown-username password verification work; removed vendored-tool lint noise; and repaired the identity-seed clean-clone reset to include session relations. Database, installer, image, all ten clean-clone scenarios, aggregate quality, and fresh manifest-bound design-system/login/admin evidence passed with no S2-S4 finding left open.
- [[M-1.1-safe-docker-update-script]] (2026-07-22) — added a dedicated guarded update command for compatible installer deployments. It proves Compose ownership and exact database-volume mounting, validates source/staged Nautt-key continuity without rewriting secrets, writes protected secret-free rollback evidence before build, rechecks the volume and layered startup gates after deployment, and has deterministic refusal coverage plus an isolated install→update→update container scenario.
- [[M-2.1-self-updating-safe-migrations]] (2026-07-22) — stage-004 implementation replaces the checked-out-release and backup-reference workflow with protected-upstream fast-forward/self-reexec, an immutable 19-migration baseline plus closed generated future migrations, secret-free offline policy verification, and exact-revision migrate-before-app promotion. Independent critical verification and closeout remain pending, so implementation is partial.

## Related specs

- [[specs/administrative-design-system|Administrative design system]] - follow when changing the shared shadcn sources, visual tokens, typography, component states, or browser evidence for Epoch 1 surfaces.
- [[specs/product-scope|Product scope]] - follow when an administrative decision changes the MVP boundary.
- [`AGENTS.md`](../AGENTS.md) - follow before changing the root application structure or DOX contracts.
