---
name: weekly-review
description: Revisão periódica do escopo corrente - varre epochs, modifications e tasks, aponta o que está parado e propõe promoções ou abandonos. Use quando o usuário pedir uma revisão do roadmap ou um panorama do trabalho.
---

# weekly-review

Gera um panorama **do escopo corrente** e propõe ações. Não altera nada além do relatório — decisões são do humano.

**O alvo é sempre o escopo corrente** (seção "Escopo corrente" do [[WORKFLOW|WORKFLOW]]): a raiz que contém o `AGENTS.md` que você está lendo. "Panorama" nunca significa sair dela. Se existir um `origin-scope.md` ao lado deste arquivo, o escopo hospeda outros e ganha as frentes extras descritas lá; se ele não existir, essas frentes **não se aplicam** — não as procure e não as invente.

**Delegue a subagentes:** toda a coleta do passo 2 — o principal roda os scripts do passo 1 e só consolida o relatório.

## Procedimento

1. **Scripts primeiro:** rode `pop/scripts/pop_status.py` (panorama do kanban: tasks por estágio/projeto, bloqueadas, gates pendentes — 003, revisão/humano em 005, `awaiting_merge`, paradas há >14 dias) e `pop/scripts/pop_validate.py` (violações de limites, frontmatter, `stage` vs pasta; avisos: worktrees órfãs, wikilinks quebrados). O INBOX.md é Dataview, não fonte.
   **Versão do harness:** `python3 pop/scripts/pop_install_included.py --check-fresh .` responde a versão instalada aqui. Comparar com a origem é responsabilidade de quem instalou — não é achado desta revisão e não justifica procurar a origem.
2. **O que os scripts não cobrem → subagentes paralelos**, um por frente, em **ondas de 3-5**, cada um com pergunta específica e resposta ≤30 linhas com **fonte por achado** e seção "Lacunas / Não encontrado" (workers não disparam subagentes):
   - **Arquivos base:** meça `AGENTS.md` e `pop/PROJECT.md` (`wc -l`) contra o teto de **~60 linhas** para o AGENTS.md, contando a seção DOX das aplicações como exceção declarada. Marque como candidato a virar **ponteiro com gatilho** todo trecho que narre o que já está no [[WORKFLOW|WORKFLOW]] em vez de linkar. Sintoma barato: referência a estágio inexistente (`005_verifying`, `006_done`) — `grep` resolve e prova que o texto duplicado apodreceu. A frente **propõe** (arquivo, linhas, trechos a substituir por link); não edita nada.
   - **Worktrees órfãs:** `pop/worktrees/` com conteúdo cuja task não está em `004`/`005_closing` aguardando merge.
   - **Specs desatualizadas:** a auditoria da skill `sync-specs` (tasks em done cujas specs não foram atualizadas).
   - **Auditoria DOX:** em aplicação com árvore DOX ([[_templates/DOX|template]]), contratos obsoletos (propósito/estrutura/fluxo mudou sem atualização), links mortos e tetos estourados (~60 linhas, ~3 laterais, <7 referências por contrato).
   - **Saúde das notas:** notas órfãs (nenhum wikilink de entrada no escopo) e contradições entre notas/decisões e specs — resposta ≤15 linhas: candidatas a linkar, fundir ou marcar com `> Contradiz:`.
   - **Saúde de memories, roadmap e modifications:** resíduos de tasks concluídas acusados por `pop_validate`; memory ainda plana fora de pasta de data, ledger >1200 ou entrada >800 caracteres, entrada sem evidência — candidatas à [[.agents/skills/optimize-memory/SKILL|optimize-memory]]. Apenas relatar caminho, risco e ganho potencial — não compactar nem apagar durante a review.
   - **Epochs paradas:** condições "Abandonar/pausar se" atingidas nos arquivos de epoch; Epoch 1 (Organização) ainda aberta — desde quando e o que falta para liberar o gate.
   - **Modifications inchadas:** modification com mais de ~3 tasks abertas ou aberta há muito tempo → proposta de promoção a phase/epoch do roadmap via `plan-roadmap` (tasks abertas concluem como `M-`; só o trabalho ainda não taskado migra — fronteira no [[AGENTS|AGENTS]]).
   - **Dívida datada do gate adversarial:** a cláusula "Transição — card anterior ao gate" do ato 1 do `005_closing` ([[WORKFLOW|WORKFLOW]]) e a constante `GATE_ADVERSARIAL_SINCE` que a implementa no validador existem **só** para cards que passaram por 002 antes de o gate vigorar — são dívida, não regra permanente. Meça com um comando, não por impressão:
     ```sh
     CUT=$(grep -hoE 'GATE_ADVERSARIAL_SINCE = "[0-9]{4}-[0-9]{2}-[0-9]{2}"' \
       pop/scripts/pop_validate.py pop/scripts/pop_validate.py 2>/dev/null \
       | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' | head -1)
     case "$CUT" in [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]) ;; *) CUT= ;; esac
     if [ -z "$CUT" ]; then
       echo 'ERRO: data de corte não encontrada — dívida NÃO pode ser removida' >&2
       false
     else
       grep -rH '^created:' kanban pop/kanban 2>/dev/null \
         | awk -F'created: ' -v c="$CUT" 'NF>1 && $2 < c {sub(/:$/,"",$1); print $1}'
     fi
     ```
     O comando cobre as duas anatomias (harness na própria raiz e em `pop/`) e **falha fechado**: sem constante legível ele imprime o erro e sai com status ≠ 0, sem chegar ao `awk`.
     **Gatilho de remoção:** saída vazia **e** status de saída zero — erro nunca é gatilho, e saída vazia com status ≠ 0 significa que a medição não aconteceu. Com o comando bem-sucedido, saída vazia é nenhum card pré-corte em nenhum estágio do kanban e nenhuma task em voo com `created:` anterior ao corte. Aí a frente propõe a remoção **conjunta**: cláusula no [[WORKFLOW|WORKFLOW]], ressalva na spec do gate, constante e isenção no validador, e os testes que as cobrem. Remoção parcial é pior que nenhuma — a proposta é sempre do conjunto. Enquanto houver card pré-corte, a frente só reporta quantos e quais, e não propõe nada.
   - **Yolo órfão:** branches `develop` cujo escopo yolo parou (tasks bloqueadas ou escopo concluído sem PR final automático `develop` → `main` — seção Yolo mode do [[WORKFLOW|WORKFLOW]]). Escopo local é isento: entrega direto em `main`.
3. **Consolide:** o agente principal só monta o relatório a partir dos scripts e das respostas dos subagentes. Escreva-o em `pop/notes/` do escopo corrente (`notes/` quando o harness mora na própria raiz), com:
   - **Aguardando você**: gates humanos pendentes e questões `aberta` em `open_questions/`, com link e desde quando.
   - **Parado**: tasks sem movimento, com sugestão (retomar, pausar, abandonar) e justificativa de uma linha.
   - **Progresso**: o que andou desde a última revisão (compare com o relatório anterior, se existir).
   - **Propostas**: promoções de ideias a epoch, epochs concluíveis, modifications a promover ao roadmap, ajustes de prioridade.
4. Linke o relatório no INBOX.md (seção "Revisões") para o humano encontrar.

## Cuidados

- Relatório ≤150 linhas; detalhe extra vira nota linkada.
- Não mova tasks nem mude status durante a revisão — apenas proponha.
- Remova relatórios de revisão com mais de 3 meses (ou mova para uma pasta de arquivo) ao criar um novo.
- Achado que só existiria fora do escopo não entra no relatório: vira questão em `open_questions/` ou não existe.
