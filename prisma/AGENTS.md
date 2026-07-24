# Prisma database contract

- Scope: `schema.prisma`, admin bootstrap SQL, and versioned migration history.
- Read the repository-root [`AGENTS.md`](../AGENTS.md) before editing this subtree.
- [`../specs/administrative-foundation.md`](../specs/administrative-foundation.md) — follow when a database or health-boundary decision changes.

## Boundaries

- Keep `MIGRATION_DATABASE_URL` exclusive to Prisma migration commands.
- Never use `DATABASE_URL` for DDL, migration metadata, or role administration.
- Never commit passwords, usable URLs, generated clients, database dumps, or seed data.
- Keep schema `app` owned by `qr_migrator`; `qr_runtime` receives only demonstrated DML and sequence use.
- Keep bootstrap's ordinary-table DML defaults, but never remove the relation-guarded post-grant normalization for `app.global_payment_settings`; its forward migration repairs databases where the table already exists.
- Never remove the relation-guarded bootstrap revocation of runtime `DELETE` on `app.product_category`; categories are retained and deactivated, never physically deleted by the application.
- Never remove the relation-guarded bootstrap revocation of runtime `DELETE` on `app.catalog_currency_pair`; currency pairs are retained immutable history and are never physically deleted or remapped in place by the application.
- `app.supported_exchange_currency` is the sole single-active pointer authority for code-based exchange-currency eligibility: one row per code (primary key), `pair_id` unique with a restrictive FK to `catalog_currency_pair`, and the `AAA`–`ZZZ` bounds check as defense-in-depth behind service-boundary format validation; pointer-table `DELETE` (deactivation) is legitimate configuration mutation, but never weaken the pair FK, the pair-id uniqueness, or the bounds check.
- Never grant runtime schema `CREATE`, object ownership, migration-table access, role membership, `TEMPORARY`, or role-administration attributes.
- `../container/bootstrap.mjs` must execute `prisma/bootstrap.sql` unchanged before assigning externally supplied role passwords; never duplicate role/grant SQL in a wrapper or Compose init directory.
- `../container/migrate.mjs` is the only production migration wrapper and must use only `MIGRATION_DATABASE_URL` with `prisma migrate deploy`.

## Schema and migrations

- `schema.prisma` is the declared application model; database-only checks must also exist in reviewed migration SQL.
- The 19 directories through `20260721060000_storefront_settings` are an immutable baseline pinned by ID and SHA-256 in `migration-policy-baseline.json` and by the verifier's independent reviewed inventory digest; never add, remove, reorder, rename, or edit them.
- Every later migration directory must sort after the baseline and contain only canonical `migration.safe.json` plus its byte-exact generated `migration.sql`.
- Create future SQL only with `node pop/scripts/migration-policy.mjs generate <migration.safe.json>` and verify the complete history with `pnpm db:migration-policy`.
- Future manifests may only create tables, add columns (non-null requires a typed constant default), create indexes, add/validate typed constraints, and grant/revoke closed privileges.
- Never represent raw SQL/expressions, destructive DDL/DML, rename/type change, backfill, transaction control, functions, triggers, extensions, or concurrent/nontransactional operations in a future migration.
- Never use `db push`; create and review a new versioned migration instead.
- Keep deterministic names for database constraints that verification asserts.
- `nautt_credential.credential_revision` is the collision-proof UUID identity for credential CAS and registration claims; never replace it with `updated_at` or read ciphertext before an exact revision claim.
- `provider_quote` claim and `provider_order` creation are one transaction; never split them or weaken the composite owner FK.
- Provider monetary lexemes remain text protected by database checks; reconciliation must match owner, local ID, provider UUID, version, and current state in one conditional write.
- Webhook delivery UUIDs are globally unique and owner-bound; never store raw bodies/signatures/secrets, weaken the optional composite owner/order FK, or allow runtime privileges beyond delivery/attempt DML and attempt-sequence usage.
- A delivery claim must serialize attempt numbering, terminal replay, live-lease exclusion, and expired-lease recovery; its processing lease must outlive the accepted request-work budget, and finalization must match the current processing attempt so an expired worker is fenced. Preserve terminal evidence when reclaiming the expired attempt. Never hold its transaction across provider I/O or finalize before authoritative reconciliation succeeds.
- Recovery evidence is distinct from intake evidence: only `RECOVERY` may have a null payload digest, and it must carry the provider webhook UUID, delivery flags, and positive provider attempt. Never weaken the intake digest invariant or overwrite a known delivery UUID.
- Explicit history recovery uses one 30-second owner/order-bound fenced lease. Never hold its transaction across history/order reads, let a stale token insert/complete, or grant runtime privileges beyond lease-table DML.
- The foundation fixture is infrastructure proof only; never attach domain semantics or routes to it.
- `deployment_bootstrap` is an immutable no-FK locator for the originally seeded UUID; never retarget it, add a user FK, or make it block ordinary user mutation/deletion.
- `user.profile_version` is the merchant identity CAS only; keep it
  nonnegative and never reuse `updated_at` for profile conflict detection.
- The store-settings extension on `app.user` (`storefront_theme_id`, `storefront_layout`, `storefront_logo_media_identifier`, `storefront_standalone_payments_enabled`, `storefront_default_currency_code`) is additive-only: the theme/layout closed-set checks mirror the design-system six themes and `boxed`/`table`, the currency code reuses the `AAA`–`ZZZ` bounds check as defense-in-depth behind service-boundary format validation, and the logo identifier is an opaque 43-character handle with **no** foreign key to `media_object` (media rows are physically purged after grace) — never add that FK, tighten the bounds check into a regex, or backfill existing rows.

## Verification

- Run `pnpm db:generate` after schema changes.
- Run `pnpm db:test` only against its self-created disposable PostgreSQL container.
- Run `pnpm db:contract-check` after changing this subtree or database documentation; it runs the offline policy and adversarial fixtures first.
- Run `pnpm container:contract-check` after changing bootstrap/migration container routing.
