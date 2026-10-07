---
task: D-20261007-nautt-webhook-recovery
project: qr-pagamentos
started: 2026-10-07
finished: 2026-10-07
commit: a35d5d90
pr: null
authorization: Approved no-kanban plan-mode correction; explicit exception to the project's approved-004-card requirement, limited to Nautt webhook intake and recovery.
---

# D-20261007-nautt-webhook-recovery — Nautt webhook recovery

- **Entrega:** Intake target-first por `data.uuid`, evidência opcional, reclaim de `REJECTED`, reparo local em duplicatas e reconciliação sem GET para ordens finais.
- **Verificação:** 10 módulos afetados (`pnpm test`, 135 testes), POST real integrado e `pnpm check` agregado aprovados.
- **Impacto em contratos:** specs: [[pop/specs/nautt-finance-integration|Nautt integration]] atualizada · DOX: [[src/integrations/nautt/AGENTS|Nautt DOX]] atualizado.

## Entradas

- [[D-20261007-nautt-webhook-recovery.01-target-first-intake-and-settlement-repair]] — intake target-first, delivery store reclaim e reparo local.
## Links

- **Origem:** [[pop/specs/nautt-finance-integration|Nautt integration spec]] — *siga para o contrato durável*.
- **PR/commit:** a35d5d90 — *siga para o diff final*.
