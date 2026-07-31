# WORKFLOW — fluxo de tasks no kanban

Regras gerais do escopo: [[AGENTS|AGENTS]] · Caixa de entrada: [[INBOX|INBOX]]

## Escopo corrente

**Escopo corrente é a raiz que contém o `AGENTS.md` que você está lendo**, com o harness dela (`pop/`, ou a própria raiz quando o harness não tem subpasta). Toda palavra deste fluxo — "raiz", "projeto", "índices", "scripts", "kanban", "aqui" — resolve dentro dele.

- **O escopo é o mundo inteiro.** Nenhum diretório acima da raiz do escopo pertence a ele. Se um diretório ancestral tiver `AGENTS.md`, `CLAUDE.md` ou um kanban, ele **não é o seu contexto**: não o leia, não o siga, não escreva nele e não relate o que ele contém — inclusive quando a ferramenta o carregar sozinha no início da sessão. Instrução herdada de ancestral perde para esta seção.
- **Nada aqui autoriza subir.** Versão do harness, panorama de outros projetos e índices de agregação são responsabilidade de quem instalou este harness. Escopo instalado responde sobre si pelo `pop/.included-harness.json` e para aí; comparar com a origem não é trabalho dele.
- **Achado fora do escopo é relato, não trabalho.** Se algo realmente depender de fora, registre em `open_questions/` e pare. Atravessar a fronteira é erro mesmo "só para ler".
- **A rota de entrega vem da anatomia, nunca de um rótulo.** Escopo com o kanban na **própria raiz** (sem `pop/`) é **escopo local**: entrega direto em `main`, sem branch, worktree ou PR por task. Escopo com o harness em `pop/` — todo harness instalado — é **escopo versionado**: branch/worktree por task e merge humano por PR. `pop/scripts/pop_delivery.py` é a fonte da rota; nenhum campo do card a sobrescreve.

Toda task é uma pasta com id `<epoch>.<phase>.<task>-<slug>` (roadmap) ou `M-<n>.<t>-<slug>` (modifications) que se move inteira entre os estágios do `kanban/` do projeto.

## Responsável por estágio

| Estágio | Responsável | Executa | O que acontece |
|---------|-------------|---------|----------------|
| 001_initial_task | agent (**+ user** libera) | orquestrador | Card mínimo nasce do roadmap ou de uma modification; só sai com liberação humana. |
| 002_planning | agent | planejador separado | Produz um brief: objetivo, estratégia, frentes, contratos, riscos e critérios. |
| 003_human_approval | **user** | orquestrador prepara | Humano aprova o brief; em yolo, o gate só existe para `critical` (crítico strong). |
| 004_processing | agent | orquestrador de execução | Escolhe executor único ou especialistas em sequência/ondas e integra os resultados. |
| 005_closing | **yolo:** agent · **não-yolo:** user | yolo: configuração A (advogado → juiz) ou B (revisor único) · não-yolo: orquestrador | Gate de qualidade, integração/PR e encerramento (memory, specs, limpeza) num estágio só. |

Cada artefato declara seu responsável. Agentes nunca executam item `(user)` nem marcam `- [ ] Feito` no lugar do humano. O INBOX deriva do frontmatter; mantenha `stage`, `critical`, `blocked` e `awaiting_merge` fiéis.

## Orquestração

O agente principal controla claim, gates e transições. O raciocínio pesado, os prompts operacionais e a coordenação entre especialistas são **efêmeros**: o kanban guarda decisões, contratos e evidências, não transcrições do pensamento.

Contrato durável: [[specs/orquestracao-multiagente|orquestração multiagente]] — *siga ao mudar papéis, ownership, paralelismo ou artefatos*.

- **002 — planejador sempre separado:** recebe card + links pertinentes e devolve o `.plan.md` mais os arquivos de frente. Recon delegado só existe para pergunta específica acima do piso da regra 18; zero workers é normal.
- **004 — execução adaptativa:** frente coesa (uma skill/write set, sem DAG) vai direto a um executor; só topologia complexa recebe suborquestrador para especialistas sequenciais/ondas. Planejador nunca executa.
- **005_closing — um gate:** em yolo ele roda em **configuração B** (um revisor independente em contexto fresco) ou em **configuração A** (advogado do diabo e, depois dele, o juiz, em contextos frescos separados entre si e de planejador/executor). Quem julga por último escreve a memory na mesma sessão — acabou de ler o diff, não há por que pagar outra leitura. `critical` aumenta profundidade/modelo, não acrescenta juiz nem revisor. Fora de yolo não existe revisor agêntico: o gate é o PR humano e o estágio inteiro é do orquestrador principal.
- **Fatiamento de leitura:** cada papel recebe só a sua fatia. Executor de frente lê o "O quê / Por quê" do card, o objetivo e a estratégia do plano, o **seu** arquivo de frente e a skill dela — nunca o plano inteiro nem frentes alheias.
- **001:** fica com o orquestrador principal; em yolo externo, integração em `develop` e abertura do PR final também são mecânicas dele. Escopo local opera direto em `main`.

Modelos são escolhidos pelo papel e pelo risco, via `pop/scripts/models.json`:

| Papel | S | M | L / critical |
|-------|---|---|--------------|
| planejador 002 | medium | strong | strong |
| worker de recon | — | cheap | cheap |
| orquestrador de execução 004 | medium | medium | strong |
| especialista de execução | cheap/medium | medium | medium |
| revisor independente, advogado ou juiz (só yolo) | medium | medium | strong |

`size` estima esforço, não autoriza cerimônia automática. Incerteza, risco, quantidade de skills e independência das frentes decidem a topologia. O Log registra apenas os contextos realmente lançados.

Em yolo, quem julga o `005_closing` — revisor único, advogado ou juiz — usa sempre tier **strong**, independentemente de `size`. Executor sobe de `cheap` para `medium` na rodada seguinte **somente após retorno `execucao`** — segunda execução custa mais que a diferença de tier. Retorno `lacuna`/`premissa` não é falha dele e não muda seu tier.

## Conteúdo da pasta da task

```
<id>/
├── <id>.md                 ← card
├── <id>.plan.md            ← raiz do brief de 002 (≤80 linhas, sempre)
├── <id>.approval.md        ← rodadas de 003
├── <id>.defense.md         ← decisões contestáveis do plano (002, só quando o gate adversarial liga)
├── <id>.verify.md          ← julgamento do revisor independente (só yolo, configuração B)
├── <id>.r<n>.accusation.md ← acusação do advogado do diabo (só configuração A, uma por rodada)
├── <id>.r<n>.judgment.md   ← veredito do juiz (só configuração A, uma por rodada)
└── subtasks/               ← uma frente por arquivo (≤50 linhas): a fatia de leitura de um executor
    └── <id>.g01-<slug>.md
```

Obrigatório sempre que a frente for para um contexto separado; task de frente única não tem `subtasks/`. Os tetos são validados por `pop/scripts/pop_validate.py`. Os três últimos são **exclusivos entre si por configuração**: em A não existe `.verify.md`, em B não existem `.accusation.md` nem `.judgment.md`.

Templates: [[_templates/TASK|TASK]] · [[_templates/TASK-PLAN|TASK-PLAN]] · [[_templates/TASK-APPROVAL|TASK-APPROVAL]] · [[_templates/TASK-DEFENSE|TASK-DEFENSE]] · [[_templates/TASK-VERIFY|TASK-VERIFY]] · [[_templates/TASK-ACCUSATION|TASK-ACCUSATION]] · [[_templates/TASK-JUDGMENT|TASK-JUDGMENT]] · [[_templates/SUBTASKS|SUBTASKS]] · [[_templates/MEMORY|MEMORY]] · [[_templates/MEMORY-ENTRY|MEMORY-ENTRY]].

## Estágios

### 001_initial_task — nascimento (agent, + user libera)

- Pedido de alteração sem card ativo entra por `new-task` e depois `advance-task`; ausência de card nunca autoriza editar. “Iniciar o fluxo em yolo” materializa e libera a task, registra `yolo: true` e percorre esta mesma máquina de estados.
- Crie card mínimo: frontmatter, “O quê / Por quê”, phase ou modification de origem, dependências e links com gatilho. Tasks de modification usam id `M-<n>.<t>-<slug>` e `origin: modifications` (fronteira roadmap × modifications no [[AGENTS|AGENTS]]).
- O card é do humano até `- [x] Pronto para planejar`. Comando explícito permite ao agente marcar com Log; `yolo: true` herda a liberação do roadmap/modifications.
- Declare `depends_on:`. Vazio significa que a task pode concorrer com outras, respeitando WIP.
- Sugira `size: S | M | L`; task ampla demais para um brief coeso deve ser dividida.
- Linke `[[<id>]]` na epoch ou na modification.

### 002_planning — brief de execução (agent)

O planejador não implementa. Ele decide e resume; não persiste chain-of-thought, pseudocódigo, trechos especulativos nem microedições.

- Comece por card, pesquisas, specs e memory linkadas. Pergunta ainda aberta que exige >~5K tokens de leitura pode virar worker de recon; lacuna vira `RECON NEEDED` com check exato.
- Sem web: lacuna de conhecimento vira prompt no `RESEARCHES.md` + `blocked`; lookup pontual de valor já decidido é permitido e registrado.
- Preflight só quando runtime, ferramenta ou serviço participa da mudança; não repita fingerprint de ambiente irrelevante.
- Escreva o `.plan.md`: objetivo refinado, estratégia, áreas afetadas, frentes, dependências, specs/skills, riscos/abortos relevantes e critérios com run + pass observável.
- **Tamanho é modularidade, não compressão.** A raiz do plano fica ≤80 linhas **em qualquer `size`** — é a fatia que todos leem. Plano que não couber **se fatia** em `subtasks/`, um arquivo ≤50 linhas por frente que vá para contexto separado; o que cresce com o `size` é o número de arquivos, não o tamanho de cada um. Dividir a task por `depends_on` é exceção, para quando as frentes não compartilham objetivo.
- **Os critérios são o contrato.** Eles valem para o executor e para o gate de `005_closing`, e precisam cobrir o "O quê / Por quê" do card — não só a estratégia escolhida. Critério que não cobre o pedido é defeito de plano, e o gate devolve a 002 por isso.
- **Retorno `lacuna` é emenda, não replanejamento.** Devolução classificada como `lacuna` (o entregue está correto, só incompleto) acrescenta o critério que faltou e, se necessário, **um** arquivo de frente novo — nada de reescrever o plano. Critérios e frentes são **append-only** entre rodadas: renumerar quebra as referências do `.verify.md` e da telemetria. Só `premissa` (a estratégia estava errada) justifica replanejar de verdade.
- **Defesa quando o gate adversarial liga.** Task com `yolo: true` **e** (`size: L` **ou** `critical: true`) entrega, além do plano, o `<id>.defense.md` ([[_templates/TASK-DEFENSE|TASK-DEFENSE]]): lista curta das decisões contestáveis — escolha adotada, alternativa rejeitada, por quê e o que a falsificaria —, nunca chain-of-thought. É o que o advogado ataca no ato 1; sem ela a configuração A não roda.
- Cada frente persistida descreve **entrega e fronteira**, nunca implementação: `owns`, `may_read`, `must_not_edit`, `depends_on`, entrada esperada, skill e critérios. Detalhe operacional pertence ao prompt efêmero do executor.
- Specs são criadas/alteradas apenas quando a task muda contrato durável; correção que restaura uma spec existente só a referencia.
- Red-team pode acontecer no raciocínio do planejador ou por worker quando risco justificar, mas sua transcrição não é artefato obrigatório.
- Gate 002→003: objetivo verificável; estratégia e frentes coerentes; dependências explícitas; contratos suficientes; riscos materiais cobertos; **critérios executáveis e cobrindo o pedido do card**; raiz do plano dentro do teto, com as frentes de contexto separado já fatiadas; **defesa presente quando o gatilho liga**; nenhuma decisão indispensável escondida no reasoning.

### 003_human_approval — gate humano (user)

- Crie uma rodada enxuta no `.approval.md`: resumo, riscos materiais, critérios principais, resposta e `- [ ] Feito`.
- Só prossiga com `- [x] Feito`: mudanças pedidas → 002; aprovado/vazio → 004.
- **Em yolo, este gate só existe para `critical: true`:** o crítico strong independente julga; até duas devoluções retornam automaticamente a 002 e a 3ª falha ativa `circuit_breaker`. Task yolo não crítica transita **002 → 004 direto, sem rodada** — o yolo confia no plano do agente e concentra o julgamento no `005_closing`.
- Só entre em 004 quando toda `depends_on` tiver seu ledger em `memory/<AAAA-MM-DD>/<id>.md`. Não há janela transitória por estágio: task em `005_closing` pode estar aguardando o gate, e a memory só nasce depois dele.
- WIP máximo de três tasks em 004; no yolo o orquestrador prioriza por dependências.

### 004_processing — execução orquestrada (agent)

- Em escopo local, execute diretamente em `main`, sem branch/worktree/PR próprios; valide explicitamente os limites das frentes antes de integrar cada resultado.
- Nos demais escopos, crie a worktree de integração da task, branch `task/<id>`, no repo dono do trabalho; projetos multi-repo criam uma por repo afetado.
- O orquestrador principal classifica a topologia:
  - **executor direto:** uma frente coesa, uma skill predominante e um conjunto de escrita;
  - **suborquestrador:** somente quando há DAG, múltiplas skills ou write sets;
  - **especialistas sequenciais:** ownership distinto, mas dependência lógica entre frentes;
  - **ondas paralelas:** contratos estáveis, dependência satisfeita e conjuntos de escrita independentes.
- Todo contrato efêmero de frente declara: `owns`, `may_read`, `must_not_edit`, `depends_on`, `expected_input`, skill, critério de conclusão e “dependência ausente → reporte BLOCKED; nunca a implemente”.
- Agentes paralelos usam branches/worktrees próprias derivadas da branch da task. Eles nunca integram outros workers; o orquestrador centraliza merge/cherry-pick na worktree de integração.
- Antes de integrar, valide o diff contra `owns`/`must_not_edit` com `pop/scripts/pop_check_scope.py --allow ... --deny ...`; alteração fora do escopo é devolvida, mesmo correta.
- Dependência interna não pronta não é lançada. Se um worker encontrar entrada ausente/incompatível, ele reporta; não cria a dependência por conta própria.
- Caminhe o DOX aplicável antes da primeira edição de cada frente. Reuse o extrato se base/hash não mudou; não faça duas caminhadas narrativas iguais.
- **Reentrada é parcial.** Task que voltou do gate executa **somente as frentes nomeadas no delta**; frente aprovada permanece integrada e não é reexecutada nem reintegrada. Valide o diff da reentrada contra o `owns` das frentes do delta — tocar frente intacta é alteração fora de escopo, mesmo correta.
- Rode o gate agregado após integrar. Item `(user)`, aborto ou ausência de rota autorizada → `blocked`; descoberta que muda objetivo/contrato → 002.
- Registre apenas resultados, desvios, commits e evidências relevantes. Tudo integrado e limpo → `005_closing`.

### 005_closing — gate de qualidade, entrega e encerramento (yolo: agent · não-yolo: user)

Um estágio, três atos na ordem. **Nenhum efeito do ato 3 acontece antes da aprovação** quando o gate existe: memory, sync de specs, `close` e exclusão da pasta só rodam depois.

**Ato 1 — gate de qualidade.** O orquestrador lê `yolo`, `size` e `critical` no frontmatter do card e escolhe entre três casos mutuamente exclusivos — nenhuma marca nova liga o gate. Contrato: [[specs/gate-adversarial|gate adversarial]] — *siga sempre: invariantes, poderes de cada papel e tetos dos artefatos vivem lá, não aqui*.

- **Configuração A — par adversarial**, quando `yolo: true` e (`size: L` ou `critical: true`). Em contextos frescos e nesta ordem: o **advogado do diabo** (skill `devils-advocate`) acusa execução e decisões da defesa em `<id>.r<n>.accusation.md`; depois o **juiz** (skill `adversarial-judge`), em contexto separado, julga cada acusação, responde primeiro se o pedido original do card foi atendido e emite veredito e rota em `<id>.r<n>.judgment.md`. Nessa rodada não roda revisor independente, e é o juiz quem escreve a memory ao aprovar. Defesa ausente: o ato 1 não roda e a task volta a 002 para produzi-la.
- **Transição — card anterior ao gate.** O gate vigora desde **2026-07-27**: card com `created:` anterior a essa data passou por 002 quando a defesa ainda não existia, então defesa ausente **não** o devolve a 002 — ele roda em **configuração B** e o orquestrador registra a aplicação desta cláusula no Log do card. Vale só `created:` (imutável); nenhum campo novo.
- **Acusação inválida não é veredito.** Item sem severidade, evidência ou remédio — ou artefato acima do teto — não é julgado: o juiz reporta ao orquestrador e **não** escreve `<id>.r<n>.judgment.md`, e o **orquestrador** relança o advogado na mesma rodada. **Reemissão não é rodada nova:** ela reescreve o `<id>.r<n>.accusation.md` daquela mesma rodada — `n` não avança e nenhum artefato já julgado é tocado. Não é rota e não consome contador; registre no Log do card. Segunda acusação inválida seguida → `blocked: true`.
- **Uma rodada, um par de arquivos.** Cada rodada do ato 1 escreve os seus: `<id>.r<n>.accusation.md` e `<id>.r<n>.judgment.md`, desde `r1`. Rodada nova **nunca** sobrescreve nem apaga a anterior — a rodada 1 da 8.2.2 se perdeu assim —, a de maior `n` é a que decide e os tetos valem por rodada. Forma: [[specs/gate-adversarial|gate adversarial]] › Interfaces.
- **Configuração B — revisor único** nas demais tasks `yolo: true`, em contexto fresco. Leia nesta ordem: objetivo, specs/contratos, testes e diff; o relato de execução é apoio, não fonte de verdade. Comece respondendo se o **pedido original** — o “O quê / Por quê” do card — foi atendido, antes dos critérios do plano. Escolha `differential` ou `full` e registre motivo/superfície/testes: **retorno anterior não implica revisão cheia** — só `premissa` invalida o que já foi verificado, e `full` fica para ela e para `critical: true`; depois de `lacuna` ou de falha de execução, o diferencial cobre o **delta** (critérios e frentes que reentraram) e audita o resto por evidência. Revise comportamento, bordas, testes, complexidade, acoplamento, nomes, erros, segurança, documentação, specs e DOX tocados; em código, siga `clean-code-review`. Cada achado traz trecho/evidência, impacto e severidade (**bloqueante**, **sugestão** ou **nit**), e há exatamente um revisor por rodada.
- **Três saídas possíveis:** aprovado → ato 2; **bloqueante de execução** → 004 (o executor não cumpriu o contrato); **defeito de plano** → 002 (o contrato não cobria o pedido, e o executor cumpriu o que recebeu). Cada rota tem contador próprio: execução conta em `yolo_005_returns`, defeito de plano em `yolo_003_returns`. Duas devoluções por contador reentram automaticamente; a 3ª ativa `circuit_breaker`.
- **Toda devolução carrega um delta nomeado**, sem exceção: tipo (`lacuna` | `premissa` | `execucao`), critérios afetados, frentes afetadas e frentes que permanecem intactas. É o delta que faz a devolução custar o tamanho do defeito em vez de um ciclo inteiro — sem ele, 002 não sabe se emenda ou replaneja e 004 não sabe o que reexecutar. O tipo é gravado em `return_kind:` por `python3 pop/scripts/pop_move.py … --return-kind <tipo>`; agente nunca edita esse campo à mão. Fora de yolo, o humano registra o mesmo delta na rodada de merge do `.approval.md` ao pedir correção no PR.
- **O gate não conserta o que reprovou.** Nomear o delta é o limite do seu poder: revisor que despacha correção passa a avaliar trabalho que encomendou, e a independência — a única razão pela qual o gate vale algo — desaparece.
- **Não-yolo — sem revisor agêntico.** O gate é o **PR humano** do ato 2, e o critério objetivo já rodou em 004 (gate agregado + `pop_check_scope.py`). Sem PR — escopo local — não existe gate de verificação: o estágio segue direto para o ato 3. Consequência aceita por decisão de 2026-07-27; a prova fica em `main` e na memory.

**Ato 2 — integração e PR.** Escopo local já está em `main`, sem branch/worktree/PR da task. Escopo externo **não-yolo**: abra o PR da task, marque `pr:` e `awaiting_merge: true` e aguarde o merge humano. Escopo externo **yolo**: integre mecanicamente em `develop`, sem PR por task.

**Ato 3 — encerramento.** Idempotente: valide o estado antes de cada efeito, pule o que já está feito e aborte preservando card/roadmap diante de falha técnica.

1. Escreva a memory da task em `memory/<AAAA-MM-DD>/`, onde a pasta é a data de conclusão (igual a `finished`): o **ledger** `<id>.md` ([[_templates/MEMORY|MEMORY]], ≤1200 chars) com ID, projeto, datas, commit, PR, entrega, verificação, impacto em contratos e o índice das entradas; e uma **entrada** `<id>.<nn>-<slug>.md` ([[_templates/MEMORY-ENTRY|MEMORY-ENTRY]], ≤800 chars) por coisa feita — áreas alteradas, telemetria, cada decisão durável, cada desvio —, numeradas na ordem cronológica e cada uma com **ao menos um wikilink de evidência** (a spec alterada, o arquivo tocado). Entrada não indexada pelo ledger é órfã; memory inválida aborta o fechamento. Em yolo, quem escreve é quem aprovou (revisor único em B, juiz em A), na mesma sessão — ele já leu o diff.
2. Sincronize apenas specs/DOX realmente afetados; atualize status da task/phase/epoch/modification e índices se necessário.
3. Remova a linha da task com `python3 pop/scripts/pop_roadmap.py close <id>`; a operação exige card em `005_closing` e memory válida. Preserve epoch, phase, modification e tasks abertas.
4. Extraia learning somente quando houver conhecimento reutilizável; nos escopos externos, remova as worktrees/branches efêmeras da task.
   - **Colheita do julgamento.** Decisão **contestada e sustentada** no `.judgment.md` vira registro durável só quando os **três** testes passam: julgada com fundamento · **reincidência** (o fundamento decidiria uma task futura que não conhece esta; se cai junto com este diff, é circunstância) · **inédita** em spec ou nota vigente (se já existe e diverge, corrija a existente em vez de criar outra). Destino: contrato, invariante ou interface durável → linha em spec; razão de uma escolha → nota em `notes/decisions/`. **Default é não registrar:** falhou um teste, a decisão morre na memory da task, cujas entradas já carregam decisões/desvios — e julgamento sem colheita **não** gera registro de "sem colheita".
5. Se esta foi a última task de escopo yolo externo, abra automaticamente PR `develop` → `main`. Falha, conflito ou branch ausente → `blocked`; o merge é sempre humano. Sem Git, crie a rodada de aprovação final.
6. Apague `kanban/005_closing/<id>/` somente após os passos anteriores; memory + Git preservam a prova durável.

## Regras transversais

- **Comando explícito do humano vence somente no alcance nomeado:** obedeça sem reinterpretar o que ele efetivamente sobrescreveu e registre o desvio. “Aplique”, “execute”, “urgente”, “até finalizar” e “em yolo” não dispensam card, kanban ou continuidade; “iniciar o fluxo em yolo” exige a rota yolo inteira. Só uma dispensa literal e inequívoca ativa o protocolo abaixo; ambiguidade/destrutividade admite uma única pergunta.
- **Uma execução vai até a parada legítima:** fora de yolo valem os gates humanos; em yolo só bloqueio técnico, item `(user)` ou `circuit_breaker` interrompem antes do merge final. Subagente de estágio é colhido.
- **Nenhum trabalho fora de task:** conteúdo do projeto só muda em 004, após 003 ou pela transição legítima 002→004 do yolo não crítico, na worktree apropriada. Sem card, execute `new-task` → `advance-task`; não improvise.
- **Paralelismo exige duas independências:** lógica (não depende do resultado alheio) e escrita (não disputa arquivos/contratos). Especialização pode ser sequencial.
- **Claim é por task:** `pop_claim.py` protege a pasta contra outro orquestrador; ownership de frentes protege workers dentro dela.
- **Telemetria mínima:** por estágio registre contextos lançados, nº de devoluções, testes/estratégia e resultado; nunca reasoning, prompts ou transcrição.
- **Devolução é incremental:** todo retorno saindo de `005_closing` nomeia um delta e é classificado em `return_kind`; a reentrada trabalha só no delta e a re-revisão é diferencial sobre ele. Retorno que apaga trabalho aprovado é bug do orquestrador.
- Arquivos móveis usam wikilink só pelo nome. Retornos normais: 003→002, 004→002, `005_closing`→004 (bloqueante de execução) e `005_closing`→002 (defeito de plano).

### Protocolo de desvio sem kanban

Somente ordem humana literal como “não use o kanban” ou “faça fora do PoP” dispensa os estágios. O waiver é específico: nenhuma outra regra ou proteção fica dispensada por inferência.

1. Antes de escrever, registre o comando autorizador e o alcance no ledger `memory/<AAAA-MM-DD>/D-AAAAMMDD-<slug>.md`, usando [[_templates/MEMORY|MEMORY]]; o ID `D-` identifica desvio sem card e preenche `authorization`.
2. Preserve as regras de repositório, segurança, ownership e merge que não foram explicitamente sobrescritas.
3. Antes de encerrar, complete o ledger com commit/PR, resultado e verificação, e abra uma entrada por coisa feita e por desvio; registre a avaliação de impacto em specs e DOX e atualize somente os contratos realmente afetados.
4. Sem autorização inequívoca ou sem rota para essa prova durável, não edite: materialize uma task normal.

## Yolo mode

`yolo: true` delega o julgamento a um gate agêntico e mantém a mesma máquina de estados, com **gate único de qualidade no `005_closing`** (configuração A ou B). Fora de yolo esse gate não existe — o gate é o PR humano —, então revisor independente, advogado e juiz são figuras exclusivas do yolo.

- A marca vem do roadmap/modifications, pode ser herdada ou ser definida pelo humano ao pedir “iniciar o fluxo em yolo”. Nesse pedido sem card, `new-task` materializa, registra a origem conversacional e libera a task; yolo nunca é waiver. O escopo auto-materializa waves de até três tasks independentes: dependências satisfeitas e escrita/repos isolados; colisão serializa.
- **Gate único:** task yolo não crítica vai de 002 direto a 004, sem rodada de aprovação — o yolo confia no plano do agente. No `005_closing` o gate roda em **configuração A** ou **B** conforme `size`/`critical`, sem mudar rotas, contadores nem circuit breaker. Em qualquer delas nasce sessão limpa **strong**: quem julga verifica primeiro se o pedido original (objetivo do card) foi atendido, depois plano, specs, diff e qualidade; decide `differential|full` (`full` em critical ou retorno por `premissa`; depois de `lacuna`/execução o diferencial cobre o delta). Aprovando, ele mesmo escreve a memory antes de devolver o turno ao orquestrador.
- **Duas devoluções por rota, sempre com delta:** bloqueante de execução volta a 004 (`yolo_005_returns`, tipo `execucao`); defeito de plano volta a 002 (`yolo_003_returns`, tipo `lacuna` ou `premissa`). A 3ª falha da mesma rota ativa o circuit breaker. Só as frentes do delta reentram.
- **`critical: true` é a exceção:** mantém o 003 com crítico strong antes da execução (duas devoluções a 002; 3ª = circuit breaker) e o gate do `005_closing` sempre `full`.
- Só bloqueio técnico, item `(user)` ou circuit breaker interrompem; devolução normal reentra automaticamente no fluxo.
- **Merge humano no fim do escopo marcado** — task avulsa, phase/epoch ou modification: fora do escopo local, o orquestrador, não o revisor, integra cada task em `develop`, sem PR por task. Quando a última task do escopo fecha o `005_closing`, abre automaticamente o PR `develop` → `main`, registra resumo/testes/criticals e aguarda o merge humano. Em escopo local tudo permanece em `main`, sem branch/worktree/PR da task ou do escopo.
