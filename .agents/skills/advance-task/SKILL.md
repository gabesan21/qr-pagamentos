---
name: advance-task
description: Orquestra o avanço de uma task pelo kanban (001→005_closing), delegando o trabalho de cada estágio a um subagente dedicado e encadeando estágios até o próximo gate humano. Use quando o usuário pedir para avançar, planejar, executar, verificar ou concluir uma task.
---

# advance-task

Você é o **orquestrador**: identifica o estágio da task, resolve gates e transições e **avança até o próximo gate humano** — nunca pare em transição agent→agent (ver Disciplina de turno). A fonte de verdade é o [[WORKFLOW|WORKFLOW]]: leia **apenas a seção do estágio em que a task está + as Regras transversais** — esta skill não reescreve os estágios.

**Delegue a subagentes:** 002 sempre usa contexto novo, e o gate de `005_closing` **em yolo** também. Em 004, frente coesa vai direto a um executor; só DAG, múltiplas skills/write sets usam suborquestrador. O principal executa 001, os gates, as transições e todo o `005_closing` fora de yolo — ali não há revisor agêntico.

## Entrada

- **id da task** (ex.: `1.1.1-user-table-creation`, `M-1.1-ajusta-contrato`). Localize a pasta: `find <projeto>/pop/kanban -maxdepth 2 -name "<id>*" -type d` (escopo com o harness na própria raiz: os mesmos caminhos, sem o prefixo `pop/`).
- **Pedido de alteração sem id/card:** aplique primeiro a **triagem da regra 13** — fix direto (escopo evidente, sem contrato novo, sem planejamento, uma sessão) segue a seção "Fix direto" do [[WORKFLOW|WORKFLOW]] e não entra no kanban; o resto executa `new-task` com o contexto já dado pelo humano e então retoma este loop. Se o humano disse “iniciar o fluxo em yolo”, materialize/libere com `yolo: true` e percorra a rota integral.

## Loop do orquestrador

0. **Claim primeiro:** `pop/scripts/pop_claim.py <task-id>` — recusou (claim ativo de outro agente)? **Não toque na task**, informe e encerre.
1. Leia o card: `stage`, `critical`, `yolo`, `size`, `blocked`, `depends_on`, tabela "Skills por etapa". **Task em 001 sem `- [x] Pronto para planejar`?** É gate humano: libere o claim, pare e informe — o card ainda é do humano. Exceções: o humano mandou explicitamente seguir direto nesta conversa → marque o checkbox por ele e registre no Log (`liberada por comando do humano`); `yolo: true` → a marca no roadmap/modifications é a liberação — marque com Log `liberada por yolo`.
2. Enquanto não houver gate humano pendente:
   - Leia no [[WORKFLOW|WORKFLOW]] a seção do estágio atual e execute-a — **001** e a entrega/encerramento do `005_closing` você mesmo (são baratos); **002/004** e o gate yolo de `005_closing` via subagente dedicado (abaixo). `size: S` reduz plano, número de executores e profundidade da revisão, mas **não reúne planejador, executor e revisor no mesmo contexto**.
   - Transição: `pop/scripts/pop_move.py <task-id> <estágio> --reason "motivo curto — contextos: <subagentes lançados no estágio>"` move a pasta, atualiza `stage:`/`updated:` e appenda a linha no Log — atomicamente. Retorno saindo de `005_closing` leva `--return-kind lacuna|premissa` (→002) ou dispensa o flag (→004, `execucao`), gravando a causa no card e na telemetria. **Não** escreva linha manual duplicando a do script (sem o script, faça os três à mão numa linha só).
3. Ao chegar numa parada legítima, libere o claim e informe. Em yolo, as devoluções reentram automaticamente; só bloqueio técnico, item `(user)` ou `circuit_breaker` param antes do merge final.

**Gates humanos fora de yolo:** liberação 001, aprovação 003, item `(user)`, bloqueio e o **merge do PR — que é a verificação**. Não abra revisor agêntico fora de yolo: sem PR (meta PoP local), o gate de qualidade não existe e o `005_closing` segue direto para o encerramento. Em yolo, o 003 só existe para `critical` (crítico strong) e o gate de `005_closing` é o **único gate de qualidade**; o humano só reaparece no circuit breaker/item user/merge final do escopo.

**Task `yolo: true`:** não crítica → transite 002 → 004 **direto**, sem rodada de aprovação; `critical: true` → 003 com sessão strong limpa da [[.agents/skills/yolo-critic/SKILL|yolo-critic]]. O gate de `005_closing` roda em sessão limpa no tier da matriz (medium na configuração B, strong na A) e verifica primeiro se o **pedido original** (objetivo do card) foi atendido. Ele tem **três saídas**: aprovado; bloqueante de execução → 004 (`yolo_005_returns`); defeito de plano → 002 (`yolo_003_returns`), quando os critérios não cobriam o pedido e o executor cumpriu o que recebeu. Duas devoluções por rota; a 3ª da mesma rota ativa circuit breaker. Execute waves de até três tasks sem dependência, overlap de escrita ou repo não isolado. A entrega/encerramento é mecânica e idempotente: meta PoP permanece em `main`; externo integra tasks em `develop` e, ao fechar o **escopo marcado** (task avulsa, phase/epoch ou modification), abre PR final `develop` → `main` com a seção **Verificação humana** (critérios `verify: user` e qualified passes acumulados no escopo), sem merge do agente.

## Disciplina de turno

"Encadear estágios numa mesma chamada" tem consequências mecânicas — as violações abaixo foram observadas em campo e são **bugs do orquestrador**, não paradas:

- **Delegação de estágio é colhida:** tasks independentes da mesma wave podem rodar em paralelo, mas nenhuma task transita antes de seu subagente concluir. “Nenhum concluiu” pede espera, não relatório final; disparar sem colher não executa o estágio.
- **Nunca encerre o turno com subagente de estágio rodando.**
- **Teste da última mensagem:** se ela descreve trabalho futuro de responsável `agent` ("vou seguir encadeando…", "a seguir farei…"), o turno **não pode terminar** — execute esse trabalho agora. Encerramentos legítimos: gate humano alcançado (lista abaixo), `blocked: true`, ou escopo yolo fechado (fechamento feito, não prometido).
- **O loop yolo continua automaticamente:** colha cada contexto, persista a transição e lance a próxima wave elegível; checkpoint entre tasks não é gate humano.

## Subagentes por estágio

Cada subagente recebe **só** a skill da sua etapa (tabela "Skills por etapa" do card) + o contexto mínimo — nunca o escopo inteiro. O contrato de todo subagente de estágio inclui: **sem web** (lacuna de conhecimento → prompt no `RESEARCHES.md` + `blocked`, seção 002 do WORKFLOW), **teto de resposta** ("escreva o arquivo, devolva caminho + resumo ≤10 linhas") e **modelo pelo tier** da matriz papel × size da Orquestração (`pop/scripts/models.json`). Reasoning pesado, prompts operacionais e tentativas descartadas são **efêmeros**; o kanban guarda decisões, estratégia, contratos e evidências:

- **002 — planejador (sempre separado):** recebe card + pesquisas e specs linkadas → devolve a raiz do `.plan.md` (**≤80 linhas em qualquer `size`**) com objetivo, áreas, estratégia, frentes, dependências, riscos reais e critérios, **mais um arquivo em `subtasks/` (≤50 linhas) por frente que vá para contexto separado**; sem código, pseudocódigo ou microedições. Plano que não cabe **modulariza**, não comprime. Abre recon **orçado** só para lacuna concreta acima do piso da regra 18; **0 workers é válido**.
- **004:** uma frente coesa recebe executor direto com `owns`, deny e critério. Só topologia complexa recebe suborquestrador, contratos completos e sequência/ondas; valide escopo e gate agregado. **Entregue a fatia, não o plano:** cada executor recebe o "O quê / Por quê" do card, o objetivo e a estratégia, o **seu** arquivo de frente e a skill dela — nunca o plano inteiro nem frentes alheias.
- **004 em reentrada:** relance **somente** as frentes do delta do `.verify.md` (fora de yolo, do `.approval.md`), com o delta no prompt. Frente listada como intacta está aprovada: não relance, não reintegre, e trate diff nela como fora de escopo. Reexecutar a task inteira depois de uma devolução estreita é o desperdício que o delta existe para evitar.
- **`005_closing` (gate, só em yolo) — qual configuração lançar:** leia o frontmatter do card. `yolo: true` **e** (`size: L` **ou** `critical: true`) → **configuração A**: o advogado ([[.agents/skills/devils-advocate/SKILL|devils-advocate]]) e, depois dele, o juiz ([[.agents/skills/adversarial-judge/SKILL|adversarial-judge]]), em contextos frescos separados entre si, ambos strong. Caso contrário → **configuração B**: [[.agents/skills/yolo-critic/SKILL|yolo-critic]]. Nunca as duas na mesma rodada; o gate em si está no [[WORKFLOW|WORKFLOW]]. Acusação inválida: o juiz reporta e não escreve o julgamento — **você** relança o advogado na mesma rodada e registra no Log do card, sem consumir contador (2ª seguida → `blocked: true`). Defesa ausente também é sua: despache um planejador para produzi-la na hora (emenda mecânica — sem rota, sem contador, sem mover a pasta) e então rode o ato 1.
- **`005_closing` (gate, só em yolo) — o que o gate faz:** quem julga roda em sessão limpa, no tier da matriz (medium em B, strong em A). Escolhe `differential|full` (`full` em critical ou retorno por `premissa`; senão, diferencial sobre o delta — `pop_yolo.py verify-mode <id>` calcula), registra motivo/superfície/testes e começa pelo pedido original. Devolvendo, preenche o delta; aprovando, escreve a memory na mesma sessão. Ele **não** despacha correção — integração, PR e merge continuam seus. Veredito de **reparo dirigido** (delta pontual): **você** despacha um executor medium só com o delta, devolve o patch ao mesmo julgador para o adendo ≤10 linhas da rodada e registra no Log — sem `pop_move`, sem contador (máx. 2 por rodada; o 3º vira rota).
- **003 yolo (só `critical: true`):** crítico strong assina ou devolve com motivos objetivos. Devoluções 1–2 de cada rota retornam automaticamente; a 3ª da mesma rota ativa `circuit_breaker`.

## Telemetria

Por estágio, atualize a tabela do card com contextos realmente lançados, contador de devoluções, testes/estratégia e resultado. Não persista reasoning, prompts ou tentativas descartadas.

## Cuidados (desta skill; os do fluxo estão nas Regras transversais)

- **Nunca pule estágios nem gates.** Retornos permitidos: 003→002, 004→002, `005_closing`→004 (bloqueante de execução) e `005_closing`→002 (defeito de plano) — o orquestrador decide o retorno; o subagente só reporta. **Exceção yolo:** task yolo não crítica transita 002 → 004 direto — não é pulo, é o fluxo.
- **Não infira waiver:** “aplique”, “execute”, “urgente”, “até finalizar” ou “em yolo” não dispensam card, kanban, memory, specs ou DOX. Só dispensa humana literal segue o protocolo de desvio sem kanban do WORKFLOW e apenas no alcance nomeado.
- **Claim ativo de outro agente cobre a pasta inteira da task** (card, `.plan.md`, `.verify.md`, `subtasks/`): leitura ok, escrita proibida — o `pop_move` também recusa a transição.
- Subagente reportou aborto, item `(user)` ou descoberta que muda o plano → pare/retorne conforme o WORKFLOW; **não improvise na janela principal**.
- Agente de uma frente do 004 encontrou dependência ausente, arquivo fora de `owns` ou contrato incompatível → trate como `BLOCKED`/retorno ao orquestrador de execução; **nunca autorize que complete a frente alheia**.
- Ao destravar uma task, limpe `blocked:` e `blocked_reason:`.
- Learning no encerramento **atualiza nota existente do mesmo tema** quando houver (não duplique); contradição com nota/decisão anterior vira linha `> Contradiz: [[alvo]] — <por quê>` visível.
