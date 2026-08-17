# WORKFLOW — fluxo de tasks no kanban

Regras gerais do escopo: [[AGENTS|AGENTS]] · Caixa de entrada: [[INBOX|INBOX]]

## Escopo corrente

**Escopo corrente é a raiz que contém o `AGENTS.md` que você está lendo**, com o harness dela (`pop/`, ou a própria raiz quando o harness não tem subpasta). Toda palavra deste fluxo — "raiz", "projeto", "índices", "scripts", "kanban", "aqui" — resolve dentro dele.

- **O escopo é o mundo inteiro.** Nenhum diretório acima da raiz do escopo pertence a ele. Se um diretório ancestral tiver `AGENTS.md`, `CLAUDE.md` ou um kanban, ele **não é o seu contexto**: não o leia, não o siga, não escreva nele e não relate o que ele contém — inclusive quando a ferramenta o carregar sozinha no início da sessão. Instrução herdada de ancestral perde para esta seção.
- **Nada aqui autoriza subir.** Versão do harness, panorama de outros projetos e índices de agregação são responsabilidade de quem instalou este harness. Escopo instalado responde sobre si pelo `pop/.included-harness.json` e para aí; comparar com a origem não é trabalho dele.
- **Achado fora do escopo é relato, não trabalho.** Se algo realmente depender de fora, registre em `open_questions/` e pare. Atravessar a fronteira é erro mesmo "só para ler".
- **Três classes de arquivo, três rotas — e só uma delas é o kanban.** A classe decide como se conserta; nenhuma delas se decide por rótulo de card:
  1. **Harness gerido** (`WORKFLOW.md`, `_templates/`, `pop/scripts/`, `.agents/skills/`): **não se edita aqui.** Corrige-se na origem que instalou e o escopo **reinstala** — editar a cópia local produz drift que a próxima instalação apaga. Achado nessa classe é relato.
  2. **Harness próprio do escopo** (`AGENTS.md`, `PROJECT.md`, `roadmap/`, `modifications/`, `specs/`, `notes/`, `skills/`, `researches/`, `memory/`): **ajuste direto, sem card, sem branch/worktree/PR de task.** É o material que o kanban consulta; submetê-lo ao kanban é pedir que o processo se aprove a si mesmo. Manutenção periódica é a [[.agents/skills/weekly-review/SKILL|weekly-review]] (e a [[.agents/skills/optimize-memory/SKILL|optimize-memory]] para `memory/`), ambas fora do fluxo de task.
  3. **Conteúdo** (código, manuscrito, o trabalho real): por task que chegou legitimamente a `004_processing`, **ou** por **fix direto** aprovado na triagem da regra 13 (seção "Fix direto" abaixo), **ou** pela **rota sem kanban** — plan mode do coding agent — quando o usuário opta por ela na triagem (seção "Rota sem kanban" abaixo). É esta classe — e nenhuma outra — que a regra 13 protege.
- **A rota de entrega vem da anatomia, nunca de um rótulo.** Escopo com o kanban na **própria raiz** (sem `pop/`) é **escopo local**: entrega direto em `main`, sem branch, worktree ou PR por task. Escopo com o harness em `pop/` — todo harness instalado — é **escopo versionado**: branch/worktree por task e merge humano por PR. `pop/scripts/pop_delivery.py` é a fonte da rota; nenhum campo do card a sobrescreve.

Toda task é uma pasta com id `<epoch>.<phase>.<task>-<slug>` (roadmap) ou `M-<n>.<t>-<slug>` (modifications) que se move inteira entre os estágios do `kanban/` do projeto.

## Responsável por estágio

| Estágio | Responsável | Executa | O que acontece |
|---------|-------------|---------|----------------|
| 001_initial_task | agent (**+ user** libera) | agente principal | Card mínimo nasce do roadmap ou de uma modification; só sai com liberação humana. |
| 002_planning | agent | `pop-planner` | Produz um brief: objetivo, estratégia, frentes, contratos, riscos e critérios. |
| 003_human_approval | **user** | agente principal; yolo critical: `pop-judge-dredd` | Humano aprova o brief; em yolo, o gate só existe para `critical`. |
| 004_processing | agent | `pop-executor` ou `pop-execution-orchestrator` | Executa frente coesa ou coordena especialistas; só o principal integra. |
| 005_closing | **yolo:** agent · **não-yolo:** user | yolo: `pop-judge-dredd` · não-yolo: agente principal | Gate de qualidade, integração/PR e encerramento (memory, specs, limpeza) num estágio só. |

Cada artefato declara seu responsável. Agentes nunca executam item `(user)` nem marcam `- [ ] Feito` no lugar do humano. O INBOX deriva do frontmatter; mantenha `stage`, `critical`, `blocked` e `awaiting_merge` fiéis.

## Orquestração

O agente principal da sessão segue `AGENTS.md`; não existe custom agent `pop-orchestrator`. Ele trabalha delegation-first, controla claim, gates, transições e integração e só executa diretamente ato pontual e simples abaixo do piso. O raciocínio pesado, prompts operacionais e coordenação especializada são efêmeros.

Contrato durável: [[specs/orquestracao-multiagente|orquestração multiagente]] — *siga ao mudar papéis, ownership, paralelismo ou artefatos*.

- **002 — `pop-planner` sempre separado:** adquire card e links pertinentes pelos paths autorizados e devolve o `.plan.md` mais os arquivos de frente. `pop-recon` só existe para pergunta específica acima do piso da regra 18; quando necessário, o planner devolve seu pedido/envelope ao principal, que faz o spawn direto e devolve ao planner o path do resultado. Zero workers é normal.
- **004 — execução adaptativa:** frente coesa (uma skill/write set, sem DAG) vai ao `pop-executor`; só topologia complexa recebe `pop-execution-orchestrator` para especialistas sequenciais/ondas. O coordenador produz pedidos/envelopes de executor; o principal faz os spawns diretos e devolve os paths dos resultados para conferência. `pop-planner` nunca executa.
- **005_closing — um gate, um juiz:** em yolo o gate é o `pop-judge-dredd` (skill `judge-dredd`), juiz único em contexto fresco, separado de planejador e executores. Ele julga por leitura do diff/evidência adquiridos nas origens autorizadas e apenas decide se algo precisa ser ajustado; não re-roda critérios nem executa testes (seção "Verificação de phase"). Aprovando, escreve a memory na mesma sessão. `critical`/`size: L` aumentam somente a profundidade, nunca perfil ou número de julgadores. Fora de yolo não existe revisor agêntico: o gate é o PR humano e o estágio inteiro é do agente principal.
- **Aquisição por envelope:** a delegação transmite identidade/rota, paths, permissões, ownership, dependências, gate/delta e contrato de saída; nunca card, plano, spec, diff ou evidência recontados. Cada papel resolve só as origens necessárias à própria saída; path ausente/incompatível resulta em `BLOCKED`.
- **Dispatch achatado:** quando o runtime não aplica allowlist nominal em subagents, somente o agente principal invoca especialistas. Planner e coordenador devolvem pedidos/envelopes; o principal preserva o envelope, não interpreta o trabalho especializado e devolve apenas paths de resultados aos consumidores.
- **001:** fica com o agente principal; em yolo externo, integração em `develop` e abertura do PR final também são mecânicas dele. Escopo local opera direto em `main`.

Modelo e effort são fixos na definição nativa de cada papel. `size`, `critical` ou retorno não selecionam modelo, effort ou papel; não existe catálogo central, fallback ou transição entre perfis.

`size` estima esforço, não autoriza cerimônia automática. Incerteza, risco, quantidade de skills e independência das frentes decidem a topologia. O Log registra apenas os contextos realmente lançados.

`size` também fixa **orçamento numérico** que o orquestrador aplica sem negociar — agentes não calibram esforço sozinhos: **S** = sem recon, frente única, gate em uma leitura; **M** = ≤2 frentes, recon só por lacuna concreta; **L** = ≤4 frentes. Precisar de mais é sinal de task mal dimensionada — divida-a, não infle o orçamento.

Em yolo, o `pop-judge-dredd` conserva o mesmo perfil fixo no 003 critical e no 005; varia apenas a profundidade `differential|full`. Passos mecânicos continuam no contexto principal. Reentrada conserva o papel/perfil e recebe somente o delta e os paths afetados.

## Conteúdo da pasta da task

```
<id>/
├── <id>.md                 ← card
├── <id>.plan.md            ← raiz do brief de 002 (≤80 linhas, sempre)
├── <id>.approval.md        ← rodadas de 003
├── <id>.verify.md          ← julgamento do Judge Dredd (só yolo), uma seção por rodada
└── subtasks/               ← uma frente por arquivo (≤50 linhas): a fatia de leitura de um executor
    └── <id>.g01-<slug>.md
```

Obrigatório sempre que a frente for para um contexto separado; task de frente única não tem `subtasks/`. Os tetos são validados por `pop/scripts/pop_validate.py`. Card com `created:` anterior a **2026-08-04** pode carregar `.defense.md`, `.r<n>.accusation.md` e `.r<n>.judgment.md` como histórico do gate adversarial aposentado; card criado a partir dessa data não produz nenhum dos três.

Templates: [[_templates/TASK|TASK]] · [[_templates/TASK-PLAN|TASK-PLAN]] · [[_templates/TASK-APPROVAL|TASK-APPROVAL]] · [[_templates/TASK-VERIFY|TASK-VERIFY]] · [[_templates/SUBTASKS|SUBTASKS]] · [[_templates/MEMORY|MEMORY]] · [[_templates/MEMORY-ENTRY|MEMORY-ENTRY]].

## Estágios

### 001_initial_task — nascimento (agent, + user libera)

- Pedido de alteração cuja triagem (regra 13 do [[AGENTS|AGENTS]]) decidiu pelo kanban entra por `new-task` e depois `advance-task`; yolo e itens do roadmap/modifications entram pelo kanban por default, com aviso. Ausência de card nunca autoriza editar fora das rotas fix direto e sem kanban. “Iniciar o fluxo em yolo” materializa e libera a task, registra `yolo: true` e percorre esta mesma máquina de estados.
- Crie card mínimo: frontmatter, “O quê / Por quê”, phase ou modification de origem, dependências e links com gatilho. Tasks de modification usam id `M-<n>.<t>-<slug>` e `origin: modifications` (fronteira roadmap × modifications no [[AGENTS|AGENTS]]).
- O card é do humano até `- [x] Pronto para planejar`. Comando explícito permite ao agente marcar com Log; `yolo: true` herda a liberação do roadmap/modifications.
- Declare `depends_on:`. Vazio significa que a task pode concorrer com outras, respeitando WIP.
- Sugira `size: S | M | L`; task ampla demais para um brief coeso deve ser dividida.
- Linke `[[<id>]]` na epoch ou na modification.

### 002_planning — brief de execução (agent)

O `pop-planner` não implementa. Ele decide e resume; não persiste chain-of-thought, pseudocódigo, trechos especulativos nem microedições.

- Comece por card, pesquisas, specs e memory linkadas. Pergunta ainda aberta que exige >~5K tokens de leitura pode virar worker de recon; lacuna vira `RECON NEEDED` com check exato.
- Sem web: lacuna de conhecimento vira prompt no `RESEARCHES.md` + `blocked`; lookup pontual de valor já decidido é permitido e registrado.
- Preflight só quando runtime, ferramenta ou serviço participa da mudança; não repita fingerprint de ambiente irrelevante.
- Escreva o `.plan.md`: objetivo refinado, estratégia, áreas afetadas, frentes, dependências, specs/skills, riscos/abortos relevantes e critérios com verificação + pass observável.
- **Tamanho é modularidade, não compressão.** A raiz do plano fica ≤80 linhas em qualquer `size`. Plano maior se fatia em `subtasks/` ≤50 linhas; cada papel lê apenas os paths/seções autorizados no envelope.
- **Os critérios são o contrato.** Eles valem para o executor e para o gate de `005_closing`, e precisam cobrir o "O quê / Por quê" do card — não só a estratégia escolhida. Critério que não cobre o pedido é defeito de plano, e o gate devolve a 002 por isso.
- **Todo critério declara quem verifica** (`verify: agent | phase | user`). **Task não roda teste algum** — todo critério que exige executar teste (unitário, integração, e2e, bateria) nasce **`phase`**: acumula na checklist da phase e roda uma única vez, na task de verificação dela (seção "Verificação de phase"). `agent` fica para **inspeção barata e determinística** no alcance do agente (leitura de artefato, presença de seção, diff) — consulte `notes/references/limites-de-verificacao.md` do escopo (bloqueios conhecidos de sandbox/infra; nasce no primeiro incidente). Verificação que dependa de infra fora desse alcance nasce `user`: entra na **checklist de verificação humana** da entrega e não bloqueia gate algum. Exigir do agente verificação que ele não pode concluir é defeito de plano.
- **Retorno `lacuna` é emenda, não replanejamento.** Devolução classificada como `lacuna` acrescenta o critério faltante e, se necessário, **um** arquivo de frente novo. O `pop-planner` conserva seu perfil fixo e recebe no envelope só delta e paths afetados; `premissa` autoriza replanejamento completo. Critérios e frentes são **append-only** entre rodadas.
- Cada frente persistida descreve entrega e fronteira, nunca implementação: papel, paths, `owns`, `may_read`, `must_not_edit`, web/skills, dependência/entrada, gate/delta, saída/teto/evidência/status e critérios.
- Specs são criadas/alteradas apenas quando a task muda contrato durável; correção que restaura uma spec existente só a referencia.
- Red-team pode acontecer no raciocínio do planejador ou por worker quando risco justificar, mas sua transcrição não é artefato obrigatório.
- Gate 002→003: objetivo verificável; estratégia e frentes coerentes; dependências explícitas; contratos suficientes; riscos materiais cobertos; **critérios verificáveis e cobrindo o pedido do card, com teste sempre em `verify: phase`**; raiz do plano dentro do teto, com as frentes de contexto separado já fatiadas; nenhuma decisão indispensável escondida no reasoning.

### 003_human_approval — gate humano (user)

- Crie uma rodada enxuta no `.approval.md`: resumo, riscos materiais, critérios principais, resposta e `- [ ] Feito`.
- Só prossiga com `- [x] Feito`: mudanças pedidas → 002; aprovado/vazio → 004.
- **Em yolo, este gate só existe para `critical: true`:** o `pop-judge-dredd` julga o plano em sessão limpa e perfil fixo; até duas devoluções retornam automaticamente a 002 e a 3ª ativa `circuit_breaker`. Task yolo não crítica transita **002 → 004 direto, sem rodada**.
- Só entre em 004 quando toda `depends_on` tiver seu ledger em `memory/<AAAA-MM-DD>/<id>.md`. Não há janela transitória por estágio: task em `005_closing` pode estar aguardando o gate, e a memory só nasce depois dele.
- WIP máximo de três tasks em 004; no yolo o orquestrador prioriza por dependências.

### 004_processing — execução orquestrada (agent)

- Em escopo local, execute diretamente em `main`, sem branch/worktree/PR próprios; valide explicitamente os limites das frentes antes de integrar cada resultado.
- Nos demais escopos, crie a worktree de integração da task, branch `task/<id>`, no repo dono do trabalho; projetos multi-repo criam uma por repo afetado.
- O agente principal classifica a topologia:
  - **executor direto:** uma frente coesa, uma skill predominante e um conjunto de escrita;
  - **suborquestrador:** somente quando há DAG, múltiplas skills ou write sets;
  - **especialistas sequenciais:** ownership distinto, mas dependência lógica entre frentes;
  - **ondas paralelas:** contratos estáveis, dependência satisfeita e conjuntos de escrita independentes.
- Em runtime com dispatch achatado, `pop-planner` e `pop-execution-orchestrator` não invocam filhos: devolvem cada pedido/envelope ao agente principal, que faz o spawn direto e retorna ao consumidor somente os paths do resultado. Isso não autoriza o principal a alterar o envelope, coordenar a DAG, conferir no lugar do consumidor ou integrar antes da conferência especializada.
- Todo envelope efêmero declara: `role`, task/estágio/rodada, paths de entrada, `may_read`, `owns`, `must_not_edit`, web/skills, `depends_on`/`expected_input`, gate ou delta e saída exigida (artefato/formato, teto, evidência e status). Ele não reconta conteúdo substantivo; origem ausente/incompatível → `BLOCKED`, nunca implementação da dependência.
- Agentes paralelos usam branches/worktrees próprias derivadas da branch da task. Eles nunca integram outros workers; o orquestrador centraliza merge/cherry-pick na worktree de integração.
- Antes de integrar, valide o diff contra `owns`/`must_not_edit` com `pop/scripts/pop_check_scope.py --allow ... --deny ...`; alteração fora do escopo é devolvida, mesmo correta.
- Dependência interna não pronta não é lançada. Se um worker encontrar entrada ausente/incompatível, ele reporta; não cria a dependência por conta própria.
- Caminhe o DOX aplicável antes da primeira edição de cada frente. Reuse o extrato se base/hash não mudou; não faça duas caminhadas narrativas iguais.
- **Reentrada é parcial.** Task que voltou do gate executa **somente as frentes nomeadas no delta**; frente aprovada permanece integrada e não é reexecutada nem reintegrada. Valide o diff da reentrada contra o `owns` das frentes do delta — tocar frente intacta é alteração fora de escopo, mesmo correta.
- **Nenhum teste roda aqui.** A task não escreve nem executa suíte por conta própria: critério de teste é `verify: phase` e roda na task de verificação da phase. A verificação da task se limita aos critérios `agent` de inspeção barata.
- **Web é proibida por padrão. Exceção cumulativa de pesquisa oficial:** somente quando o card declara `yolo: true`, entregável exclusivo de pesquisa oficial e nenhuma implementação, o `pop-executor` dessa frente em 004 recebe acesso read-only às fontes oficiais. Agente principal, `pop-planner`, `pop-recon`, `pop-execution-orchestrator`, `pop-judge-dredd`, `pop-phase-verifier` e executores de implementação mantêm deny. Evidência liga URL oficial direta + data absoluta; autenticação, escrita, insuficiência oficial ou ampliação/mistura de escopo resultam em `blocked: true`.
- **Regra de parada de verificação:** no máximo **duas tentativas** de fazer um critério `agent` passar quando a falha é de ambiente (sandbox, permissão, flakiness). Na segunda, registre `ambiente` na telemetria, reclassifique o critério como `verify: user` com Log e **siga em frente** — nunca construa infraestrutura nova só para conseguir verificar: é expansão de escopo.
- Após integrar, valide escopo/ownership (`pop_check_scope.py`) e os critérios `agent` de inspeção. Item `(user)`, aborto ou ausência de rota autorizada → `blocked`; descoberta que muda objetivo/contrato → 002.
- Registre apenas resultados, desvios, commits e evidências relevantes. Tudo integrado e limpo → `005_closing`.

### 005_closing — gate de qualidade, entrega e encerramento (yolo: agent · não-yolo: user)

Um estágio, três atos na ordem. **Nenhum efeito do ato 3 acontece antes da aprovação** quando o gate existe: memory, sync de specs, `close` e exclusão da pasta só rodam depois.

**Ato 1 — gate de qualidade.** Só em yolo. O `pop-judge-dredd` (skill `judge-dredd`) é o juiz único do gate, em sessão limpa e perfil nativo fixo, separada de `pop-planner` e `pop-executor`; `size`/`critical` alteram só a profundidade. Contrato: [[specs/judge-dredd|Judge Dredd]] — *siga sempre: invariantes, poderes e teto do artefato vivem lá, não aqui*.

- **Um juiz, um artefato.** O julgamento nasce no `<id>.verify.md` ([[_templates/TASK-VERIFY|TASK-VERIFY]], ≤80 linhas): pedido original primeiro, depois critérios, specs e diff; achados com severidade e evidência filtrados pelo **teste de materialidade** da skill; veredito único. Rodada nova acrescenta seção no mesmo arquivo e **nunca** apaga a anterior; a de maior número decide. Toda rodada termina com o marcador de máquina `<!-- pop-verdict round=<n> decision=aprovada|reparo-dirigido|execucao|lacuna|premissa -->` — é ele (não a prosa) que `pop_move`/`pop_validate` leem.
- **Aprovação é terminal.** Rodada que aprovou encerra o gate: não existe segundo julgamento, "revisão independente" nem adendo que reverta aprovação — re-julgar aprovação é bug de orquestração, infla contador e o `pop_move` recusa retorno cujo último `pop-verdict` seja `aprovada`. Dúvida sobre uma aprovação é assunto do humano, não de outro juiz.
- **Julga por leitura, não por re-run.** O juiz decide sobre o diff integrado e a evidência registrada; ele **não re-roda critérios nem executa testes** — teste é assunto da task de verificação da phase (seção "Verificação de phase"). Critério `verify: phase` não é julgado aqui: o juiz só confere que ele foi registrado na checklist da phase. **Exceção única — disputa teste×código:** achado cujo fundamento é previsão ("este teste falhará contra este código", assert de spec/teste tocado pelo diff contra a implementação) não devolve por leitura: o juiz roda **somente o arquivo de teste em disputa** e anexa o resultado como evidência do achado — nunca a suíte. Run impossível por ambiente segue a regra de qualified pass.
- **A superfície da rodada diferencial é congelada no delta.** Frente aprovada em rodada anterior permanece aprovada: assert ou teste novo introduzido pelo próprio reparo não a invalida retroativamente nem sustenta bloqueante contra ela — senão cada reparo fabrica a reprovação da rodada seguinte e o gate vira regressão infinita. Conflito entre teste novo e implementação aprovada é defeito **do delta** (reparo dirigido no teste ou no ponto exato) ou follow-up; só `premissa` invalida o que já foi verificado.
- Leia nesta ordem: objetivo, specs/contratos e diff; o relato de execução é apoio, não fonte de verdade. Comece respondendo se o **pedido original** — o “O quê / Por quê” do card — foi atendido, antes dos critérios do plano. Escolha `differential` ou `full` e registre motivo/superfície: **retorno anterior não implica revisão cheia** — só `premissa` invalida o que já foi verificado, e `full` fica para ela e para `critical: true`; depois de `lacuna` ou de falha de execução, o diferencial cobre o **delta** (critérios e frentes que reentraram) e audita o resto por evidência. Revise comportamento, bordas, complexidade, acoplamento, nomes, erros, segurança, documentação, specs e DOX tocados; em código, siga `clean-code-review`. Cada achado traz trecho/evidência, impacto e severidade (**bloqueante**, **sugestão** ou **nit**), e há exatamente um juiz por rodada.
- **Transição — gate adversarial aposentado em 2026-08-04.** Card anterior ao corte pode carregar artefatos antigos como evidência histórica; o julgamento pendente já roda com `pop-judge-dredd`. Card novo não os produz.
- **Falha de ambiente nunca devolve.** Critério bloqueado por sandbox/infra ou evidência não determinística (flaky) recebe **qualified pass** com a evidência alternativa disponível e entra na checklist de verificação humana da entrega; devolução exige defeito reproduzível no produto.
- **Reparo dirigido — defeito pontual não paga rodada.** Bloqueante pontual (`arquivo:linha`, remédio objetivo, sem mudança de estratégia) leva `pontual=true`; o agente principal despacha `pop-executor` com o mesmo perfil fixo e somente delta/paths afetados. O mesmo juiz confere em adendo ≤10 linhas, sem contador ou movimento. Máx. dois reparos por rodada; o terceiro exige reclassificar o delta como difuso.
- **O gate não expande o escopo.** Achado real porém fora do "O quê / Por quê" do card vira follow-up rastreável (proposta de task/modification, ou registro na memory), nunca critério ou frente nova desta task. Devolução por `lacuna` cabe **uma vez** por task: a segunda lacuna genuína fecha a task com o que o pedido cobria, e o restante nasce como task própria.
- **Três saídas possíveis:** aprovado → ato 2; **bloqueante de execução** → 004 (o executor não cumpriu o contrato); **defeito de plano** → 002 (o contrato não cobria o pedido, e o executor cumpriu o que recebeu). Cada rota tem contador próprio: execução conta em `yolo_005_returns`, defeito de plano em `yolo_003_returns`. Duas devoluções por contador reentram automaticamente; a 3ª ativa `circuit_breaker`. **Breaker por progresso:** devolução cujo delta repete o tema da anterior sem fato novo não reentra — ativa o circuit breaker antecipado; iterar sem progresso é o desperdício que ele existe para cortar.
- **Toda devolução carrega um delta nomeado**, sem exceção: tipo (`lacuna` | `premissa` | `execucao`), critérios afetados, frentes afetadas e frentes que permanecem intactas. É o delta que faz a devolução custar o tamanho do defeito em vez de um ciclo inteiro — sem ele, 002 não sabe se emenda ou replaneja e 004 não sabe o que reexecutar. Além da prosa, o delta ganha o marcador de máquina `<!-- pop-delta round=<n> kind=<tipo> pontual=true|false paths=<arquivos separados por vírgula> frentes=<Fxx,...> intactas=<Fxx,...> -->` na mesma rodada: o `pop_move` recusa retorno sem veredito/delta coerentes, e a reentrada `004→005_closing` só passa se o diff desde `return_base` (gravado no card pelo próprio `pop_move`) tocar algum `paths` do delta — reapresentar ao juiz o mesmo problema é recusado na origem. O prompt do executor de reentrada nasce do marcador, verbatim — imune a compactação de contexto do orquestrador. O tipo é gravado em `return_kind:` por `python3 pop/scripts/pop_move.py … --return-kind <tipo>`; agente nunca edita esse campo (nem `return_base:`) à mão. Fora de yolo, o humano registra o mesmo delta na rodada de merge do `.approval.md` ao pedir correção no PR.
- **O gate não conserta o que reprovou.** Nomear o delta é o limite do seu poder: juiz que despacha correção passa a avaliar trabalho que encomendou, e a independência — a única razão pela qual o gate vale algo — desaparece.
- **Não-yolo — sem revisor agêntico.** O gate é o **PR humano** do ato 2, e o critério objetivo já rodou em 004 (critérios de inspeção + `pop_check_scope.py`). Sem PR — escopo local — não existe gate de verificação: o estágio segue direto para o ato 3. Consequência aceita por decisão de 2026-07-27; a prova fica em `main` e na memory.

**Ato 2 — integração e PR.** Escopo local já está em `main`, sem branch/worktree/PR da task. Escopo externo **não-yolo**: abra o PR da task, marque `pr:` e `awaiting_merge: true` e aguarde o merge humano. Escopo externo **yolo**: integre mecanicamente em `develop`, sem PR por task. Todo PR carrega a seção **Verificação humana**: os critérios `verify: user` acumulados (incluindo os reclassificados por `ambiente`), cada um com o passo manual e o pass esperado; sem PR (escopo local), a checklist entra na rodada/open question de aprovação final — o humano é o verificador de última instância desses itens.

**Ato 3 — encerramento.** Idempotente: valide o estado antes de cada efeito, pule o que já está feito e aborte preservando card/roadmap diante de falha técnica.

1. Escreva a memory da task em `memory/<AAAA-MM-DD>/`, onde a pasta é a data de conclusão (igual a `finished`): o **ledger** `<id>.md` ([[_templates/MEMORY|MEMORY]], ≤1200 chars) com ID, projeto, datas, commit, PR, entrega, verificação, impacto em contratos e o índice das entradas; e uma **entrada** `<id>.<nn>-<slug>.md` ([[_templates/MEMORY-ENTRY|MEMORY-ENTRY]], ≤800 chars) por coisa feita — áreas alteradas, telemetria, cada decisão durável, cada desvio —, numeradas na ordem cronológica e cada uma com **ao menos um wikilink de evidência**. Em yolo, escreve o `pop-judge-dredd` que aprovou, na mesma sessão.
2. Sincronize apenas specs/DOX realmente afetados; atualize status da task/phase/epoch/modification e índices se necessário.
3. Remova a linha da task com `python3 pop/scripts/pop_roadmap.py close <id>`; a operação exige card em `005_closing` e memory válida. Preserve epoch, phase, modification e tasks abertas.
4. Extraia learning somente quando houver conhecimento reutilizável; nos escopos externos, remova as worktrees/branches efêmeras da task.
   - **Colheita do julgamento.** Decisão **contestada e sustentada** no `.verify.md` vira registro durável só quando os **três** testes passam: julgada com fundamento · **reincidência** (o fundamento decidiria uma task futura que não conhece esta; se cai junto com este diff, é circunstância) · **inédita** em spec ou nota vigente (se já existe e diverge, corrija a existente em vez de criar outra). Destino: contrato, invariante ou interface durável → linha em spec; razão de uma escolha → nota em `notes/decisions/`. **Default é não registrar:** falhou um teste, a decisão morre na memory da task, cujas entradas já carregam decisões/desvios — e julgamento sem colheita **não** gera registro de "sem colheita".
5. Se esta foi a última task de escopo yolo externo, abra automaticamente PR `develop` → `main`. Falha, conflito ou branch ausente → `blocked`; o merge é sempre humano. Sem Git, crie a rodada de aprovação final.
6. Apague `kanban/005_closing/<id>/` somente após os passos anteriores; memory + Git preservam a prova durável.

### Verificação de phase — onde os testes rodam

Teste não roda por task: **roda uma vez por phase**, concentrado na última task dela. É a regra que barateia o fluxo — task comum entrega e é julgada por leitura; a suíte paga-se uma única vez.

- **Toda phase de roadmap termina com uma task de verificação** (slug `verificacao-da-phase`, última da tabela, `depends_on` todas as demais): o `plan-roadmap` a propõe e o `new-task` a materializa como qualquer task. O 002 dela recebe a **checklist da phase** — todos os critérios `verify: phase` acumulados pelas tasks anteriores (a fonte é a memory e os planos arquivados no Git).
- **Escopo da task de verificação:** o `pop-phase-verifier` adquire checklist/specs/código pelos paths autorizados, escreve/atualiza a suíte, roda e corrige somente a phase. O gate do `pop-judge-dredd` dela pode exigir re-run: é a única task em que teste é critério `agent`.
- **Defeito acima do alcance da phase** (contrato durável errado, pedido de task anterior não atendido de forma estrutural) não se conserta aqui: vira proposta de modification ou task nova, com o achado registrado na memory.
- **A phase só conclui com a task de verificação aprovada.** Tasks de modification não pertencem a phase: seus critérios seguem `agent` (inspeção) ou `user`, e teste indispensável nelas usa verificação determinística barata declarada no plano.

## Regras transversais

- **Comando explícito do humano vence somente no alcance nomeado:** obedeça sem reinterpretar o que ele efetivamente sobrescreveu e registre o desvio. “Aplique”, “execute”, “urgente” e “até finalizar” não decidem a triagem por você. **O kanban é opcional** (regra 13 do [[AGENTS|AGENTS]]): “em yolo” ou item do roadmap/modifications implica kanban por default — avise e siga — e a rota sem kanban nunca dispensa memory, specs ou as skills do projeto.
- **Uma execução vai até a parada legítima:** fora de yolo valem os gates humanos; em yolo só bloqueio técnico, item `(user)` ou `circuit_breaker` interrompem antes do merge final. Subagente de estágio é colhido.
- **Nenhum trabalho fora de rota:** conteúdo do projeto muda em 004 (após 003 ou pela transição legítima 002→004 do yolo não crítico, na worktree apropriada), pela rota de fix direto aprovada na triagem da regra 13 **ou pela rota sem kanban (plan mode) escolhida pelo usuário na triagem**. Pedido que a triagem manda ao kanban executa `new-task` → `advance-task`; não improvise.
- **Paralelismo exige duas independências:** lógica (não depende do resultado alheio) e escrita (não disputa arquivos/contratos). Especialização pode ser sequencial.
- **Claim é por task:** `pop_claim.py` protege a pasta contra outro orquestrador; ownership de frentes protege workers dentro dela.
- **Telemetria mínima:** por estágio registre contextos lançados, nº de devoluções, testes/estratégia, resultado e **duração** (diferença entre as linhas de Log do `pop_move`); nunca reasoning, prompts ou transcrição. **Watchdog:** task em 004 sem commit, ref ou linha de Log nova há mais de ~2h é anomalia — o orquestrador registra `blocked_reason` ou justifica no Log; janela morta silenciosa é bug de orquestração.
- **Orçamento de parede do gate (yolo):** o ciclo `005_closing` + reparos de uma task tem teto de parede por `size` — **S ~1h, M ~2h, L/critical ~3h**, medidos da primeira entrada em `005_closing` (timestamps da telemetria/Log). Estourou sem aprovação → o orquestrador **não lança outra rodada**: registra `blocked: true` com diagnóstico (o que cada rodada devolveu e por quê o progresso parou) e devolve ao humano. Atividade constante que não converge é tão anômala quanto janela morta — é o buraco que 8h de gate girando provaram existir.
- **Devolução é incremental:** todo retorno saindo de `005_closing` nomeia um delta e é classificado em `return_kind`; a reentrada trabalha só no delta e a re-revisão é diferencial sobre ele. **Evidência cara é reusada:** matriz de captura, bateria longa ou run custoso só se regenera na fatia afetada pelo delta — o resto vale por carimbo/hash da rodada anterior; re-rodar tudo a cada rodada é o gasto dominante que o diferencial existe para evitar. Retorno que apaga trabalho aprovado é bug do orquestrador.
- Arquivos móveis usam wikilink só pelo nome. Retornos normais: 003→002, 004→002, `005_closing`→004 (bloqueante de execução) e `005_closing`→002 (defeito de plano).

### Fix direto — a rota sem card

A triagem da regra 13 do [[AGENTS|AGENTS]] decide na entrada. Fix direto quando **todas** valem: escopo evidente pelo próprio pedido; nenhum contrato durável novo; dispensa entrevista de planejamento; cabe numa sessão. Qualquer "não" — ou dúvida que uma pergunta de uma linha não resolva — vira task.

1. Execute pela rota de entrega do escopo (local: direto em `main`; versionado: branch curta + PR, como qualquer entrega).
2. Verifique com o gate agregado/testes determinísticos — sem revisor agêntico. Critério não verificável pelo agente vai à checklist de verificação humana (PR ou INBOX).
3. Prova durável: ledger `memory/<AAAA-MM-DD>/F-AAAAMMDD-<slug>.md` ([[_templates/MEMORY|MEMORY]], `authorization: triagem de fix direto`) + uma entrada por coisa feita, e sync das specs/DOX afetados. **Nenhuma linha em roadmap ou MODIFICATIONS** — o registro é memory + specs.
4. Cresceu no meio (segundo objetivo, contrato durável tocado)? **Pare**: materialize a task e relate no card o que já foi feito.

### Rota sem kanban — plan mode do coding agent

O kanban é **opcional**: o agente o recomenda quando a alteração é grande, e ele é default subentendido (com aviso ao usuário) quando o pedido é yolo ou cobre item do roadmap/modifications. Quando o usuário opta por não usar o kanban, a rota é o **plan mode do próprio coding agent** — planejamento e aprovação acontecem ali, sem card, estágios ou `pop_move`. A rota dispensa cerimônia, **nunca continuidade**:

1. Antes de escrever, registre o pedido e a escolha no ledger `memory/<AAAA-MM-DD>/D-AAAAMMDD-<slug>.md`, usando [[_templates/MEMORY|MEMORY]]; o ID `D-` identifica trabalho sem card e preenche `authorization`.
2. Planeje no plan mode do coding agent e só execute com o plano aprovado; a entrega segue a rota do escopo (local: direto em `main`; versionado: branch curta + PR, como qualquer entrega).
3. **Agentes e skills do projeto continuam valendo:** delegation-first, os seis especialistas, `clean-code-*`, `ui-*` e as demais skills aplicáveis — a rota muda o tracking, não o padrão de trabalho.
4. Antes de encerrar, complete o ledger com commit/PR, resultado e verificação, abra uma entrada por coisa feita e registre a avaliação de impacto em specs e DOX, atualizando somente os contratos realmente afetados.
5. Sem rota para essa prova durável, não edite. Se o trabalho crescer além do plano aprovado (segundo objetivo, contrato durável novo), **pare** e volte à triagem.
6. A rota sem kanban **não tem modo yolo**: sem card não há `pop-judge-dredd`, circuit breaker nem gates — quem aprova o plano e o resultado é o humano.

## Yolo mode

`yolo: true` delega o julgamento ao `pop-judge-dredd` e mantém a mesma máquina de estados, com **gate único de qualidade no `005_closing`**. Fora de yolo esse gate não existe — o gate é o PR humano. **Pedir yolo subentende kanban:** o agente avisa (“isso vai pelo kanban”) e materializa a task; a rota sem kanban não tem modo yolo.

- A marca vem do roadmap/modifications, pode ser herdada ou ser definida pelo humano ao pedir “iniciar o fluxo em yolo”. Nesse pedido sem card, `new-task` materializa, registra a origem conversacional e libera a task; yolo nunca é waiver. O escopo auto-materializa waves de até três tasks independentes: dependências satisfeitas e escrita/repos isolados; colisão serializa.
- **Gate único:** task yolo não crítica vai de 002 direto a 004. No `005_closing`, `pop-judge-dredd` nasce em sessão limpa e perfil fixo, adquire as origens do envelope, verifica primeiro o pedido original e julga por leitura; `size`/`critical` alteram apenas `differential|full`. Aprovando, escreve a memory antes de devolver ao agente principal.
- **Duas devoluções por rota, sempre com delta:** bloqueante de execução volta a 004 (`yolo_005_returns`, tipo `execucao`); defeito de plano volta a 002 (`yolo_003_returns`, tipo `lacuna` ou `premissa`). A 3ª falha da mesma rota ativa o circuit breaker. Só as frentes do delta reentram. **Um juiz por rodada e aprovação terminal:** veredito `aprovada` encerra o gate — nenhum segundo julgamento; delta `pontual=true` segue reparo dirigido, sem `pop_move` nem contador. As travas são mecânicas: `pop_move` valida os marcadores `pop-verdict`/`pop-delta` do `.verify.md` e recusa reentrada sem trabalho nos `paths` do delta; o orçamento de parede do gate (Regras transversais) corta o ciclo que não converge.
- **`critical: true` é a exceção:** mantém o 003 com `pop-judge-dredd` antes da execução (duas devoluções a 002; 3ª = circuit breaker) e o 005 sempre `full`, sem trocar perfil.
- Só bloqueio técnico, item `(user)` ou circuit breaker interrompem; devolução normal reentra automaticamente no fluxo.
- **Merge humano no fim do escopo marcado** — task avulsa, phase/epoch ou modification: fora do escopo local, o orquestrador, não o juiz, integra cada task em `develop`, sem PR por task. Quando a última task do escopo fecha o `005_closing`, abre automaticamente o PR `develop` → `main`, registra resumo/testes/criticals mais a checklist de verificação humana (critérios `verify: user` do escopo) e aguarda o merge humano. Em escopo local tudo permanece em `main`, sem branch/worktree/PR da task ou do escopo.
