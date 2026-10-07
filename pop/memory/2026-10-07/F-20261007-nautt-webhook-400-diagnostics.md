---
task: F-20261007-nautt-webhook-400-diagnostics
project: qr-pagamentos
started: 2026-10-07
finished: 2026-10-07
commit: 0e7df147
authorization: triagem de fix direto (regra 13); plano aprovado local://nautt-webhook-400-plan.md
---

# F-20261007-nautt-webhook-400-diagnostics — Diagnóstico estruturado de 400 em webhooks Nautt

Ledger da intervenção: instrumenta a observabilidade de produção para identificar a causa exata de qualquer HTTP 400 no webhook intake da Nautt sem alterar respostas, corpos ou autenticação.

- **Entrega:** Diagnóstico estruturado seguro para todas as saídas 400 do intake de webhooks da Nautt, cobrindo UTF-8, JSON, schema, headers duplicados divergentes e conflito de claim.
- **Verificação:** Runtime smoke isolado cobrindo todas as razões, suítes `webhook-intake.test.ts` e `route.test.ts` (42/42 aprovados), testes do logger (5/5 aprovados), `pnpm typecheck` e `pnpm lint` limpos com Node 26.4.0 e pnpm 11.3.0.
- **Impacto em contratos:** specs: [[pop/specs/nautt-finance-integration|Nautt Finance integration]] atualizada no requisito de diagnósticos de 400 · DOX: `src/integrations/nautt/AGENTS.md` avaliado e consistente.

## Entradas

- [[F-20261007-nautt-webhook-400-diagnostics.01-structured-reasons]] — Classificação estruturada das saídas 400 no parser e no intake com redaction de segredos.
- [[F-20261007-nautt-webhook-400-diagnostics.02-verification]] — Verificação determinística via smoke temporário, suítes completas de testes, lint e typecheck.

## User-authorized production authentication exception — 2026-10-07

- **Authorization:** The user explicitly authorized a temporary production Nautt webhook HMAC bypass through a direct override, without a new kanban ceremony. This is a new production exception, not an extension of the historical closed-beta authorization.
- **Durable routing contract:** Ownership always resolves through the globally unique persisted `provider_order.providerOrderUuid`. Signature matches and notification owner fields never select an owner. This routing remains in force when HMAC is restored.
- **Disabled-authentication boundary:** Missing, malformed, and incorrect signatures do not reject intake while bypass is active. Intake performs zero webhook-secret reads or decryptions and no all-owner secret scan.
- **Accepted risk:** Intake is unauthenticated. An unsigned caller who knows a persisted provider order UUID can trigger one owner-bound authoritative `GET /orders/{uuid}` per accepted delivery; distinct forged delivery IDs can repeat that work while the order remains actionable. Notification status remains untrusted and cannot mutate state directly; authoritative GET reconciliation, versioned claims, deduplication, leases, and bounded input remain required.
- **Safe no-op:** A valid notification carrying an unknown provider order UUID returns empty no-store `204` before claims, credential or secret reads/decryption, and any provider network call. Known-order orphan notifications may trigger reconciliation during bypass.
- **Restoration:** Resolve the persisted UUID owner first, then verify the exact raw body with only that owner's active webhook secret and constant-time HMAC comparison. Restore authentication rejection before claims/reconciliation, never an all-owner scan or signature-derived ownership.
- **Contract synchronization:** Updated `pop/specs/nautt-finance-integration.md` and `src/integrations/nautt/AGENTS.md` to record the production exception, permanent UUID routing, unknown-UUID safety, and owner-bound restoration contract. Historical beta decisions and earlier verification evidence remain historical.
- **Source commit:** `b654d2a5` — `Route Nautt webhooks by persisted order UUID and temporarily bypass HMAC`, on `main`.
- **Observed checks:** Complete Nautt integration, webhook route, and rejection-log modules exercised 426 tests across 18 files. Initial run had 425 passing and one newly written replay expectation failure; the existing contract correctly treats changed non-identity status bytes as a terminal duplicate, not an identity conflict. Corrected that expectation without changing runtime behavior; the complete intake module then passed 38/38. Other 17 modules passed on their initial run. `pnpm typecheck` passed. Node was `v26.10.0` (package engine declares `26.4.0`; pnpm reported its unsupported-engine warning), pnpm `11.3.0`.
- **Runtime smoke:** A real intake, real in-memory delivery adapter, real redacted logger, and real Prisma UUID-owner resolver with a `findUnique` fixture returned missing-signature `204`, malformed-signature terminal replay `204`, unknown UUID `204`, conflicting identity `400`, and invalid timestamp `400`. Four persisted owner lookups and one reconciliation call were observed; unknown/replay/conflict cases caused no additional reconciliation. Console emitted redacted `claim_identity_conflict` and `created_at_invalid` diagnostics. The smoke was outside Vitest; no real production provider/database calls or secrets were used.
- **Scope:** No Docker, develop push/merge, build, or unrelated subtree changes. HMAC remains deliberately disabled and must be restored using the owner-bound instructions above after the production test.

## Links

- **Origem:** [[local://nautt-webhook-400-plan.md|Plano aprovado de diagnóstico de webhooks Nautt]] — *siga para o plano original aprovado*.
- **Contrato:** [[pop/specs/nautt-finance-integration|Nautt Finance integration]] — *requisitos duráveis do webhook intake*.
