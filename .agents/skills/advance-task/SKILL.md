---
name: advance-task
description: Orquestra o avanço de uma task pelo kanban (001→006), delegando o trabalho de cada estágio a um subagente dedicado e encadeando estágios até o próximo gate humano. Use quando o usuário pedir para avançar, planejar, executar, verificar ou concluir uma task.
---

# advance-task

Você é o **orquestrador**: identifica o estágio da task, resolve gates e transições e **avança até o próximo gate humano** — nunca pare em transição agent→agent (ver Disciplina de turno). A fonte de verdade é o [[WORKFLOW|WORKFLOW]]: leia **apenas a seção do estágio em que a task está + as Regras transversais** — esta skill não reescreve os estágios.

**Delegue a subagentes:** todo o trabalho de 002, 004 e 005, sempre com contexto novo por etapa. O orquestrador do kanban executa só 001, 006, gates e transições; no 004 ele delega a um **orquestrador de execução**, que escolhe a topologia e integra as frentes.

## Entrada

- **id da task** (ex.: `1.1.1-user-table-creation`). Localize a pasta: `find <projeto>/pop/kanban -maxdepth 2 -name "<id>*" -type d` (meta-projeto da raiz do vault e projetos ainda não migrados: harness na raiz, sem `pop/`).

## Loop do orquestrador

0. **Claim primeiro:** `pop/scripts/pop_claim.py <task-id>` — recusou (claim ativo de outro agente)? **Não toque na task**, informe e encerre.
1. Leia o card: `stage`, `critical`, `yolo`, `size`, `blocked`, `depends_on`, tabela "Skills por etapa". **Task em 001 sem `- [x] Pronto para planejar`?** É gate humano: libere o claim, pare e informe — o card ainda é do humano. Exceções: o humano mandou explicitamente seguir direto nesta conversa → marque o checkbox por ele e registre no Log (`liberada por comando do humano`); `yolo: true` → a marca no roadmap é a liberação — marque com Log `liberada por yolo (marcado no roadmap)`.
2. Enquanto não houver gate humano pendente:
   - Leia no [[WORKFLOW|WORKFLOW]] a seção do estágio atual e execute-a — **001 e 006** você mesmo (são baratos); **002/004/005** via subagente dedicado (abaixo). `size: S` reduz plano, número de executores e profundidade da revisão, mas **não reúne planejador, executor e revisor no mesmo contexto**.
   - Transição: `pop/scripts/pop_move.py <task-id> <estágio> --reason "motivo curto — contextos: <subagentes lançados no estágio>"` move a pasta, atualiza `stage:`/`updated:` e appenda a linha no Log — atomicamente. **Não** escreva linha manual duplicando a do script (sem o script, faça os três à mão numa linha só).
3. Ao chegar num gate, **libere o claim** (`pop/scripts/pop_claim.py <task-id> --release`), **pare e informe**: estágio atual, o que aguarda o humano e o que a próxima chamada fará.

**Gates humanos (únicas paradas):** liberação em `001` (`- [x] Pronto para planejar`); aprovação em `003`; verificação humana se `critical: true` em `005`; item `(user)` de subtask; `blocked: true`; rodada de merge em `006`.

**Task `yolo: true`** (seção Yolo mode do [[WORKFLOW|WORKFLOW]]): o gate de 003 e a revisão de 005 são delegados ao **revisor independente** ([[.agents/skills/yolo-critic/SKILL|yolo-critic]]), em sessões novas e separadas — sem PR nem `pr:`/`awaiting_merge:` por task; a integração de 006 é mecânica e fica com o orquestrador. Param no humano só item `(user)`, `blocked: true` e a revisão final do escopo. **Loop de escopo:** concluída uma task de escopo yolo, materialize a próxima elegível da phase/epoch (`new-task` sem entrevista, em ordem de `depends_on`, WIP 3 priorizado por você) até o escopo terminar — aí faça o fechamento de escopo (open_question de entrega, **sem PR automático**; escopo de 1 task fecha ao final dela mesma). Marca yolo removida mid-flight vale a partir do próximo gate.

## Disciplina de turno

"Encadear estágios numa mesma chamada" tem consequências mecânicas — as violações abaixo foram observadas em campo e são **bugs do orquestrador**, não paradas:

- **Delegação de estágio é síncrona:** ao lançar o subagente de 002/004/005/revisão, **aguarde o resultado antes de qualquer outra coisa**. Se o harness roda subagentes em background por padrão, use o modo síncrono/bloqueante; se só houver espera ativa, espere até concluir. "Nenhum subagente concluiu ainda" não é estado final — é sinal de que a espera continua. Disparar ≠ delegar: estágio cujo resultado não foi colhido é estágio **não executado**.
- **Nunca encerre o turno com subagente de estágio rodando.**
- **Teste da última mensagem:** se ela descreve trabalho futuro de responsável `agent` ("vou seguir encadeando…", "a seguir farei…"), o turno **não pode terminar** — execute esse trabalho agora. Encerramentos legítimos: gate humano alcançado (lista abaixo), `blocked: true`, ou escopo yolo fechado (fechamento feito, não prometido).
- **O loop de escopo yolo roda no mesmo turno:** concluída uma task, materialize e avance a próxima elegível na mesma execução, até fim do escopo, `blocked` ou item `(user)`. Relatório de progresso se dá no fechamento — não é ponto de parada.

## Subagentes por estágio

Cada subagente recebe **só** a skill da sua etapa (tabela "Skills por etapa" do card) + o contexto mínimo — nunca o vault inteiro. O contrato de todo subagente de estágio inclui: **sem web** (lacuna de conhecimento → prompt no `RESEARCHES.md` + `blocked`, seção 002 do WORKFLOW), **teto de resposta** ("escreva o arquivo, devolva caminho + resumo ≤10 linhas") e **modelo pelo tier** da matriz papel × size da Orquestração (`pop/scripts/models.json`). Reasoning pesado, prompts operacionais e tentativas descartadas são **efêmeros**; o kanban guarda decisões, estratégia, contratos e evidências:

- **002 — planejador (sempre separado):** recebe card + pesquisas e specs linkadas → devolve um `.plan.md` breve com objetivo, áreas, estratégia, frentes, dependências, riscos reais e critérios; sem código, pseudocódigo ou microedições. Abre recon **orçado** só para lacuna concreta acima do piso da regra 18; **0 workers é válido**.
- **004 — orquestrador de execução:** recebe plano + contexto mínimo → escolhe **executor único**, **especialistas sequenciais** ou **ondas paralelas**. Para cada frente cria contrato efêmero com `owns`, `may_read`, `must_not_edit`, `depends_on`, `expected_input`, skill e critério. Só dispara quando dependências estiverem integradas; ausência/incompatibilidade gera `BLOCKED`, nunca implementação oportunista. Paralelos usam worktree/branch isolada e exigem independência lógica e de escrita. Valide cada diff com `python3 pop/scripts/pop_check_scope.py --allow <owns> --deny <must_not_edit>`, integre centralmente e rode o gate agregado; prompts não viram artefato.
- **005 — revisor independente:** recebe objetivo/card + specs + diff integrado + tabela de critérios → devolve o `.verify.md` com evidências e achados. Em contexto fresco e nunca como executor, compara implementação ao objetivo, reexecuta testes/gates e revisa qualidade do código; classifica achados como `bloqueante | sugestão | nit`. `critical` muda tier e profundidade, não cria um segundo revisor. Em yolo, use [[.agents/skills/yolo-critic/SKILL|yolo-critic]] em nova sessão, mesmo que o mesmo papel tenha julgado 003.
- **003 yolo — revisor do plano:** recebe card + `.plan.md` + `.approval.md` → assina ou devolve com motivos objetivos pela [[.agents/skills/yolo-critic/SKILL|yolo-critic]]; teto de 2 devoluções. Não executa nem integra a task.

## Cuidados (desta skill; os do fluxo estão nas Regras transversais)

- **Nunca pule estágios nem gates.** Retornos permitidos: 003→002, 004→002, 005→004 — o orquestrador decide o retorno; o subagente só reporta.
- **Claim ativo de outro agente cobre a pasta inteira da task** (card, `.plan.md`, `.verify.md`, `subtasks/`): leitura ok, escrita proibida — o `pop_move` também recusa a transição.
- Subagente reportou aborto, item `(user)` ou descoberta que muda o plano → pare/retorne conforme o WORKFLOW; **não improvise na janela principal**.
- Agente de uma frente do 004 encontrou dependência ausente, arquivo fora de `owns` ou contrato incompatível → trate como `BLOCKED`/retorno ao orquestrador de execução; **nunca autorize que complete a frente alheia**.
- Ao destravar uma task, limpe `blocked:` e `blocked_reason:`.
- Learning em 006 **atualiza nota existente do mesmo tema** quando houver (não duplique); contradição com nota/decisão anterior vira linha `> Contradiz: [[alvo]] — <por quê>` visível.
