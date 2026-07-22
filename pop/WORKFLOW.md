# WORKFLOW — fluxo de tasks no kanban

Regras gerais do vault: [[AGENTS|AGENTS]] · Caixa de entrada: [[INBOX|INBOX]]

Toda task é uma pasta com id `<epoch>.<phase>.<task>-<slug>` (roadmap) ou `M-<n>.<t>-<slug>` (modifications) que se move inteira entre os estágios do `kanban/` do projeto.

## Responsável por estágio

| Estágio | Responsável | Executa | O que acontece |
|---------|-------------|---------|----------------|
| 001_initial_task | agent (**+ user** libera) | orquestrador | Card mínimo nasce do roadmap ou de uma modification; só sai com liberação humana. |
| 002_planning | agent | planejador separado | Produz um brief: objetivo, estratégia, frentes, contratos, riscos e critérios. |
| 003_human_approval | **user** | orquestrador prepara | Humano aprova o brief; em yolo, o gate só existe para `critical` (crítico strong). |
| 004_processing | agent | orquestrador de execução | Escolhe executor único ou especialistas em sequência/ondas e integra os resultados. |
| 005_verifying | agent (**+ user** se `critical: true`) | revisor independente | Compara pedido original, specs, diff, testes e qualidade; aprova ou devolve. |
| 006_done | agent (**+ user** no merge) | orquestrador | Integração/PR, memory, specs e encerramento. |

Cada artefato declara seu responsável. Agentes nunca executam item `(user)` nem marcam `- [ ] Feito` no lugar do humano. O INBOX deriva do frontmatter; mantenha `stage`, `critical`, `blocked` e `awaiting_merge` fiéis.

## Orquestração

O agente principal controla claim, gates e transições. O raciocínio pesado, os prompts operacionais e a coordenação entre especialistas são **efêmeros**: o kanban guarda decisões, contratos e evidências, não transcrições do pensamento.

Contrato durável: [[specs/orquestracao-multiagente|orquestração multiagente]] — *siga ao mudar papéis, ownership, paralelismo ou artefatos*.

- **002 — planejador sempre separado:** recebe card + links pertinentes e devolve o `.plan.md`. Recon delegado só existe para pergunta específica acima do piso da regra 18; zero workers é normal.
- **004 — execução adaptativa:** frente coesa (uma skill/write set, sem DAG) vai direto a um executor; só topologia complexa recebe suborquestrador para especialistas sequenciais/ondas. Planejador nunca executa.
- **005 — um revisor independente:** contexto fresco, distinto de planejador e executores; verifica comportamento e qualidade. `critical` aumenta profundidade/modelo, não cria um segundo revisor.
- **001 e 006:** ficam com o orquestrador principal; em yolo externo, integração em `develop` e abertura do PR final também são mecânicas dele. O meta PoP local (`project: pop` na raiz) opera direto em `main`.

Modelos são escolhidos pelo papel e pelo risco, via `pop/scripts/models.json`:

| Papel | S | M | L / critical |
|-------|---|---|--------------|
| planejador 002 | medium | strong | strong |
| worker de recon | — | cheap | cheap |
| orquestrador de execução 004 | medium | medium | strong |
| especialista de execução | cheap/medium | medium | medium |
| revisor independente | medium | medium | strong |

`size` estima esforço, não autoriza cerimônia automática. Incerteza, risco, quantidade de skills e independência das frentes decidem a topologia. O Log registra apenas os contextos realmente lançados.

Em yolo, o revisor de 005 usa sempre tier **strong**, independentemente de `size`.

## Conteúdo da pasta da task

```
<id>/
├── <id>.md                 ← card
├── <id>.plan.md            ← brief de 002
├── <id>.approval.md        ← rodadas de 003/006
├── <id>.verify.md          ← revisão independente de 005
└── subtasks/               ← frentes persistidas somente quando ajudam ownership/gates
    └── <id>.g01-<slug>.md
```

Templates: [[_templates/TASK|TASK]] · [[_templates/TASK-PLAN|TASK-PLAN]] · [[_templates/TASK-APPROVAL|TASK-APPROVAL]] · [[_templates/TASK-VERIFY|TASK-VERIFY]] · [[_templates/SUBTASKS|SUBTASKS]] · [[_templates/MEMORY|MEMORY]].

## Estágios

### 001_initial_task — nascimento (agent, + user libera)

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
- Cada frente persistida descreve **entrega e fronteira**, nunca implementação: `owns`, `may_read`, `must_not_edit`, `depends_on`, entrada esperada, skill e critérios. Detalhe operacional pertence ao prompt efêmero do executor.
- Specs são criadas/alteradas apenas quando a task muda contrato durável; correção que restaura uma spec existente só a referencia.
- Red-team pode acontecer no raciocínio do planejador ou por worker quando risco justificar, mas sua transcrição não é artefato obrigatório.
- Gate 002→003: objetivo verificável; estratégia e frentes coerentes; dependências explícitas; contratos suficientes; riscos materiais cobertos; critérios executáveis; nenhuma decisão indispensável escondida no reasoning.

### 003_human_approval — gate humano (user)

- Crie uma rodada enxuta no `.approval.md`: resumo, riscos materiais, critérios principais, resposta e `- [ ] Feito`.
- Só prossiga com `- [x] Feito`: mudanças pedidas → 002; aprovado/vazio → 004.
- **Em yolo, este gate só existe para `critical: true`:** o crítico strong independente julga; até duas devoluções retornam automaticamente a 002 e a 3ª falha ativa `circuit_breaker`. Task yolo não crítica transita **002 → 004 direto, sem rodada** — o yolo confia no plano do agente e concentra o julgamento no 005.
- Só entre em 004 quando toda `depends_on` tiver `memory/<id>*.md` ou card na janela transitória de 006.
- WIP máximo de três tasks em 004; no yolo o orquestrador prioriza por dependências.

### 004_processing — execução orquestrada (agent)

- Se o card é `project: pop` no root vault, execute diretamente em `main`, sem branch/worktree/PR próprios; valide explicitamente os limites das frentes antes de integrar cada resultado.
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
- Rode o gate agregado após integrar. Item `(user)`, aborto ou ausência de rota autorizada → `blocked`; descoberta que muda objetivo/contrato → 002.
- Registre apenas resultados, desvios, commits e evidências relevantes. Tudo integrado e limpo → 005.

### 005_verifying — revisão independente (agent, + user se crítica)

- Abra contexto fresco e leia nesta ordem: objetivo, specs/contratos, testes e diff. O relato de execução é apoio, não fonte de verdade.
- **Em yolo, este é o único gate de qualidade** (salvo `critical`, que também passou por 003): comece respondendo se o **pedido original** — o “O quê / Por quê” do card — foi atendido, antes dos critérios do plano. Sem aprovação em 003, o brief é estratégia, não contrato: desvio do plano que atende ao pedido não é falha; aderência ao plano que não atende ao pedido é bloqueante.
- O crítico escolhe `differential` ou `full` e registra motivo/superfície/testes; `full` é obrigatório em `critical: true` ou após retorno anterior. Evidência inconclusiva é reexecutada.
- Revise comportamento, bordas, testes, complexidade, acoplamento, nomes, erros, segurança, documentação, specs e DOX tocados. Em código, siga `clean-code-review`.
- Cada achado traz trecho/evidência, impacto e severidade: **bloqueante**, **sugestão** ou **nit**. Só bloqueante devolve a 004/002.
- Há exatamente um revisor por rodada. Fora de yolo, `critical` usa revisão strong e aguarda humano; em yolo, crítico strong assume o gate. Até duas reprovações voltam automaticamente a 004; a 3ª ativa `circuit_breaker`.
- Grave resultado/evidência por ID de critério; não copie o plano inteiro. Tudo passou → 006.

### 006_done — integração, merge e encerramento (agent + user)

1. Resolva a rota Git: meta PoP local já está em `main`; fora de yolo, abra PR da task e aguarde o humano; em yolo externo, integre mecanicamente em `develop`. Cada passo do 006 é idempotente: valide o estado, pule efeito já concluído e aborte preservando card/roadmap diante de falha técnica.
2. Após merge/integração, escreva `memory/<id>.md` como ledger curto e canônico: ID, projeto, datas, commit, PR, resultado, specs, decisões/desvios e ponteiros. Memory inválida aborta o fechamento.
3. Sincronize apenas specs/DOX realmente afetados com o estado entregue; atualize status da task/phase/epoch/modification e índices se necessário.
4. Remova a linha da task no arquivo da epoch ou da modification com `python3 pop/scripts/pop_roadmap.py close <id>`; a operação exige card em 006 e memory válida. Preserve epoch, phase, modification e tasks abertas.
5. Extraia learning somente quando houver conhecimento reutilizável; nos escopos externos, remova todas as worktrees/branches efêmeras da task.
6. Se esta foi a última task de escopo yolo externo, abra automaticamente PR `develop` → `main`. Falha, conflito ou branch ausente → `blocked`; o merge é sempre humano. Sem Git, crie a rodada de aprovação final.
7. Apague `kanban/006_done/<id>/` somente após os passos anteriores; memory + Git preservam a prova durável.

## Regras transversais

- **Comando explícito do humano vence o fluxo:** execute ou faça uma única pergunta se houver ambiguidade/destrutividade; registre o desvio.
- **Uma execução vai até a parada legítima:** fora de yolo valem os gates humanos; em yolo só bloqueio técnico, item `(user)` ou `circuit_breaker` interrompem antes do merge final. Subagente de estágio é colhido.
- **Nenhum trabalho fora de task:** conteúdo do projeto só muda em 004, após 003, na worktree apropriada.
- **Paralelismo exige duas independências:** lógica (não depende do resultado alheio) e escrita (não disputa arquivos/contratos). Especialização pode ser sequencial.
- **Claim é por task:** `pop_claim.py` protege a pasta contra outro orquestrador; ownership de frentes protege workers dentro dela.
- **Telemetria mínima:** por estágio registre contextos lançados, nº de devoluções, testes/estratégia e resultado; nunca reasoning, prompts ou transcrição.
- Arquivos móveis usam wikilink só pelo nome. Retornos normais: 003→002, 004→002, 005→004.

## Yolo mode

`yolo: true` delega o julgamento ao revisor independente e mantém a mesma máquina de estados, com **gate único de qualidade no 005**.

- A marca vem do roadmap ou das modifications e pode ser herdada; só o humano a define. O escopo auto-materializa waves de até três tasks independentes: dependências satisfeitas e escrita/repos isolados; colisão serializa.
- **Gate único:** task yolo não crítica vai de 002 direto a 004, sem rodada de aprovação — o yolo confia no plano do agente. Em 005 nasce sessão limpa **strong**: o crítico verifica primeiro se o pedido original (objetivo do card) foi atendido, depois plano, specs, diff e qualidade; decide `differential|full` (`full` obrigatório em critical/retorno). Duas devoluções são permitidas; a 3ª falha ativa o circuit breaker.
- **`critical: true` é a exceção:** mantém o 003 com crítico strong antes da execução (duas devoluções a 002; 3ª = circuit breaker) e o 005 sempre `full`.
- Só bloqueio técnico, item `(user)` ou circuit breaker interrompem; devolução normal reentra automaticamente no fluxo.
- **Merge humano no fim do escopo marcado** — task avulsa, phase/epoch ou modification: fora do meta PoP local, o orquestrador, não o revisor, integra cada task em `develop`, sem PR por task. Quando a última task do escopo conclui 006, abre automaticamente o PR `develop` → `main`, registra resumo/testes/criticals e aguarda o merge humano. No meta PoP local tudo permanece em `main`, sem branch/worktree/PR da task ou do escopo.
