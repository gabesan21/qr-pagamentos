---
task: F-20261008-prune-unused-scripts-tests
project: qr-pagamentos
started: 2026-10-08
finished: 2026-10-08
commit: a86032d47d1f1583b99d15ad271bc6c18c06f014
pr: none
authorization: F-20261008-prune-unused-scripts-tests: triagem de fix direto (regra 13)
---

# F-20261008-prune-unused-scripts-tests — Prune obsolete scripts and redundant tests

- **Entrega:** Remoção de 3 scripts obsoletos, 1 smoke desconectado e asserções redundantes.
- **Verificação:** vitest direcionado (6 pass) e `pnpm check` (typecheck, lint, 2544 tests, build).
- **Impacto em contratos:** specs: mantidas · DOX: mantido.

## Entradas

- [[F-20261008-prune-unused-scripts-tests.01-scripts]] — Remoção de scripts obsoletos.
- [[F-20261008-prune-unused-scripts-tests.02-browser-smoke]] — Remoção do smoke test de browser.
- [[F-20261008-prune-unused-scripts-tests.03-assertions]] — Poda de asserções redundantes e imports órfãos.
- [[F-20261008-prune-unused-scripts-tests.04-contracts]] — Avaliação dos contratos duráveis.

## Links

- **Origem:** [[local://prune-unused-scripts-tests-plan.md|Plano aprovado]] — *siga para o plano*.
- **PR/commit:** `a86032d4` — *siga para o diff final*.
