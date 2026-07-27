---
name: weekly-review
description: Revisão periódica do vault - varre projetos, epochs, modifications e tasks, aponta o que está parado e propõe promoções ou abandonos. Use quando o usuário pedir uma revisão do roadmap ou um panorama do vault.
---

# weekly-review

Gera um panorama do vault e propõe ações. Não altera nada além do relatório — decisões são do humano.

**Delegue a subagentes:** toda a coleta do passo 2 — o principal roda os scripts do passo 1 e só consolida o relatório.

## Procedimento

1. **Scripts primeiro:** rode `pop/scripts/pop_status.py` (panorama do kanban: tasks por estágio/projeto, bloqueadas, gates pendentes — 003, revisão/humano em 005, `awaiting_merge`, paradas há >14 dias) e `pop/scripts/pop_validate.py` (violações de limites: 144/600 chars, ~150 linhas, frontmatter, `stage` vs pasta; avisos: worktrees órfãs, wikilinks quebrados). O INBOX.md é Dataview, não fonte.
   Depois, **frescor do harness instalado**: para cada projeto com `pop/.included-harness.json` (clones `included` e repos embutidos de `full-multi-repo`), rode `python3 pop/scripts/pop_install_included.py --check-fresh <dir>` — exit 0 é atual, exit 1 é defasado ou sem carimbo. A **origem é sempre o PoP raiz**: o projeto nunca corrige harness editando a cópia local, ele **reinstala** com `python3 pop/scripts/pop_install_included.py <dir>` (espelha e poda). Alvo defasado é achado de **alta prioridade** no relatório — remédio de um comando só, listado como tal; use `--sha` para citar a versão da origem.
2. **O que os scripts não cobrem → subagentes paralelos**, um por frente, em **ondas de 3-5**, cada um com pergunta específica e resposta ≤30 linhas com **fonte por achado** e seção "Lacunas / Não encontrado" (workers não disparam subagentes):
   - **Drift do harness instalado:** o conjunto gerido **inteiro** — `.agents/skills/`, `pop/WORKFLOW.md`, `pop/TYPES.md`, `pop/_templates/`, `pop/scripts/` — de cada projeto, incluindo os repos embutidos de `full-multi-repo` (`<projeto>/<repo>/`). Instrumento: `--check-fresh` (passo 1); quando o carimbo acusa diferença, **detalhe com `diff`** contra a origem da raiz para dizer *o que* divergiu (máquina de estados antiga, script defasado, template sumido). Projeto sem carimbo ou com `pop/WORKFLOW.md` de outro número de estágios é drift grave. Divergência vira proposta de reinstalação, nunca de patch local.
   - **Arquivos base dos projetos:** por projeto, meça `AGENTS.md` e `pop/PROJECT.md` (`wc -l`) e compare com o teto — **~60 linhas** para AGENTS.md de projeto, contando a seção DOX das aplicações como exceção declarada (só elas podem passar, e só pelo DOX). Marque como candidato a virar **ponteiro com gatilho** todo trecho que narre o que já está em [[WORKFLOW|WORKFLOW]], [[TYPES|TYPES]] ou nas regras do [[AGENTS|AGENTS]] raiz (13 kanban, 17 memory, 20 comando humano) em vez de linkar. Sintoma barato: referência a estágio inexistente (`005_verifying`, `006_done`) — `grep` resolve e prova que o texto duplicado apodreceu. A frente **propõe** (arquivo, linhas, trechos a substituir por link); não edita nada.
   - **Índices vs. realidade:** status nos INDEX de categoria vs. atividade real no kanban; **Repositórios agregados** (INDEX raiz) vs. clones/`.gitignore` reais.
   - **Worktrees órfãs:** `pop/worktrees/` de cada projeto com conteúdo cuja task não está em `004`/`005_closing` aguardando merge (meta-projeto da raiz do vault e projetos ainda não migrados: harness na raiz, sem `pop/`) — incluindo as `<repo>/pop/worktrees/` dos repos embutidos de projetos `full-multi-repo`.
   - **Specs desatualizadas:** a auditoria da skill `sync-specs` (tasks em done cujas specs não foram atualizadas).
   - **Auditoria DOX:** nos projetos de aplicação com árvore DOX ([[_templates/DOX|template]]), contratos obsoletos (propósito/estrutura/fluxo mudou sem atualização), links mortos (laterais, skills, specs e índices apontando para caminho inexistente) e tetos estourados (~60 linhas, ~3 laterais, <7 referências por contrato).
   - **Saúde das notas:** notas órfãs (nenhum wikilink de entrada no vault) e contradições entre notas/decisões e specs — resposta ≤15 linhas: candidatas a linkar, fundir ou marcar com `> Contradiz:`.
   - **Saúde de memories, roadmap e modifications:** resíduos de tasks concluídas acusados por `pop_validate`; memories >2000 caracteres, repetitivas ou narrativas, candidatas à [[.agents/skills/optimize-memory/SKILL|optimize-memory]]. Apenas relatar caminho, risco e ganho potencial — não compactar nem apagar durante a review.
   - **Epochs paradas:** condições "Abandonar/pausar se" atingidas nos arquivos de epoch; projetos importados com a Epoch 1 (Organização) aberta — desde quando e o que falta para liberar o gate.
   - **Modifications inchadas:** modification com mais de ~3 tasks abertas ou aberta há muito tempo → proposta de promoção a phase/epoch do roadmap via `plan-roadmap` (tasks abertas concluem como `M-`; só o trabalho ainda não taskado migra — fronteira no [[AGENTS|AGENTS]]).
   - **Yolo órfão:** branches `develop` cujo escopo yolo parou (tasks bloqueadas ou escopo concluído sem PR final automático `develop` → `main` — seção Yolo mode do [[WORKFLOW|WORKFLOW]]). O meta PoP local é isento: entrega direto em `main`.
3. **Consolide:** o agente principal só monta o relatório a partir dos scripts e das respostas dos subagentes. Escreva-o em `notes/` de quem for o alvo (projeto: `pop/notes/`), ou — se for do vault todo — em `REVIEW-AAAA-MM-DD.md` na raiz, com:
   - **Aguardando você**: gates humanos pendentes e questões `aberta` em `open_questions/`, com link e desde quando.
   - **Parado**: tasks/projetos sem movimento, com sugestão (retomar, pausar, abandonar) e justificativa de uma linha.
   - **Progresso**: o que andou desde a última revisão (compare com o relatório anterior, se existir).
   - **Harness a reinstalar**: alvos defasados no `--check-fresh`, com o comando exato de reinstalação e o que divergiu.
   - **Propostas**: promoções de ideias a epoch, epochs concluíveis, modifications a promover ao roadmap, ajustes de prioridade, rascunhos em `drafts/` prontos para processar (`new-project`/`import-project`).
4. Linke o relatório no INBOX.md (seção nova "Revisões" se necessário) para o humano encontrar.

## Cuidados

- Relatório ≤150 linhas; detalhe extra vira nota linkada.
- Não mova tasks nem mude status durante a revisão — apenas proponha.
- Remova relatórios de revisão com mais de 3 meses (ou mova para uma pasta de arquivo) ao criar um novo.
