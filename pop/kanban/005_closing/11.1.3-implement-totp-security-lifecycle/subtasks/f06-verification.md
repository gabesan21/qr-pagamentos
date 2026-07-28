# F06 — Verification and gates

## What and why

Prove that the TOTP lifecycle is correct, secure, and integrated without regressing existing identity, session, or installer contracts.

## Boundaries and invariants

- All service and route tests are deterministic and do not call external providers.
- Migration policy and disposable database checks pass before code is considered complete.
- Existing profile, login, and admin evidence suites must keep passing because this task does not change their UI contracts.

## Work

1. Run `pnpm test` for all new and touched test files.
2. Run `pnpm db:contract-check` and `pnpm db:test`.
3. Run `pnpm container:contract-check` and `install/test.sh`.
4. Run `pnpm check`.
5. Record any deviations in the task notes and update specs via `sync-specs` at closeout.

## Owns

- All test files from F01–F05.
- `pop/kanban/002_planning/11.1.3-implement-totp-security-lifecycle/11.1.3-implement-totp-security-lifecycle.verify.md` (created in 005).

## Verification

- `pnpm check`
- `pnpm db:test`
- `install/test.sh`
- `pnpm container:contract-check`
