---
name: sync-specs
description: Fluxo obrigatório de atualização de specs conforme as tasks avançam no kanban - specs nunca podem divergir da realidade do projeto. Use ao planejar (002), executar (004) e concluir (006) tasks, e para auditar specs desatualizadas.
---

# sync-specs

**Princípio: a spec descreve o estado atual acordado do projeto. Spec mentindo é bug.** Este fluxo é obrigatório e acompanha os estágios do [[WORKFLOW|WORKFLOW]].

**Delegue a subagentes:** a auditoria (listar 006_done + ler specs linkadas); os pontos de contato do kanban rodam dentro do subagente da etapa (`advance-task`).

## Pontos de contato com o kanban

| Estágio | Obrigação com as specs |
|---------|------------------------|
| 002_planning | O plano **monta as specs da mudança**: toda spec afetada linkada na seção "Specs da mudança" e, tema sem spec, rascunho criado (skill `write-spec`) já refletindo o que se planeja mudar. Plano sem as specs montadas não está pronto para 003. |
| 003_human_approval | O `- [x] Feito` aprova também as mudanças de spec propostas no plano → specs afetadas passam de `rascunho` para `aprovada`. |
| 004_processing | Realidade divergiu da spec → registre a divergência na seção "Aberto" da spec e nas notas do card. **Nunca reescreva a spec silenciosamente** — mudança relevante volta para 002. |
| 006_done | **Na mesma finalização em que a memory é escrita:** atualize cada spec afetada para refletir **o que foi realmente feito** — resolva os itens "Aberto" pertinentes, ajuste requisitos e detalhes, status → `implementada` (ou mantenha `aprovada` se a task cobriu só parte). Spec superada → `obsoleta`, com link para a substituta. |

## Auditoria (sob demanda ou na weekly-review)

Delegue a um **subagente** (resposta ≤30 linhas): listar as tasks em `006_done` e ler as specs que seus planos linkam, apontando **(a)** specs ainda `rascunho`/`aprovada` que não refletem o que a task entregou → pendência; **(b)** specs `obsoleta` sem link para substituta, ou sem referência de task/phase → candidatas a arquivar/reescrever. O agente principal só decide o que fazer com a lista.

## Cuidados

- Atualizar spec em 006 **não é opcional** — é parte do critério de conclusão da task.
- Divergência descoberta em 004 é informação valiosa: registre antes que se perca, mesmo que a decisão fique para depois.
- Ao mudar status de uma spec, atualize também os links dela (phase, tasks) se mudaram.
