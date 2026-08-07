# Modifications — <Nome do projeto>

> Blockquotes deste template são instruções de preenchimento — **apague-os ao preencher**.

Ficha: [[pop/PROJECT|<Nome do projeto>]] · Roadmap: [[pop/ROADMAP|Roadmap]]

> Tracking do que chega **fora do planejamento**: hotfixes, ajustes pontuais, correções/alterações de contrato e features emergentes pequenas. Uma linha por modification, descrição sempre curta; tasks `M-<n>.<t>-<slug>` ficam no arquivo da modification em `pop/modifications/` quando multi-task ([[_templates/MODIFICATION|template]]; escopo com o harness na própria raiz: sem o prefixo `pop/`). Nunca detalhe aqui.
> **Antes de tudo, a triagem da regra 13 do [[AGENTS|AGENTS]]:** fix pontual nem vira modification — executa como fix direto e vive só em memory + specs (seção "Fix direto" do [[WORKFLOW|WORKFLOW]]).
> **Fronteira com o roadmap (3 perguntas):** cabe em ~3 tasks? O "o quê/como" cabe num card, sem entrevista de planejamento? Só toca contratos existentes? Qualquer "não" → roadmap via `plan-roadmap`. Na dúvida, modification. **Só o humano cria modification** (o agente propõe); a `weekly-review` propõe promoção ao roadmap quando uma incha.
> **Yolo:** só o humano marca — anexe ` · yolo: sim` ao fim da célula Descrição; as tasks herdam, com opt-out/opt-in por task. **Size:** o agente sugere `S|M|L` na Descrição.
> **Este arquivo é kanban, não histórico:** linha de modification concluída é **removida** na `weekly-review` — nem log fica; o registro durável é memory + specs. As linhas de **task** saem dos arquivos de modification após a memory válida (regra 17 do [[AGENTS|AGENTS]]). Ids `M-<n>` nunca são reutilizados — confira memory e kanban ao propor o próximo.

| # | Modification | Descrição (≤1 linha) | Status |
|---|--------------|----------------------|--------|
| M-1 | [[pop/modifications/m-1-<slug>\|<nome>]] (multi-task) ou nome solto (task única) | O que muda e por quê. · size: S | aberta |

**Status de modification:** aberta | em andamento | concluída
