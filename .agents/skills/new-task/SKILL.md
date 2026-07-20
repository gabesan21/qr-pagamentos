---
name: new-task
description: Entrevista rápida que cria uma task de uma phase do roadmap como pasta em pop/kanban/001_initial_task, com card preenchido, specs linkadas e link na epoch. Use quando o usuário pedir para iniciar/criar uma task.
---

# new-task

Materializa uma task do roadmap como pasta no kanban, no estágio `001_initial_task` — **confirmando com o usuário o essencial antes de criar**. Fluxo completo: [[WORKFLOW|WORKFLOW]].

**Modo yolo (sem entrevista):** task de escopo yolo (seção Yolo mode do WORKFLOW) é materializada direto pelo orquestrador — as respostas vêm do roadmap (descrição da task/phase, dependências da tabela, `critical` do padrão do projeto); pule a entrevista e siga o Procedimento com os ajustes yolo.

**Delegue a subagentes:** quase nada — é entrevista curta com o usuário; a delegação começa no planejamento (`advance-task`).

## Entrevista (pule o que o usuário já respondeu)

1. **Onde:** qual projeto e phase? Se o usuário não souber, mostre as phases em andamento da epoch atual e proponha a próxima task natural (da tabela de candidatas da epoch, se houver). **Hotfix/ajuste pontual sem relação com o roadmap em andamento** (correção de bug em produção, ajuste de lógica já aplicada por outra epoch): proponha direto `epoch: 0 / phase: 0.1` (Epoch 0 de manutenção — ver [[AGENTS|AGENTS]]) em vez de perguntar a phase da epoch corrente; `size` sugerido default `S`.
2. **O quê e por quê:** o que a task entrega, em uma linha? Por que agora — o que ela destrava?
3. **Dependências:** quais tasks precisam estar concluídas antes desta (`depends_on`)? Olhe as tasks da epoch e proponha; vazio = pode rodar em paralelo com as demais. (Gate: só entra em 004 com todas concluídas — ver WORKFLOW.)
4. **Criticidade:** esta task exige aprovação humana também na verificação (`critical: true`)? Considere o padrão do projeto na ficha (PROJECT.md).
5. **Specs e pesquisas:** quais contratos duráveis ela afeta? Linke spec existente; tema sem spec só recebe rascunho via `write-spec` se introduzir comportamento, interface ou invariante durável. Decisão técnica sem pesquisa prévia → sugira prompt no `RESEARCHES.md` antes de 002.
6. **Tamanho:** a mudança cabe em **um brief coeso** (≤~150 linhas, preferencialmente muito menos — ver WORKFLOW)? Se reúne objetivos independentes ou frentes demais para uma DAG legível, **proponha dividir em tasks** encadeadas por `depends_on`.
7. **Effort (`size`):** **proponha** `S | M | L` pelo volume da entrega, justificando em 1 linha. Size não escolhe sozinho a topologia: risco, skills, dependências e write sets determinam executor único ou frentes/ondas; planejador e revisor continuam separados.
8. Proponha **id e slug** (`<n>.<m>.<t>-<slug>`: `t` é o próximo número livre na phase; slug kebab-case, único no vault) e confirme.

## Procedimento

1. Confirme que a task existe (ou adicione-a) na tabela da phase em `pop/roadmap/<n>-<slug-da-epoch>.md`. **Epoch 0:** se `pop/roadmap/0-manutencao.md` ainda não existir, crie-o a partir de `_templates/EPOCH.md` (Status: `contínua`; Descrição: "Correções e ajustes pontuais fora do plano — nunca conclui"; uma única Phase `0.1`) e adicione a linha da Epoch 0 no `pop/ROADMAP.md` do projeto.
2. Crie a pasta `pop/kanban/001_initial_task/<id>-<slug>/` (meta-projeto da raiz do vault e projetos ainda não migrados: harness na raiz, sem `pop/`) com o card `<id>-<slug>.md` copiado de `_templates/TASK.md`:
   - Frontmatter completo (`id`, `project`, `epoch`, `phase`, `stage: 001_initial_task`, `critical`, `yolo`, `size`, `blocked: false`, `depends_on: [...]`, `awaiting_merge: false`, datas).
   - **Resolva a herança yolo** (epoch → phase → marcador da task; opt-out ` · yolo: não` vence): herdou/marcou → `yolo: true` + linha no Log com a origem (`yolo herdado da phase X.Y`).
   - **Estampe o `size`:** marcador ` · size:` da linha da task no roadmap, ou a sugestão da entrevista (modo yolo sem marcador: sugira você) — sempre com justificativa de 1 linha no Log (`size M sugerido: <motivo>`). O humano corrige à vontade em 001.
   - "O quê", "Por quê", seção "Dependências" e links de specs preenchidos com as respostas da entrevista; primeira linha do Log.
   - A seção **Liberação** fica com `- [ ] Pronto para planejar` **desmarcado** — o card nasce não liberado. **Exceção:** task `yolo: true` nasce **marcada**, com Log `liberada por yolo (marcado no roadmap)`.
3. Na tabela da epoch, transforme o id da task em wikilink `[[<id>-<slug>]]` e atualize o status para `001_initial_task`.
4. Se for a primeira task ativa do projeto, verifique se o status do projeto nos INDEX (categoria + raiz) deve mudar para "em andamento".
5. Feche informando o **gate de liberação**: o card fica em 001 aguardando o humano editar e marcar `- [x] Pronto para planejar` (seção Liberação) — o avanço para 002 (`advance-task`) só acontece depois. **Exceções:** comando explícito “cria e já avança” permite marcar com Log e encadear até 003; `yolo: true` encadeia e delega o gate de 003 ao revisor independente.

## Cuidados

- **Leia o AGENTS.md do projeto antes de criar:** restrições declaradas lá valem — p.ex. o gate de organização de projeto importado (Epoch 1 aberta → só tasks de harness: specs, skills, researches, notes em `pop/`).
- Arquivos de task são linkados **só pelo nome** (`[[1.1.1-user-table-creation]]`), nunca por caminho — a pasta se move entre estágios.
- Não escreva o plano aqui — isso acontece em `002_planning` via skill `advance-task`.
