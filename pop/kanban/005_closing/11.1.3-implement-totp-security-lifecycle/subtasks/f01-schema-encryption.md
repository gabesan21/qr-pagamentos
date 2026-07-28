# F01 — Schema and encryption foundation

## What and why

Add the persisted structures that make TOTP secrets and recovery codes durable without weakening password authentication. The secret must be encrypted at rest with a deployment-owned key separate from Nautt credentials; recovery actions must be auditably append-only.

## Boundaries and invariants

- `totp_credential` is one row per user; it stores the encrypted secret, confirmation state, algorithm metadata, and a replay counter.
- `totp_recovery_code` stores SHA-256 digests of one-time codes, with a consumed marker.
- `totp_recovery_action` is append-only: actor UUID, target UUID, action, timestamp; no actor FK so actor deletion never fences history.
- Use a new `TOTP_ENCRYPTION_KEY` env; never reuse `NAUTT_ENCRYPTION_KEY`.
- Migration is additive only; bootstrap re-pins least-privilege grants.

## Work

1. Add `TotpCredential`, `TotpRecoveryCode`, and `TotpRecoveryAction` to `prisma/schema.prisma`.
2. Generate a canonical safe-language migration with `migration-policy.mjs`.
3. Update `prisma/bootstrap.sql` runtime grants.
4. Add `TOTP_ENCRYPTION_KEY` to `.env.example`, `.env.compose.example`, `compose.yaml`, `install/.env.example`, and `install/install.sh` staging.
5. Add a key loader and tests analogous to `src/lib/nautt-crypto.ts`.

## Owns

- `prisma/schema.prisma`
- `prisma/migrations/2026*_*_totp/`
- `prisma/bootstrap.sql`
- `.env.example`, `.env.compose.example`
- `compose.yaml`
- `install/install.sh`, `install/.env.example`
- `src/lib/totp-crypto.ts`, `src/lib/totp-crypto.test.ts`

## Verification

- `pnpm db:generate`
- `pnpm db:migration-policy`
- `pnpm db:contract-check`
- `pnpm test src/lib/totp-crypto.test.ts`
