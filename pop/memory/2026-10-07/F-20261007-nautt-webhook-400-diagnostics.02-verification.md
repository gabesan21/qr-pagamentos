---
task: F-20261007-nautt-webhook-400-diagnostics
entry: 02-verification
---

# Verificação determinística e integridade de regressão

Exercitou todas as ramificações de 400 e os casos de sucesso através de smoke temporário isolado (`.nautt-webhook-400.smoke.test.ts`), removido após comprovação.

Executou as suítes aprovadas `webhook-intake.test.ts` e `route.test.ts` (42 testes aprovados), `webhook-rejection-log.test.ts` (5 testes aprovados), além de `pnpm typecheck` e `pnpm lint` sem erros no ambiente Node 26.4.0 e pnpm 11.3.0. Nenhuma chamada de rede externa ou container Docker foi executada. O payload de produção foi comprovado aceito sem headers duplicados.

## Evidência

- [[src/integrations/nautt/webhook-intake.test.ts]] — *testes unitários e de integração de intake*.
- [[src/app/api/nautt/webhooks/route.test.ts]] — *testes da rota HTTP*.
- [[src/observability/webhook-rejection-log.test.ts]] — *testes do writer de observabilidade*.
