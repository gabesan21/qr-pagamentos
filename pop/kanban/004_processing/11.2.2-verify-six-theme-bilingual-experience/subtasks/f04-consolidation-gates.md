# F04 — Consolidation and gates

## Objetivo
Consolidar evidências e manter gates passando.

## Ação
1. Re-run dos runners afetados por F03.
2. `pnpm check`.
3. `pnpm db:test`.
4. `pnpm container:contract-check`.
5. `install/test.sh`.
6. Atualizar `.verify.md` e escrever `memory/<id>.md` (gate 005).

## Critério
Todos os gates passam; memory e verify prontos.
