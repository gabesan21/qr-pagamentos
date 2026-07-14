# Prisma database contract

- Scope: `schema.prisma`, admin bootstrap SQL, and versioned migration history.
- Read the repository-root [`AGENTS.md`](../AGENTS.md) before editing this subtree.
- [`../specs/administrative-foundation.md`](../specs/administrative-foundation.md) — follow when a database or health-boundary decision changes.

## Boundaries

- Keep `MIGRATION_DATABASE_URL` exclusive to Prisma migration commands.
- Never use `DATABASE_URL` for DDL, migration metadata, or role administration.
- Never commit passwords, usable URLs, generated clients, database dumps, or seed data.
- Keep schema `app` owned by `qr_migrator`; `qr_runtime` receives only demonstrated DML and sequence use.
- Never grant runtime schema `CREATE`, object ownership, migration-table access, role membership, `TEMPORARY`, or role-administration attributes.
- `../container/bootstrap.mjs` must execute `prisma/bootstrap.sql` unchanged before assigning externally supplied role passwords; never duplicate role/grant SQL in a wrapper or Compose init directory.
- `../container/migrate.mjs` is the only production migration wrapper and must use only `MIGRATION_DATABASE_URL` with `prisma migrate deploy`.

## Schema and migrations

- `schema.prisma` is the declared application model; database-only checks must also exist in reviewed migration SQL.
- Treat every directory under `migrations/` as immutable after application outside a disposable test database.
- Exception: task `1.2.2-establish-local-identities` may rewrite only `20260714190000_local_identities` after explicit human confirmation that it is unshipped and every non-disposable database with the old checksum will be purged; this does not authorize any later in-place rewrite.
- Never use `db push`; create and review a new versioned migration instead.
- Keep deterministic names for database constraints that verification asserts.
- The foundation fixture is infrastructure proof only; never attach domain semantics or routes to it.
- `deployment_bootstrap` is an immutable no-FK locator for the originally seeded UUID; never retarget it, add a user FK, or make it block ordinary user mutation/deletion.

## Verification

- Run `pnpm db:generate` after schema changes.
- Run `pnpm db:test` only against its self-created disposable PostgreSQL container.
- Run `pnpm db:contract-check` after changing this subtree or database documentation.
- Run `pnpm container:contract-check` after changing bootstrap/migration container routing.
