# D-20260922-loopback-operator-origins

- **Route:** no-kanban (rule 13/20) — explicit user instruction to remove the HTTPS-only requirement blocking a local test install.
- **Date:** 2026-09-22
- **Scope:** `NAUTT_WEBHOOK_CALLBACK_URL` and `PUBLIC_ORIGIN` validation, installer + runtime + contracts.

## Decision

The user reported the HTTPS-only rule as wrong for local testing and ordered it fixed. Instead of dropping the requirement, operator origins now accept plain HTTP **only on a loopback host** (`localhost`, `127.0.0.1`, `[::1]`); every real host still requires absolute HTTPS without credentials or fragment. The remote `NAUTT_API_BASE_URL` stays HTTPS-only.

## Changes

- [[src/net/local-origin.ts]] — new shared `isAcceptableOperatorOrigin` validator.
- [[src/auth/mail-config.ts]] — `loadPublicOrigin` uses the shared validator.
- [[src/integrations/nautt/client-webhooks.ts]] — `validateNauttWebhookCallbackUrl` uses the shared validator.
- `install/install.sh` — new `validate_operator_origin` helper replaces the two inline HTTPS checks.
- `install/update.sh` — `validate_urls` splits callback (loopback allowed) from API base URL (HTTPS-only).
- Specs/DOX synced: [[pop/specs/nautt-finance-integration|nautt-finance-integration]] line 25 and [[src/integrations/nautt/AGENTS|nautt subtree contract]].

## Evidence

- `vitest run src/auth/mail-config.test.ts src/integrations/nautt/client-webhooks.test.ts` — 87 passed, including new loopback-acceptance cases.
- `tsc --noEmit` and `eslint` on touched files — clean. `bash -n` on both scripts — clean.
- Pre-existing rejection tests for `http://payments.example.com` still pass: non-loopback HTTP stays refused.

## Note

Run via direct `./node_modules/.bin/*` because the local Node (v26.9.0) differs from the `.node-version` pin (26.4.0) and `pnpm` aborts wanting to purge `node_modules`.
