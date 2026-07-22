---
name: new-task
description: Entrevista rápida que cria uma task do roadmap ou de uma modification como pasta em pop/kanban/001_initial_task, com card preenchido, specs linkadas e link na epoch/modification. Use quando o usuário pedir para iniciar/criar uma task.
---

# new-task

Materializa uma task do roadmap ou de uma modification como pasta no kanban, no estágio `001_initial_task` — **confirmando com o usuário o essencial antes de criar**. Fluxo completo: [[WORKFLOW|WORKFLOW]].

**Modo yolo (sem entrevista):** task de escopo yolo (seção Yolo mode do WORKFLOW) é materializada direto pelo orquestrador — as respostas vêm do roadmap/modifications (descrição da task, dependências da tabela, `critical` do padrão do projeto); pule a entrevista e siga o Procedimento com os ajustes yolo.

**Delegue a subagentes:** quase nada — é entrevista curta com o usuário; a delegação começa no planejamento (`advance-task`).

## Entrevista (pule o que o usuário já respondeu)

1. **Onde:** qual projeto, e vem do roadmap (phase) ou das modifications? Se o usuário não souber, mostre as phases em andamento da epoch atual e proponha a próxima task natural. **Hotfix, ajuste pontual, correção/alteração de contrato ou feature emergente fora do planejamento:** proponha uma **modification** — aplique a fronteira das 3 perguntas do [[AGENTS|AGENTS]] (cabe em ~3 tasks? cabe num card sem entrevista de planejamento? só toca contratos existentes? — qualquer "não" → roadmap via `plan-roadmap`). **Só o humano cria modification:** proponha `M-<n>` (próximo número livre, nunca reutilizado — confira MODIFICATIONS.md, kanban e memory) e confirme; `size` sugerido default `S`.
2. **O quê e por quê:** o que a task entrega, em uma linha? Por que agora — o que ela destrava?
3. **Dependências:** quais tasks precisam estar concluídas antes desta (`depends_on`)? Olhe as tasks da epoch/modification e proponha; vazio = pode rodar em paralelo com as demais. (Gate: só entra em 004 com todas concluídas — ver WORKFLOW.)
4. **Criticidade:** esta task exige aprovação humana também na verificação (`critical: true`)? Considere o padrão do projeto na ficha (PROJECT.md).
5. **Specs e pesquisas:** quais contratos duráveis ela afeta? Linke spec existente; tema sem spec só recebe rascunho via `write-spec` se introduzir comportamento, interface ou invariante durável. Decisão técnica sem pesquisa prévia → sugira prompt no `RESEARCHES.md` antes de 002.
6. **Tamanho:** a mudança cabe em **um brief coeso** (≤~150 linhas, preferencialmente muito menos — ver WORKFLOW)? Se reúne objetivos independentes ou frentes demais para uma DAG legível, **proponha dividir em tasks** encadeadas por `depends_on` — em modification, multi-task ganha arquivo próprio em `pop/modifications/`.
7. **Effort (`size`):** **proponha** `S | M | L` pelo volume da entrega, justificando em 1 linha. Size não escolhe sozinho a topologia: risco, skills, dependências e write sets determinam executor único ou frentes/ondas; planejador e revisor continuam separados.
8. Proponha **id e slug** — roadmap: `<n>.<m>.<t>-<slug>` (`t` é o próximo número livre na phase); modification: `M-<n>.<t>-<slug>` (`t` é o próximo livre na modification, começando em 1). Slug kebab-case, único no vault. Confirme.

## Procedimento

1. Confirme que a task existe (ou adicione-a) na origem:
   - **Roadmap:** tabela da phase em `pop/roadmap/<n>-<slug-da-epoch>.md`.
   - **Modifications:** se `pop/MODIFICATIONS.md` não existir, crie-o a partir de `_templates/MODIFICATIONS.md` e adicione a linha `M-<n>`. Modification **multi-task**: crie também `pop/modifications/m-<n>-<slug>.md` a partir de `_templates/MODIFICATION.md` e liste a task lá; modification de **task única** vive só na linha do MODIFICATIONS.md.
2. Crie a pasta `pop/kanban/001_initial_task/<id>-<slug>/` (meta-projeto da raiz do vault e projetos ainda não migrados: harness na raiz, sem `pop/`) com o card `<id>-<slug>.md` copiado de `_templates/TASK.md`:
   - Frontmatter completo (`id`, `project`, `origin`, `epoch`/`phase` **ou** `modification`, `stage: 001_initial_task`, `critical`, `yolo`, `size`, `blocked: false`, `depends_on: [...]`, `awaiting_merge: false`, datas) — apague o bloco da origem não usada.
   - **Resolva a herança yolo** (epoch → phase → marcador da task, ou modification → marcador da task; opt-out ` · yolo: não` vence): herdou/marcou → `yolo: true` + linha no Log com a origem (`yolo herdado da phase X.Y` / `yolo herdado da modification M-N`).
   - **Estampe o `size`:** marcador ` · size:` da linha da task na origem, ou a sugestão da entrevista (modo yolo sem marcador: sugira você) — sempre com justificativa de 1 linha no Log (`size M sugerido: <motivo>`). O humano corrige à vontade em 001.
   - "O quê", "Por quê", seção "Dependências" e links de specs preenchidos com as respostas da entrevista; primeira linha do Log.
   - A seção **Liberação** fica com `- [ ] Pronto para planejar` **desmarcado** — o card nasce não liberado. **Exceção:** task `yolo: true` nasce **marcada**, com Log `liberada por yolo (marcado no roadmap/modifications)`.
3. Na tabela da epoch ou da modification (ou na linha do MODIFICATIONS.md, se task única), transforme o id da task em wikilink `[[<id>-<slug>]]` e atualize o status para `001_initial_task`.
4. Se for a primeira task ativa do projeto, verifique se o status do projeto nos INDEX (categoria + raiz) deve mudar para "em andamento".
5. Feche informando o **gate de liberação**: o card fica em 001 aguardando o humano editar e marcar `- [x] Pronto para planejar` (seção Liberação) — o avanço para 002 (`advance-task`) só acontece depois. **Exceções:** comando explícito “cria e já avança” permite marcar com Log e encadear até 003; `yolo: true` encadeia o fluxo yolo (gate único em 005; 003 só em `critical`).

## Cuidados

- **Leia o AGENTS.md do projeto antes de criar:** restrições declaradas lá valem — p.ex. o gate de organização de projeto importado (Epoch 1 aberta → só tasks de harness: specs, skills, researches, notes em `pop/`).
- Arquivos de task são linkados **só pelo nome** (`[[1.1.1-user-table-creation]]`, `[[M-1.1-ajusta-contrato]]`), nunca por caminho — a pasta se move entre estágios.
- Não escreva o plano aqui — isso acontece em `002_planning` via skill `advance-task`.
