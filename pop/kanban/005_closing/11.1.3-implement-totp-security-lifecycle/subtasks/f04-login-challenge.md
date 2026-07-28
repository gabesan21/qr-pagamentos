# F04 — Login challenge and session MFA binding

## What and why

Make username/password alone insufficient when TOTP is active, without changing the sign-in experience for users without TOTP.

## Boundaries and invariants

- `/login/submit` keeps its existing contract when the user has no active TOTP.
- When TOTP is active, password proof issues a short-lived `qr_mfa_challenge` cookie and redirects to `/login?mfa=required`.
- `POST /login/totp-challenge` accepts a TOTP code or recovery code, validates the challenge, creates a real session, and redirects to `/`.
- Challenge rows have a short expiry and are single-use; failed attempts do not disclose whether code or recovery code was wrong.
- Real sessions carry an `mfaVerifiedAt` fact so future enforcement can distinguish password-only from MFA-proven sessions.

## Work

1. Add `MfaChallenge` model and `src/auth/mfa-challenge.ts` service.
2. Update `src/auth/session.ts` to support optional `mfaVerifiedAt`.
3. Update `src/app/login/submit/route.ts` to branch on active TOTP.
4. Add `src/app/login/totp-challenge/route.ts` and tests.

## Owns

- `src/auth/mfa-challenge.ts`, `src/auth/mfa-challenge.test.ts`
- `src/auth/session.ts`, `src/auth/session.test.ts`
- `src/app/login/submit/route.ts`, `src/app/login/submit/route.test.ts`
- `src/app/login/totp-challenge/route.ts`, `src/app/login/totp-challenge/route.test.ts`

## Verification

- `pnpm test src/auth/mfa-challenge.test.ts src/app/login/submit/route.test.ts src/app/login/totp-challenge/route.test.ts`
