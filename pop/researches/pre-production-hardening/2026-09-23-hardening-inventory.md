---
author: agent
created: 2026-09-23
---

# Pre-production hardening inventory — what Epoch 13 must close

- **Ingested:** 2026-09-23 — three read-only reconnaissance passes (webhook HMAC reversal footprint, lifecycle/production gaps, Epoch 15 released follow-ups) after Epoch 15 merged to `main` (PR #11).
- **Feeds:** [[roadmap/13-pre-production-hardening|Epoch 13]] — *read before planning any task of that epoch*. Decisions: [[notes/decisions/2026-09-23-epoch-13-decisions|2026-09-23 decisions]].

## A. Webhook HMAC (M-5.1 reversal) — confirmed footprint

- BETA seam: `src/integrations/nautt/webhook-intake.ts:18` marker; `resolveOwner` required dependency (`:35`), `loadCandidates`/`verifyOwner` kept but never invoked (`:28-40`); signature gate skipped, body parsed before trust (`:53-56`); unresolved owner → `400` without claim (`:59-69`); unknown order → `204` with zero evidence (`:103-105`); `WebhookIntakeResult` typed `204 | 400 | 503`, `401` structurally absent (`:19`).
- Runtime wiring: `webhook-runtime.ts:28-36` Prisma `resolveOwner`; `loadActiveWebhookSecrets` wired but dead (`:9-25`); no `verifyOwner` passed. Route already types `401` (`src/app/api/nautt/webhooks/route.ts:5`).
- Reversal target intact and green: `webhook-signature.ts:13-41` (`sha256=<64 hex>`, HMAC-SHA256 over raw bytes, `timingSafeEqual`, secret zeroing, single-match rule).
- Tests pinning beta: `webhook-intake-beta.test.ts` (delete on reversal, header says so); `webhook-intake.test.ts:69-315` `describe("BETA(M-5.1) …")` asserting `loadCandidates`/`verifyOwner` never called.
- Caveats to clear: `pop/specs/nautt-finance-integration.md:26,36,37,38,39,59,70`; `src/integrations/nautt/AGENTS.md:42` (its bullets `:43-47` already state the post-beta contract). Root `AGENTS.md`: **no** `BETA`/`M-5.1` occurrence — the open question lists it, but it is a no-op.
- Documented contract (`researches/nautt-finance/nautt-finance.md:63`): `hex(HMAC-SHA256(secret, rawBody))` vs `X-Nautt-Signature: sha256=<hex>`, `X-Nautt-Delivery` dedup key, `X-Nautt-Event`, supplied from Nautt's `webhook_dispatcher` source on 2026-07-17. **Unproven:** production dispatcher revision, header normalization, exact signed bytes, multi-secret grammar; **no fixture** exists in the repo (`raw/webhook.md` has no signature sample). Research `nautt-production-webhook-hmac-contract` still `on-hold-by-beta-decision` (`RESEARCHES.md:7`). Sandbox host discrepancy `api-stage` vs `stage` (`nautt-finance.md:72`).
- After reversal, orphan webhooks (post-reset retries) become inert again (`spec:26`); provider-side list/delete/recreate stays undocumented (`spec:70`).

## B. Lifecycle and production gaps — confirmed

- **Security headers:** five static headers in `next.config.ts:1-21`; CSP deliberately absent (no middleware by durable decision, `memory/5.3.1-security-headers-and-origin-checks.md:16`); `PROJECT.md:17` still lists it as deferred.
- **Runbook drift:** `docs/production-runbook.md:185` says a 19-migration baseline; Epoch 15 rebased to 16 (`prisma/migration-policy-baseline.json`, `pop/scripts/migration-policy.mjs:262`). `docs/release-evidence.md` is a frozen ledger for commit `5d0f1a7` (2026-07-21) with almost every row "SKIPPED — user directed"; the 11.2.3 rehearsal closed on a human static-review waiver (`memory/2026-07-31/11.2.3-…03-waiver.md:8`). No dated live rehearsal exists; initial-admin recovery has zero evidence.
- **Provider configuration:** pair registration validates only UUID shape (`src/app/admin/catalog/currency-pairs/route.ts`, `src/auth/nautt-catalog.ts:73-80`); `GlobalPaymentSettings` (BRL/PIX) is written but never read by checkout; no seed. Research `nautt-exchange-currencies-contract` is only proposed (`RESEARCHES.md`); `spec:72` lists `deposit_fields`, quote refresh, rate limits, polling interval as open.
- **Observability:** console-sink JSON loggers only (`src/observability/*`); `GET /api/health` liveness only; rate limiter in-memory per process (`src/security/public-rate-limit.ts`; runbook `:12-13` single-instance caveat).
- **Secrets:** `NAUTT_ENCRYPTION_KEY`/`TOTP_ENCRYPTION_KEY` generated/validated by `install/install.sh:55-202`; **no rotation path** anywhere (`install/*.sh`, `container/runtime.mjs:32`); loss is unrecoverable by design. SMTP/`PUBLIC_ORIGIN` are `*_FILE` secrets. Loopback HTTP allowance is host-scoped (`src/net/local-origin.ts:8-12`); nothing stops a production deploy configured with a loopback `PUBLIC_ORIGIN`/callback. `install/.env.bak-20260922` holds local key material but is **not** git-tracked (`.gitignore` `.env.*`).
- **Spec Open items:** `nautt:69` key lifecycle (blocking); `nautt:70` webhook list/delete (deferrable, undocumented); `nautt:71` idempotency after timeout (deferrable); `nautt:72` `deposit_fields` etc. (blocking for pair validation, research first); `nautt:73` delivery-history contract (deferrable); `checkout:139` in-flight orders when a reusable link is disabled (blocking: undefined money-state transition). `identity-security.md` and `administrative-foundation.md` have no `## Open` section (housekeeping, not a task).

## C. Epoch 15 released follow-ups — classification

- Resolved: F2 (checker reads generated tree, fixed by 15.4.2), F3 (V1 form retired by 15.3.1), F4 (117 of 143 keys retired by 15.4.2), F5 (loading obligations refreshed by 15.4.2).
- **In scope (release gate red):** F6 — `admin:source-check` fails widely across `src/app-shell/**`, `src/app/admin/**`, `src/app/(merchant)/**` (raw native controls / local CSS variants bypassing owned primitives); widened by 15.4.3 (`memory/2026-09-23/15.4.3-…04-out-of-reach-follow-ups.md:8`), never enumerated or sized.
- Out of scope (UI/drift or nit): `NativeSelect` double chrome on the locale switcher (human checklist); F03 `pixQrCodeUrl` still accepted by browser parsers (small modification); stale V1 mentions in comments.
- Standing Docker-only human checklist (`notes/references/2026-09-23-epoch-15-human-verification-checklist.md`): `pnpm db:test`, `install/test.sh`, the 16 evidence capture/verify pairs — none run yet.

## D. Git state

`origin/main` (`d37d78fe`, PR #11) and `develop` differ in no file outside `pop/`; `develop` is pushed. Epoch 13 branches from a `develop` that equals `main` in product code.
