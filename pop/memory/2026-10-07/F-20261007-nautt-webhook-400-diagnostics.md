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

## Links

- **Origem:** [[local://nautt-webhook-400-plan.md|Plano aprovado de diagnóstico de webhooks Nautt]] — *siga para o plano original aprovado*.
- **Contrato:** [[pop/specs/nautt-finance-integration|Nautt Finance integration]] — *requisitos duráveis do webhook intake*.
