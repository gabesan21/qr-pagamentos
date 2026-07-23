---
task: <id>-<slug>
project: <categoria>/<projeto>
started: AAAA-MM-DD
finished: AAAA-MM-DD
commit: <hash do commit final>
pr: <link do PR, se houver>
authorization: <somente para D-AAAAMMDD-<slug>: comando humano que dispensou o kanban>
---

# <id>-<slug> — <título curto>

> Ledger durável, escrito e validado antes de retirar a task do roadmap e apagar `kanban/006_done/<id>/`. Limite total: **2000 caracteres**. Registre fatos e ponteiros, não refaça a narrativa do plano ou da execução; use [[.agents/skills/optimize-memory/SKILL|optimize-memory]] se crescer sem perder cronologia ou decisões críticas. Desvio humano que dispense literalmente o kanban usa `task: D-AAAAMMDD-<slug>`, preenche `authorization` e não possui card/linha de roadmap.

- **Entrega:** <o que passou a existir ou mudou>.
- **Áreas alteradas:** `<subtree/arquivo>` — <uma linha>.
- **Verificação:** <gate agregado e resultado>.
- **Telemetria final:** <contextos por estágio; devoluções 003/005; differential|full; testes finais — sem reasoning>.
- **Decisões duráveis:** nenhuma | <decisão e justificativa curta>.
- **Desvios relevantes:** nenhum | <diferença autorizada em relação ao brief>.
- **Impacto em contratos:** specs: <avaliadas; atualizadas quando afetadas> · DOX: <avaliado; atualizado quando afetado>.

## Links

> Cada link leva um gatilho: quando vale segui-lo.

- **Spec afetada:** [[pop/specs/<spec>|<spec>]] — *siga para conhecer <contrato alterado>*.
- **Learning:** [[pop/notes/learnings/<nota>|<nota>]] — *siga se <situação reutilizável>*.
- **PR/commit:** <link ou hash> — *siga para inspecionar o diff final*.
