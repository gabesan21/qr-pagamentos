---
name: advance-task
description: Orquestra o avanço de uma task pelo kanban (001→005_closing), delegando o trabalho de cada estágio a um subagente dedicado e encadeando estágios até o próximo gate humano. Use quando o usuário pedir para avançar, planejar, executar, verificar ou concluir uma task.
---

# advance-task

Você é o **agente principal da sessão**, não um custom agent `pop-orchestrator`: segue `AGENTS.md`, identifica o estágio, resolve gates, transições e integração e **avança até o próximo gate humano**. Opere delegation-first; só faça diretamente ato pontual e simples abaixo do piso e sem separação obrigatória. A fonte de verdade é o [[WORKFLOW|WORKFLOW]]: leia apenas a seção do estágio corrente + Regras transversais.

**Delegue pelos seis especialistas:** 002 usa `pop-planner`; recon acima do piso usa `pop-recon`; 004 usa `pop-executor` ou, só para DAG/múltiplas skills/write sets, `pop-execution-orchestrator`; gates yolo usam `pop-judge-dredd`; a task final da phase usa `pop-phase-verifier`. O principal executa apenas 001, transições, integração e o fechamento mecânico fora de yolo.

## Entrada

- **id da task** (ex.: `1.1.1-user-table-creation`, `M-1.1-ajusta-contrato`). Localize a pasta: `find <projeto>/pop/kanban -maxdepth 2 -name "<id>*" -type d` (escopo com o harness na própria raiz: os mesmos caminhos, sem o prefixo `pop/`).
- **Pedido de alteração sem id/card:** aplique primeiro a **triagem da regra 13** — fix direto (escopo evidente, sem contrato novo, sem planejamento, uma sessão) segue a seção "Fix direto" do [[WORKFLOW|WORKFLOW]] e não entra no kanban; o resto executa `new-task` com o contexto já dado pelo humano e então retoma este loop. Se o humano disse “iniciar o fluxo em yolo”, materialize/libere com `yolo: true` e percorra a rota integral.

## Loop do orquestrador

0. **Claim primeiro:** `pop/scripts/pop_claim.py <task-id>` — recusou (claim ativo de outro agente)? **Não toque na task**, informe e encerre.
1. Leia o card: `stage`, `critical`, `yolo`, `size`, `blocked`, `depends_on`, tabela "Skills por etapa". **Task em 001 sem `- [x] Pronto para planejar`?** É gate humano: libere o claim, pare e informe — o card ainda é do humano. Exceções: o humano mandou explicitamente seguir direto nesta conversa → marque o checkbox por ele e registre no Log (`liberada por comando do humano`); `yolo: true` → a marca no roadmap/modifications é a liberação — marque com Log `liberada por yolo`.
2. Enquanto não houver gate humano pendente:
   - Leia no [[WORKFLOW|WORKFLOW]] a seção do estágio atual e execute-a — **001** e a entrega/encerramento do `005_closing` você mesmo; **002/004** e o gate yolo de `005_closing` via papel dedicado (abaixo). `size: S` reduz plano, número de executores e profundidade, mas **não muda perfil nem reúne planejador, executor e revisor no mesmo contexto**.
   - Transição: `pop/scripts/pop_move.py <task-id> <estágio> --reason "motivo curto — contextos: <subagentes lançados no estágio>"` move a pasta, atualiza `stage:`/`updated:` e appenda a linha no Log — atomicamente. Retorno saindo de `005_closing` leva `--return-kind lacuna|premissa` (→002) ou dispensa o flag (→004, `execucao`), gravando a causa no card e na telemetria. **Não** escreva linha manual duplicando a do script (sem o script, faça os três à mão numa linha só).
3. Ao chegar numa parada legítima, libere o claim e informe. Em yolo, as devoluções reentram automaticamente; só bloqueio técnico, item `(user)` ou `circuit_breaker` param antes do merge final.

**Gates humanos fora de yolo:** liberação 001, aprovação 003, item `(user)`, bloqueio e o **merge do PR — que é a verificação**. Não abra revisor agêntico fora de yolo: sem PR (meta PoP local), o gate de qualidade não existe e o `005_closing` segue direto para o encerramento. Em yolo, o 003 só existe para `critical` com `pop-judge-dredd`, e o gate de `005_closing` é o **único gate de qualidade**; o humano só reaparece no circuit breaker/item user/merge final do escopo.

**Task `yolo: true`:** não crítica → transite 002 → 004 **direto**, sem rodada de aprovação; `critical: true` → 003 com sessão limpa de `pop-judge-dredd`. O gate de `005_closing` usa nova sessão do mesmo papel/perfil fixo e verifica primeiro se o **pedido original** foi atendido; `size`/`critical` alteram só a profundidade. Ele tem **três saídas**: aprovado; bloqueante de execução → 004 (`yolo_005_returns`); defeito de plano → 002 (`yolo_003_returns`). Duas devoluções por rota; a 3ª ativa circuit breaker. Execute waves de até três tasks independentes. A entrega/encerramento é mecânica e idempotente: meta PoP permanece em `main`; externo integra em `develop` e abre PR final `develop` → `main`, sem merge do agente.

## Disciplina de turno

"Encadear estágios numa mesma chamada" tem consequências mecânicas — as violações abaixo foram observadas em campo e são **bugs do orquestrador**, não paradas:

- **Delegação de estágio é colhida:** tasks independentes da mesma wave podem rodar em paralelo, mas nenhuma task transita antes de seu subagente concluir. “Nenhum concluiu” pede espera, não relatório final; disparar sem colher não executa o estágio.
- **Nunca encerre o turno com subagente de estágio rodando.**
- **Teste da última mensagem:** se ela descreve trabalho futuro de responsável `agent` ("vou seguir encadeando…", "a seguir farei…"), o turno **não pode terminar** — execute esse trabalho agora. Encerramentos legítimos: gate humano alcançado (lista abaixo), `blocked: true`, ou escopo yolo fechado (fechamento feito, não prometido).
- **O loop yolo continua automaticamente:** colha cada contexto, persista a transição e lance a próxima wave elegível; checkpoint entre tasks não é gate humano.

## Subagentes por estágio

Cada papel delegado recebe um **envelope**, nunca contexto substantivo recontado: `role`, task/estágio/rodada, paths de entrada, `may_read`, `owns`, `must_not_edit`, web/skills, `depends_on`/`expected_input`, gate/delta e saída (artefato/formato, teto, evidência, status). O papel adquire apenas o necessário diretamente nesses paths; origem ou skill ausente/incompatível → `BLOCKED`. Web é deny por padrão. A exceção automática vale só para `pop-executor` em 004 quando as três condições cumulativas de pesquisa oficial estiverem no card; autenticação, escrita, insuficiência oficial ou mistura de escopo bloqueiam. `pop-planner`, `pop-recon`, `pop-execution-orchestrator`, `pop-judge-dredd`, `pop-phase-verifier` e executores de implementação mantêm deny explícito. Perfil nativo é fixo por papel; `size`, `critical` e retornos não selecionam modelo ou effort. Reasoning, prompts e tentativas descartadas são efêmeros:

- **002 — `pop-planner`:** adquire card, pesquisas/specs linkadas e skills pelos paths do envelope; devolve `.plan.md` ≤80 linhas + uma fatia ≤50 por frente separada, com status/evidência. Pode chamar `pop-recon` só para lacuna concreta acima do piso; **0 workers é válido**.
- **004:** `pop-executor` adquire "O quê/Por quê", objetivo/estratégia, sua única fatia e skills nas origens apontadas. Só topologia complexa recebe `pop-execution-orchestrator`; nenhum deles lê plano inteiro ou frente alheia. O principal valida o resultado contra `owns`/deny antes de integrar.
- **004 em reentrada:** relance **somente** as frentes do delta do `.verify.md` (fora de yolo, do `.approval.md`), com o delta no prompt — **monte o prompt do executor a partir do marcador `<!-- pop-delta ... -->` e da seção de delta, verbatim**, nunca da sua memória da conversa (compactação de contexto perde o delta; o arquivo não). Frente listada como intacta está aprovada: não relance, não reintegre, e trate diff nela como fora de escopo. Antes de mover de volta a `005_closing`, confira que o diff tocou os `paths` do delta — o `pop_move` recusa reentrada sem trabalho no delta. Reexecutar a task inteira depois de uma devolução estreita é o desperdício que o delta existe para evitar.
- **`005_closing` (gate, só em yolo):** lance `pop-judge-dredd` em sessão limpa e perfil fixo — um juiz por rodada. Ele adquire card/specs/plano/diff/evidência pelos paths autorizados, escolhe `differential|full`, julga por leitura e devolve `.verify.md` ≤80 linhas com status/evidência; aprovando, escreve a memory. Reparo dirigido: o principal despacha `pop-executor` só com o delta e devolve o patch ao mesmo juiz para adendo ≤10 linhas. Aprovação é terminal. Orçamento de parede: S ~1h, M ~2h, L/critical ~3h; estourou sem aprovação → `blocked: true` com diagnóstico.
- **003 yolo (só `critical: true`):** `pop-judge-dredd` em sessão limpa assina ou devolve com motivos objetivos. Devoluções 1–2 retornam; a 3ª ativa `circuit_breaker`.

## Telemetria

Por estágio, atualize a tabela do card com contextos realmente lançados, contador de devoluções, testes/estratégia e resultado. Não persista reasoning, prompts ou tentativas descartadas.

## Cuidados (desta skill; os do fluxo estão nas Regras transversais)

- **Nunca pule estágios nem gates.** Retornos permitidos: 003→002, 004→002, `005_closing`→004 (bloqueante de execução) e `005_closing`→002 (defeito de plano) — o orquestrador decide o retorno; o subagente só reporta. **Exceção yolo:** task yolo não crítica transita 002 → 004 direto — não é pulo, é o fluxo.
- **Não infira waiver:** “aplique”, “execute”, “urgente” e “até finalizar” não decidem a triagem por você — ela é da regra 13. “Em yolo” ou item do roadmap/modifications implica kanban por default (avise e siga); fora do kanban, só as rotas fix direto e sem kanban (plan mode) do WORKFLOW, e nenhuma dispensa memory, specs ou DOX.
- **Claim ativo de outro agente cobre a pasta inteira da task** (card, `.plan.md`, `.verify.md`, `subtasks/`): leitura ok, escrita proibida — o `pop_move` também recusa a transição.
- Subagente reportou aborto, item `(user)` ou descoberta que muda o plano → pare/retorne conforme o WORKFLOW; **não improvise na janela principal**.
- Agente de uma frente do 004 encontrou dependência ausente, arquivo fora de `owns` ou contrato incompatível → trate como `BLOCKED`/retorno ao orquestrador de execução; **nunca autorize que complete a frente alheia**.
- Ao destravar uma task, limpe `blocked:` e `blocked_reason:`.
- Learning no encerramento **atualiza nota existente do mesmo tema** quando houver (não duplique); contradição com nota/decisão anterior vira linha `> Contradiz: [[alvo]] — <por quê>` visível.
