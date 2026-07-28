# F02 — TOTP lifecycle service

## What and why

Own the cryptographic TOTP lifecycle so every other front consumes it through a typed, testable service. This keeps validation rules, replay protection, and recovery-code semantics in one place.

## Boundaries and invariants

- Secret generation uses `node:crypto` random material and is encrypted before persistence.
- Validation implements RFC 6238 SHA-1, 30-second step, 6 digits, with a ±1-step window for clock skew.
- Replay protection stores the highest accepted counter and rejects equal/lower counters; used codes within the window are also rejected.
- Recovery codes are 16-byte random hex strings displayed once, stored as SHA-256 digests, and marked consumed on use.
- State machine: `UNCONFIRMED` (enrolled but not confirmed) → `ACTIVE` (confirmed) → removed on disablement.
- Disablement revokes all target sessions.

## Work

1. Create `src/auth/totp.ts` with `createTotpService(store, crypto, clock)`.
2. Implement enroll, confirm, validate, disable, generate/recover recovery codes.
3. Define typed errors: `TotpValidationError`, `TotpConflictError`, `TotpUnavailableError`.
4. Write deterministic service tests with a fixed clock and known secrets.

## Owns

- `src/auth/totp.ts`
- `src/auth/totp.test.ts`

## Verification

- `pnpm test src/auth/totp.test.ts`
