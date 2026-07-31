---
name: weekly-review
description: Revisão periódica do escopo corrente - varre epochs, modifications e tasks, conserta o harness no que é inequívoco e propõe o resto. Roda sempre fora do kanban e em ondas de subagentes paralelos. Use quando o usuário pedir uma revisão do roadmap ou um panorama do trabalho.
---

# weekly-review

Mede o **escopo corrente**, **conserta** o que é inequívoco e propõe o que exige decisão.

**Roda fora do kanban, sempre.** Não crie card, não use `new-task`, não abra branch, worktree ou PR de task, e não mova task alguma. Revisão de harness é manutenção do material que o kanban consulta — submetê-la ao kanban é pedir que o processo se aprove a si mesmo (regra 13 e "Escopo corrente" do [[WORKFLOW|WORKFLOW]]).

## Fronteira: o que esta skill conserta

A classe do arquivo decide, nunca o tamanho do achado ("Escopo corrente" › três classes):

- **Harness gerido** (`WORKFLOW.md`, `_templates/`, `pop/scripts/`, `.agents/skills/`) → **nunca editar**. Defasagem se resolve reinstalando pela origem; a review executa a reinstalação quando ela é o remédio, porque é mecânica e idempotente, e **relata** qualquer outro achado dessa classe.
- **Harness próprio do escopo** (`AGENTS.md`, `PROJECT.md`, `roadmap/`, `specs/`, `notes/`, `skills/`, `memory/`) → **conserta direto** o que é inequívoco: link morto, referência a estágio inexistente, arquivo acima do teto (fatiar), trecho que pertence a spec/nota/memory, memory fora do layout (via [[.agents/skills/optimize-memory/SKILL|optimize-memory]] no escopo). Toda correção é uma edição pequena e reversível, com o arquivo citado no relatório.
- **Conteúdo do projeto** (código, manuscrito) → **nunca**, em nenhuma hipótese: só relatar.

**Propor, não consertar**, mesmo dentro do harness próprio, quando a correção **muda sentido**: reescrever contrato de spec, promover modification a epoch, abandonar/pausar epoch, mudar status de projeto, apagar registro. Regra prática: se duas pessoas razoáveis discordariam do resultado, é proposta.

**O alvo é sempre o escopo corrente** (seção "Escopo corrente" do [[WORKFLOW|WORKFLOW]]): a raiz que contém o `AGENTS.md` que você está lendo. "Panorama" nunca significa sair dela. Se existir um `origin-scope.md` ao lado deste arquivo, o escopo hospeda outros e ganha as frentes extras descritas lá; se ele não existir, essas frentes **não se aplicam** — não as procure e não as invente.

**Delegue em paralelo, obrigatoriamente.** O principal roda os scripts do passo 1, lança as ondas dos passos 2 e 3 e consolida — ele não varre nem conserta à mão. Coleta e correção são **ondas de subagentes paralelos**, e nenhum worker dispara subagentes.

## Procedimento

1. **Scripts primeiro:** rode `pop/scripts/pop_status.py` (panorama do kanban: tasks por estágio/projeto, bloqueadas, gates pendentes — 003, revisão/humano em 005, `awaiting_merge`, paradas há >14 dias) e `pop/scripts/pop_validate.py` (violações de limites, frontmatter, `stage` vs pasta; avisos: worktrees órfãs, wikilinks quebrados). O INBOX.md é Dataview, não fonte.
   **Versão do harness:** `python3 pop/scripts/pop_install_included.py --check-fresh .` responde a versão instalada aqui. Comparar com a origem é responsabilidade de quem instalou — não é achado desta revisão e não justifica procurar a origem.
2. **O que os scripts não cobrem → subagentes paralelos**, um por frente, em **ondas de 3-5**, cada um com pergunta específica e resposta ≤30 linhas com **fonte por achado** e seção "Lacunas / Não encontrado" (workers não disparam subagentes):
   - **Arquivos base:** meça `AGENTS.md` e `pop/PROJECT.md` contra o teto de **~60 linhas** do AGENTS.md. Em aplicação, **desconte o bloco DOX e meça o resto** — o `pop_validate` já reporta esse número como aviso, e ele é o alvo: isenção que desliga a medição esconde dívida. Classifique cada trecho excedente por **destino**, usando o "o que não entra" de [[_templates/AGENTS-PROJECT|AGENTS-PROJECT]] como critério: narrativa do fluxo → **ponteiro com gatilho** para o [[WORKFLOW|WORKFLOW]]; contrato, invariante ou interface durável → linha em spec; razão de uma escolha → nota em `notes/decisions/`; acontecimento → já está em `memory/`. Sintoma barato: referência a estágio inexistente (`005_verifying`, `006_done`) — `grep` prova que o texto duplicado apodreceu. **Substituição por ponteiro e correção de referência podre são conserto** (harness próprio); mover texto para uma spec que passa a prometer coisa nova é proposta.
   - **Worktrees órfãs:** `pop/worktrees/` com conteúdo cuja task não está em `004`/`005_closing` aguardando merge.
   - **Specs desatualizadas:** a auditoria da skill `sync-specs` (tasks em done cujas specs não foram atualizadas).
   - **Auditoria DOX:** em aplicação com árvore DOX ([[_templates/DOX|template]]), contratos obsoletos (propósito/estrutura/fluxo mudou sem atualização), links mortos e tetos estourados (~60 linhas, ~3 laterais, <7 referências por contrato).
   - **Saúde das notas:** notas órfãs (nenhum wikilink de entrada no escopo) e contradições entre notas/decisões e specs — resposta ≤15 linhas: candidatas a linkar, fundir ou marcar com `> Contradiz:`.
   - **Saúde de memories, roadmap e modifications:** resíduos de tasks concluídas acusados por `pop_validate`; memory ainda plana fora de pasta de data, ledger >1200 ou entrada >800 caracteres, entrada sem evidência, pasta que não é data dentro de `memory/` (backup de conversão mora **fora** de `memory/`). A frente **mede e lista os arquivos**; o conserto é a [[.agents/skills/optimize-memory/SKILL|optimize-memory]], acionada no passo 3 com esse escopo — ela é quem sabe preservar prova, e nenhum worker de coleta converte memory por conta própria. Resíduo de roadmap/modifications de task já concluída é conserto direto (remover a linha); status de epoch/modification é proposta.
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
3. **Onda de correção → subagentes paralelos, um por grupo de arquivos.** Com os achados na mão, o principal separa o que a fronteira acima classifica como **conserto** e distribui:
   - **Write sets disjuntos são pré-requisito do paralelismo.** Dois workers nunca recebem o mesmo arquivo; achados que tocam o mesmo arquivo viram **um** worker. Sem isso, a correção se sobrescreve e o ganho de paralelismo vira retrabalho.
   - Cada worker recebe: os achados dele com caminho e linha, o destino de cada trecho, o teto do arquivo, a fronteira "não faça X" (nada de conteúdo, nada de harness gerido, nada que mude sentido) e a ordem de devolver a lista do que editou. Worker não decide reclassificar achado: o que não couber na instrução volta como proposta.
   - **Reinstalação e `optimize-memory` são workers desta onda**, cada um com o seu escopo — não tarefas do principal.
   - O principal **valida antes de fechar**: `pop_validate` no escopo corrente e leitura do diff arquivo a arquivo. Correção que introduza violação é revertida e reclassificada como proposta.
4. **Consolide:** o principal monta o relatório a partir dos scripts e das respostas dos workers. Escreva-o em `pop/notes/` do escopo corrente (`notes/` quando o harness mora na própria raiz), com:
   - **Aguardando você**: gates humanos pendentes e questões `aberta` em `open_questions/`, com link e desde quando.
   - **Ajustado nesta revisão**: cada arquivo corrigido, o que mudou em uma linha e a classe que autorizou o conserto. Seção vazia é resposta legítima.
   - **Parado**: tasks sem movimento, com sugestão (retomar, pausar, abandonar) e justificativa de uma linha.
   - **Progresso**: o que andou desde a última revisão (compare com o relatório anterior, se existir).
   - **Propostas**: o que exige decisão — promoções de ideias a epoch, epochs concluíveis, modifications a promover ao roadmap, reescrita de contrato, ajustes de prioridade.
5. Linke o relatório no INBOX.md (seção "Revisões") para o humano encontrar, e commite as correções junto com ele (regra 15) — um commit de revisão, mensagem dizendo que é manutenção de harness.

## Cuidados

- Relatório ≤150 linhas; detalhe extra vira nota linkada.
- **Nunca mova task, mude `stage`, mexa em card ou toque conteúdo de projeto** — nem para "arrumar". Esses são do kanban, e a review não é do kanban.
- Conserto sem achado medido não existe: cada edição desta skill aponta para uma linha do relatório e para o script ou worker que a encontrou.
- Remova relatórios de revisão com mais de 3 meses (ou mova para uma pasta de arquivo) ao criar um novo.
- Achado que só existiria fora do escopo não entra no relatório: vira questão em `open_questions/` ou não existe.
