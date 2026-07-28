# F05 — Administrator recovery policy

## What and why

Give administrators a fail-safe, auditable way to disable TOTP for a merchant who has lost authenticator access, without exposing secrets or bypassing authorization.

## Boundaries and invariants

- Only active `ADMIN` principals can invoke recovery.
- Target must exist and not be soft-deleted; otherwise the outcome is opaque not-found.
- Action appends exactly one `totp_recovery_action` audit row and revokes every session of the target.
- The route returns empty `401`/`403` for unauthorized callers and opaque `/admin/accounts/[id]?editor=totp-disabled|failed` redirects otherwise.
- Recovery does not reset passwords, read secrets, or expose TOTP state to unauthorized callers.

## Work

1. Create `src/auth/admin-totp-recovery.ts` service.
2. Add `POST /admin/users/[id]/totp-disable` route.
3. Add request-log entry and route/service tests.

## Owns

- `src/auth/admin-totp-recovery.ts`, `src/auth/admin-totp-recovery.test.ts`
- `src/app/admin/users/[id]/totp-disable/route.ts`, `src/app/admin/users/[id]/totp-disable/route.test.ts`
- `src/observability/server-request-log.ts`

## Verification

- `pnpm test src/auth/admin-totp-recovery.test.ts src/app/admin/users/[id]/totp-disable/route.test.ts`
