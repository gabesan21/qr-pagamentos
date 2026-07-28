# F03 — Merchant profile TOTP routes

## What and why

Expose the TOTP lifecycle to the merchant profile so the 11.1.4 UI can call it. Routes remain backend-only here; no challenge/login UI is added.

## Boundaries and invariants

- Only active merchant `USER` principals can mutate their own TOTP state.
- Every route runs origin-guard first, then re-authorizes the cookie principal.
- Enrollment start returns the encrypted-secret metadata and a provisioning URI; the plaintext secret never leaves the server.
- Confirmation requires the current password plus the first TOTP code.
- Disablement requires the current password plus a TOTP code or a recovery code.
- All outcomes collapse to opaque `/profile?totp={enrolled|confirmed|disabled|failed|conflict|unavailable}` redirects.

## Work

1. Add `POST /profile/totp/enroll`.
2. Add `POST /profile/totp/confirm`.
3. Add `POST /profile/totp/disable`.
4. Add request-log route entries and route tests.

## Owns

- `src/app/profile/totp/enroll/route.ts` + `.test.ts`
- `src/app/profile/totp/confirm/route.ts` + `.test.ts`
- `src/app/profile/totp/disable/route.ts` + `.test.ts`
- `src/observability/server-request-log.ts`

## Verification

- `pnpm test src/app/profile/totp/**/*.test.ts`
