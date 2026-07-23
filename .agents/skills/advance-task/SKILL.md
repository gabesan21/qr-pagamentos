---
name: advance-task
description: Orquestra o avanço de uma task pelo kanban (001→006), delegando o trabalho de cada estágio a um subagente dedicado e encadeando estágios até o próximo gate humano. Use quando o usuário pedir para avançar, planejar, executar, verificar ou concluir uma task.
---

# advance-task

Você é o **orquestrador**: identifica o estágio da task, resolve gates e transições e **avança até o próximo gate humano** — nunca pare em transição agent→agent (ver Disciplina de turno). A fonte de verdade é o [[WORKFLOW|WORKFLOW]]: leia **apenas a seção do estágio em que a task está + as Regras transversais** — esta skill não reescreve os estágios.

**Delegue a subagentes:** 002 e 005 sempre usam contexto novo. Em 004, frente coesa vai direto a um executor; só DAG, múltiplas skills/write sets usam suborquestrador. O principal executa 001, 006, gates e transições.

## Entrada

- **id da task** (ex.: `1.1.1-user-table-creation`, `M-1.1-ajusta-contrato`). Localize a pasta: `find <projeto>/pop/kanban -maxdepth 2 -name "<id>*" -type d` (meta-projeto da raiz do vault e projetos ainda não migrados: harness na raiz, sem `pop/`).
- **Pedido de alteração sem id/card:** execute primeiro `new-task` com o contexto já dado pelo humano e então retome este loop. Ausência de card é entrada do fluxo, nunca autorização para escrever. Se o humano disse “iniciar o fluxo em yolo”, materialize/libere com `yolo: true` e percorra a rota integral.

## Loop do orquestrador

0. **Claim primeiro:** `pop/scripts/pop_claim.py <task-id>` — recusou (claim ativo de outro agente)? **Não toque na task**, informe e encerre.
1. Leia o card: `stage`, `critical`, `yolo`, `size`, `blocked`, `depends_on`, tabela "Skills por etapa". **Task em 001 sem `- [x] Pronto para planejar`?** É gate humano: libere o claim, pare e informe — o card ainda é do humano. Exceções: o humano mandou explicitamente seguir direto nesta conversa → marque o checkbox por ele e registre no Log (`liberada por comando do humano`); `yolo: true` → a marca no roadmap/modifications é a liberação — marque com Log `liberada por yolo`.
2. Enquanto não houver gate humano pendente:
   - Leia no [[WORKFLOW|WORKFLOW]] a seção do estágio atual e execute-a — **001 e 006** você mesmo (são baratos); **002/004/005** via subagente dedicado (abaixo). `size: S` reduz plano, número de executores e profundidade da revisão, mas **não reúne planejador, executor e revisor no mesmo contexto**.
   - Transição: `pop/scripts/pop_move.py <task-id> <estágio> --reason "motivo curto — contextos: <subagentes lançados no estágio>"` move a pasta, atualiza `stage:`/`updated:` e appenda a linha no Log — atomicamente. **Não** escreva linha manual duplicando a do script (sem o script, faça os três à mão numa linha só).
3. Ao chegar numa parada legítima, libere o claim e informe. Em yolo, devoluções 003/005 reentram automaticamente; só bloqueio técnico, item `(user)` ou `circuit_breaker` param antes do merge final.

**Gates humanos fora de yolo:** liberação 001, aprovação 003, `critical` em 005, item `(user)`, bloqueio e merge. Em yolo, o 003 só existe para `critical` (crítico strong) e o 005 é o **gate único de qualidade**; o humano só reaparece no circuit breaker/item user/merge final do escopo.

**Task `yolo: true`:** não crítica → transite 002 → 004 **direto**, sem rodada de aprovação; `critical: true` → 003 com sessão strong limpa da [[.agents/skills/yolo-critic/SKILL|yolo-critic]]. O 005 é sempre strong em sessão limpa e verifica primeiro se o **pedido original** (objetivo do card) foi atendido — o brief é estratégia, não contrato aprovado. Cada gate permite duas devoluções automáticas; 3ª falha ativa circuit breaker. Execute waves de até três tasks sem dependência, overlap de escrita ou repo não isolado. 006 é mecânico/idempotente: meta PoP permanece em `main`; externo integra tasks em `develop` e, ao fechar o **escopo marcado** (task avulsa, phase/epoch ou modification), abre PR final `develop` → `main`, sem merge do agente.

## Disciplina de turno

"Encadear estágios numa mesma chamada" tem consequências mecânicas — as violações abaixo foram observadas em campo e são **bugs do orquestrador**, não paradas:

- **Delegação de estágio é colhida:** tasks independentes da mesma wave podem rodar em paralelo, mas nenhuma task transita antes de seu subagente concluir. “Nenhum concluiu” pede espera, não relatório final; disparar sem colher não executa o estágio.
- **Nunca encerre o turno com subagente de estágio rodando.**
- **Teste da última mensagem:** se ela descreve trabalho futuro de responsável `agent` ("vou seguir encadeando…", "a seguir farei…"), o turno **não pode terminar** — execute esse trabalho agora. Encerramentos legítimos: gate humano alcançado (lista abaixo), `blocked: true`, ou escopo yolo fechado (fechamento feito, não prometido).
- **O loop yolo continua automaticamente:** colha cada contexto, persista a transição e lance a próxima wave elegível; checkpoint entre tasks não é gate humano.

## Subagentes por estágio

Cada subagente recebe **só** a skill da sua etapa (tabela "Skills por etapa" do card) + o contexto mínimo — nunca o vault inteiro. O contrato de todo subagente de estágio inclui: **sem web** (lacuna de conhecimento → prompt no `RESEARCHES.md` + `blocked`, seção 002 do WORKFLOW), **teto de resposta** ("escreva o arquivo, devolva caminho + resumo ≤10 linhas") e **modelo pelo tier** da matriz papel × size da Orquestração (`pop/scripts/models.json`). Reasoning pesado, prompts operacionais e tentativas descartadas são **efêmeros**; o kanban guarda decisões, estratégia, contratos e evidências:

- **002 — planejador (sempre separado):** recebe card + pesquisas e specs linkadas → devolve um `.plan.md` breve com objetivo, áreas, estratégia, frentes, dependências, riscos reais e critérios; sem código, pseudocódigo ou microedições. Abre recon **orçado** só para lacuna concreta acima do piso da regra 18; **0 workers é válido**.
- **004:** uma frente coesa recebe executor direto com `owns`, deny e critério. Só topologia complexa recebe suborquestrador, contratos completos e sequência/ondas; valide escopo e gate agregado.
- **005:** revisor independente; em yolo sempre strong e sessão limpa. Ele escolhe `differential|full`, registra motivo/superfície/testes e usa full em critical ou após retorno. Em yolo, o primeiro critério é o pedido original atendido.
- **003 yolo (só `critical: true`):** crítico strong assina ou devolve com motivos objetivos. Em 003 e 005, devoluções 1–2 retornam automaticamente; 3ª falha ativa `circuit_breaker`.

## Telemetria

Por estágio, atualize a tabela do card com contextos realmente lançados, contador de devoluções, testes/estratégia e resultado. Não persista reasoning, prompts ou tentativas descartadas.

## Cuidados (desta skill; os do fluxo estão nas Regras transversais)

- **Nunca pule estágios nem gates.** Retornos permitidos: 003→002, 004→002, 005→004 — o orquestrador decide o retorno; o subagente só reporta. **Exceção yolo:** task yolo não crítica transita 002 → 004 direto — não é pulo, é o fluxo.
- **Não infira waiver:** “aplique”, “execute”, “urgente”, “até finalizar” ou “em yolo” não dispensam card, kanban, memory, specs ou DOX. Só dispensa humana literal segue o protocolo de desvio sem kanban do WORKFLOW e apenas no alcance nomeado.
- **Claim ativo de outro agente cobre a pasta inteira da task** (card, `.plan.md`, `.verify.md`, `subtasks/`): leitura ok, escrita proibida — o `pop_move` também recusa a transição.
- Subagente reportou aborto, item `(user)` ou descoberta que muda o plano → pare/retorne conforme o WORKFLOW; **não improvise na janela principal**.
- Agente de uma frente do 004 encontrou dependência ausente, arquivo fora de `owns` ou contrato incompatível → trate como `BLOCKED`/retorno ao orquestrador de execução; **nunca autorize que complete a frente alheia**.
- Ao destravar uma task, limpe `blocked:` e `blocked_reason:`.
- Learning em 006 **atualiza nota existente do mesmo tema** quando houver (não duplique); contradição com nota/decisão anterior vira linha `> Contradiz: [[alvo]] — <por quê>` visível.
