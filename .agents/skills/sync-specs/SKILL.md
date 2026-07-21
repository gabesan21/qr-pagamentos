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
| 002_planning | O brief identifica contratos duráveis afetados. Linka a spec existente; cria `status: draft` via `write-spec` somente se a entrega introduz comportamento, interface ou invariante ainda sem contrato. Correção interna que restaura contrato existente não duplica spec. Use `implementation: planned` para promessa ainda não entregue e `partial` quando parte do contrato já existe. |
| 003_human_approval | O `- [x] Feito` aprova também as mudanças de spec propostas no plano: specs afetadas passam de `draft` para `active`; `implementation` continua independente e só muda com evidência da realidade. |
| 004_processing | Realidade divergiu da spec → registre a divergência na seção "Aberto" da spec e nas notas do card. **Nunca reescreva a spec silenciosamente** — mudança relevante volta para 002. |
| 006_done | **Na mesma finalização em que a memory é escrita:** atualize cada spec realmente afetada para refletir o entregue — resolva questões pertinentes e ajuste `implementation` para `partial`, `implemented` ou `not_applicable`. Se nenhuma promessa durável mudou, registre isso na memory e não invente atualização. Spec superada → `status: superseded`, com `superseded_by`; a substituta declara o ID antigo em `supersedes`. |

## Formato e descoberta

- O formato canônico é o de [[_templates/SPEC|SPEC]]: `id`, `project`, `domain`, `kind`, `status`, `implementation`, `origin`, `created`, `updated`, `supersedes` e `superseded_by`.
- Campos e enums permanecem em inglês; conteúdo segue o idioma do projeto. `id` é único na coleção; `project`, `domain` e `id` usam os identificadores definidos pelo projeto.
- `status` representa maturidade (`draft | active | superseded`); `implementation` representa aderência da realidade (`planned | partial | implemented | not_applicable`).
- Uma coleção adota o formato quando cria `specs/INDEX.md`; a migração é atômica, sem misturar documentos legados e canônicos.
- O índice alcança toda spec `draft` ou `active`, diretamente ou por um único `overview.md` de domínio. Overview mapeia propósito, fronteiras e links com gatilho sem repetir contratos filhos; a árvore não passa de `specs/<domain>/`.

## Auditoria (sob demanda ou na weekly-review)

Delegue a um **subagente** (resposta ≤30 linhas): listar as tasks em `pop/kanban/006_done` e ler as specs (`pop/specs/`) que seus planos linkam (meta-projeto da raiz do vault e projetos ainda não migrados: harness na raiz, sem `pop/`), apontando **(a)** specs `draft`/`active` cuja `implementation` não reflete o entregue → pendência; **(b)** specs `superseded` sem relação recíproca com substituta → violação; **(c)** specs atuais inalcançáveis pelo `INDEX.md` em coleções adotadas → violação. O agente principal só decide o que fazer com a lista.

## Cuidados

- Conferir impacto em specs em 006 **não é opcional**; editar spec sem mudança de contrato é ruído.
- Spec guarda comportamento, invariantes, interfaces, erros e critérios duráveis — nunca reasoning, sequência de edição, solução interna contingente, changelog ou lista de tasks entregues. Acontecimento, commit e datas da execução ficam em `memory/`.
- Divergência descoberta em 004 é informação valiosa: registre antes que se perca, mesmo que a decisão fique para depois.
- Ao substituir uma spec, atualize as duas pontas de `supersedes`/`superseded_by` e a navegação do índice.
