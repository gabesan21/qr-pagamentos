# WORKFLOW — fluxo de tasks no kanban

Regras gerais do vault: [[AGENTS|AGENTS]] · Caixa de entrada: [[INBOX|INBOX]]

Toda task é uma **pasta** com o id `<epoch>.<phase>.<task>-<slug>` (ex.: `1.1.1-user-table-creation`) que se move entre os estágios do `kanban/` do seu projeto. Mover de estágio = mover a pasta inteira.

## Responsável por estágio

| Estágio | Responsável | Executa | O que acontece |
|---------|-------------|---------|----------------|
| 001_initial_task | agent (**+ user** libera) | orquestrador | Task nasce do roadmap, card mínimo; só sai de 001 com `- [x] Pronto para planejar` do humano. |
| 002_planning | agent | subagente planejador | Wargame: recon paralelo, plano com forks/abortos, specs da mudança, red-team. |
| 003_human_approval | **user** | orquestrador prepara | Humano lê o `.approval.md` e marca `- [ ] Feito`. |
| 004_processing | agent | subagente executor | Executa subtasks `(agent)`; pausa nas `(user)`. |
| 005_verifying | agent (**+ user** se `critical: true`) | subagente verificador | Checa critérios de aceite com evidência, na worktree. |
| 006_done | agent (**+ user** no merge) | orquestrador | PR, merge humano, memory, encerramento. |

Cada arquivo de etapa declara seu responsável no topo. Agentes **nunca** executam item `(user)` nem marcam `- [ ] Feito` no lugar do humano. O INBOX é gerado por Dataview a partir do frontmatter (`stage`, `critical`, `blocked`) — **mantenha o frontmatter correto e o INBOX se mantém sozinho**.

## Orquestração

O agente principal é o **orquestrador**: lê o card, resolve os gates e faz as transições (frontmatter, Log, mover a pasta). Cada estágio de trabalho roda em **subagente dedicado**, equipado só com a skill daquela etapa (tabela "Skills por etapa" do card) + o contexto mínimo do estágio:

- **002 — planejador:** recebe card + specs linkadas → devolve o `.plan.md` (dispara a própria onda de recon do wargame, **3-5 por onda**; os workers de recon são folha: reportam "Lacunas / Não encontrado", nunca disparam subagentes).
- **004 — executor:** recebe plano + seção "Contexto mínimo do executor" → trabalha na worktree, devolve checkboxes marcados + divergências.
- **005 — verificador:** recebe a tabela de verificação do plano → devolve o `.verify.md` com evidências. Verificador ≠ executor **por design**: julga sem o viés de quem fez.
- **001 e 006** ficam com o próprio orquestrador (são baratos: criar card, PR, memory).
- **Via rápida (task trivial):** task de pouquíssimos passos — a mesma régua que dispensa o red-team em 002 — dispensa o subagente executor: o orquestrador executa o 004 ele mesmo e registra a via rápida no Log. O **005 continua em subagente verificador**: olhos frescos não se dispensam (verificador ≠ executor vale também aqui).

Assim a janela do principal cresce por **resultados** (plano pronto, verify preenchido), não por processo.

## Conteúdo da pasta da task

```
1.1.1-user-table-creation/
├── 1.1.1-user-table-creation.md            ← card: frontmatter + skills por etapa + log
├── 1.1.1-user-table-creation.plan.md       ← 002 · responsável: agent
├── 1.1.1-user-table-creation.approval.md   ← 003 · responsável: user
├── 1.1.1-user-table-creation.verify.md     ← 005 · responsável: agent (+ user se crítica)
└── subtasks/
    └── 1.1.1-user-table-creation.g01-<slug>.md  ← itens marcados (agent) ou (user)
```

Templates: [[_templates/TASK|TASK]] · [[_templates/TASK-PLAN|TASK-PLAN]] · [[_templates/TASK-APPROVAL|TASK-APPROVAL]] · [[_templates/TASK-VERIFY|TASK-VERIFY]] · [[_templates/SUBTASKS|SUBTASKS]] · [[_templates/MEMORY|MEMORY]] (escrito em `memory/`, fora da pasta da task)

## Estágios

### 001_initial_task — nascimento (agent, + user libera)

- Crie a pasta com o card ([[_templates/TASK|TASK]]): frontmatter, "O quê / Por quê", link para a phase.
- **Liberação (user):** o card nasce **não liberado** e, enquanto assim estiver, é território do humano — ele edita à vontade, o agente só lê. A task só vai a 002 com `- [x] Pronto para planejar` marcado (seção "Liberação" do card); o `pop_move` recusa 001→002 sem a marca. Só o humano marca — **exceção:** comando explícito do humano na conversa ("cria e já avança") permite ao agente marcar, registrando no Log (`liberada por comando do humano`). Automação nunca marca sozinha.
- **Declare as dependências:** `depends_on:` no frontmatter com os ids das tasks pré-requisito (e a seção "Dependências" do card). Vazio = pode rodar em paralelo com as demais — é isso que orienta a paralelização.
- **Tamanho:** mudança complexa demais para um plano só (muitas frentes, plano estouraria 200 linhas) → **proponha dividir em mais tasks** encadeadas por `depends_on`, antes de planejar.
- Adicione o link `[[<id-da-task>]]` na linha da task no arquivo da epoch.

### 002_planning — wargame (agent)

Você não executa a task aqui — **wargameia** a execução, para que um executor mais simples rode o plano em 004 sem perguntar nada. Template: [[_templates/TASK-PLAN|TASK-PLAN]].

- **Recon primeiro, read-only:** leia specs, material afetado e referências antes de planejar — **sempre com subagentes paralelos** (um por frente de investigação), especialmente em boards de muita pesquisa. O que o recon não resolver vira **RECON NEEDED** no plano, com o check exato que resolve.
- Escreva o `.plan.md` (≤200 linhas): rota, **forks com gatilho** ("se observar X, rota B"), **condições de aborto** e a tabela de **critérios de aceite com run de verificação e aparência do pass**. Movimentos detalhados vão para os grupos em `subtasks/`, cada movimento `(agent)` com observação esperada e falha provável → contra-jogada.
- **Monte as specs da mudança:** toda spec afetada linkada e, tema sem spec, rascunho criado via `write-spec` refletindo a mudança planejada (`sync-specs`). Plano sem as specs montadas não está pronto.
- **Red-team:** ataque o próprio plano antes de 003 e registre no plano o ataque que falhou e o patch nascido do que passou. Obrigatório — dispensável só em task trivial de pouquíssimos passos (registre a dispensa).
- Preencha no card a tabela **Skills por etapa** (004/005). Plano que não couber em 200 linhas → volte a 001 e proponha dividir a task.
- **Gate de prontidão 002→003** — só avance quando tudo valer: movimentos com observação esperada e falha→contra-jogada; forks com gatilho; RECON NEEDED com check; abortos definidos; verificação com runs e pass; specs montadas; red-team registrado (ou dispensado); executável às cegas.
- Se voltou de 003 com pedido de mudanças, ajuste respondendo ao feedback. Plano pronto → `003_human_approval`.

### 003_human_approval — gate humano (user)

- Crie/atualize o `.approval.md` com **nova rodada**: resumo do plano, "Resposta do humano" e `- [ ] Feito`.
- **O agente só age quando `- [x] Feito`** — caso contrário, pare e informe. Então: pediu mudanças → `002_planning`; aprovou (ou vazio) → `004_processing`. A aprovação vale também para as specs propostas no plano: `rascunho` → `aprovada`.
- **Gate de dependências:** só mova para 004 quando **toda** task em `depends_on` estiver concluída — card em `006_done` **ou** `memory/<id>*.md` existente (o 006 pode ter sido limpo). Dependência pendente → informe e aguarde (a task pode esperar aprovada em 003).
- **Limite de WIP:** antes de mover para 004, se o projeto já tem **3** tasks lá, avise o usuário e pergunte qual priorizar.

### 004_processing — execução (agent)

- **Crie a worktree da task ao entrar:** `git worktree add worktrees/<id-da-task> -b task/<id-da-task>`, no repositório onde o trabalho mora (declarado no AGENTS.md do projeto — ver [[TYPES|TYPES]]; projeto sem repo próprio usa o repositório do PoP; `multi-repo`: uma worktree por repo afetado, em `worktrees/<id>/<repo>/`; `full-multi-repo`: task de repo → worktree no próprio repo; task cross no kanban central → como `multi-repo`, uma worktree por repo afetado). Registre `worktree:` no frontmatter. **Todo o trabalho da task acontece dentro dela** — é o que permite tasks em paralelo sem conflito. Projetos sem repositório git podem dispensar (declarado no harness da ficha).
- Execute os grupos respeitando `Depende de:`/`(após ...)` — grupos e itens sem pré-requisito pendente podem ser paralelizados; os demais, em ordem. A cada movimento, confira a **observação esperada**; falhou → aplique a contra-jogada do plano; gatilho de fork observado → siga a rota pré-autorizada. Marque os checkboxes. Use as skills listadas no card para esta etapa.
- **Aplicações seguem o processo DOX** do AGENTS.md do projeto: caminhe a árvore de AGENTS.md do código até cada local de edição antes de editar e atualize os contratos afetados no fechamento (entram na mesma worktree/PR).
- Item `(user)`: pare, sinalize no card (`blocked: true` + `blocked_reason:` se o item travar o resto) e informe.
- **Condição de aborto atingida** (ou situação sem fork nem contra-jogada prevista) → pare, `blocked: true` + motivo — não improvise.
- Realidade divergiu de uma spec → registre na seção "Aberto" da spec, nunca a reescreva silenciosamente (`sync-specs`).
- Descoberta que muda o plano de forma relevante → volte para `002_planning` (novo ciclo de aprovação).
- Tudo concluído → `005_verifying`.

### 005_verifying — verificação (agent, + user se crítica)

- Crie o `.verify.md` a partir da tabela de verificação do plano e execute **cada run** definido lá, comparando com o "Pass é" — **na worktree da task**, não na branch principal.
- Algum critério falhou → volte para `004_processing` com notas.
- **`critical: true`:** preencha a seção de aprovação humana e aguarde o `- [x] Feito` antes de avançar.
- Tudo passou (e aprovado, se crítica) → `006_done`.

### 006_done — PR, merge humano e encerramento (agent + user)

1. **Abra o PR:** branch `task/<id>` → branch de PR declarada no AGENTS.md do projeto. Registre `pr:` e `awaiting_merge: true` no frontmatter, crie a rodada **Merge** no `.approval.md` ([[_templates/TASK-APPROVAL|TASK-APPROVAL]]) e **pare** — a task aparece no INBOX. Sem repositório git: a rodada de merge é a aprovação final da entrega, sem PR.
2. **O humano merga:** ele mesmo no repositório, ou comandando na rodada de merge (aí o agente executa o comando dele).
3. **Após o merge, finalize:** escreva `memory/<id>.md` ([[_templates/MEMORY|MEMORY]]) — resumo ≤2000 chars, commit final do merge, datas de início e fim; remova a worktree (`git worktree remove worktrees/<id>`); limpe `awaiting_merge:` e `worktree:`. É o registro durável: o `006_done` pode ser limpo depois, a memória fica. **Task cross-repo de projeto `full-multi-repo`:** a memória vai para o `memory/` de **cada repo afetado** (não há memory central) e o card central linka cada uma.
4. **Sincronize as specs na mesma finalização da memory:** as specs da mudança montadas em 002 são incorporadas às specs do projeto (`sync-specs`), refletindo o que foi **realmente** feito — resolva itens "Aberto", status → `implementada`. Em `full-multi-repo`, sempre nas `specs/` dos repos afetados (não há specs central). **Não é opcional** — é parte da conclusão.
5. **Status derivado:** marque a task como concluída na epoch; se todas as tasks da phase concluíram, a phase conclui; se todas as phases, a epoch. Atualize os `INDEX.md` se o status do projeto mudou.
6. **Extraia aprendizados:** o reutilizável vira skill (`skills/`) ou nota (`notes/learnings/`), linkada no card.

## Regras transversais

- **Uma execução = até o próximo gate humano:** o agente encadeia os estágios de responsável `agent` numa mesma chamada e só para onde uma decisão humana é aguardada, informando o estado. **Gates humanos:** liberação em `001` (`- [x] Pronto para planejar`); aprovação em `003`; verificação humana quando `critical: true` em `005`; item `(user)` de subtask; `blocked: true`; rodada de merge em `006`. Nenhum gate é pulado — eliminam-se só as paradas que não esperavam ninguém. **Task `yolo: true`:** os gates de julgamento (001, 003, merge de task) são delegados ao agente crítico — ver a seção Yolo mode. Chamadas típicas:
  - **A:** cria o card em 001 e **para** (aguarda a liberação do humano) — salvo comando explícito de seguir direto.
  - **B (pós-liberação):** 002 → prepara o `.approval.md` em 003 e **para** (aguarda aprovação).
  - **C (pós-aprovação):** 004 → 005 → abre o PR em 006 e **para** (aguarda merge) — pausando antes se item `(user)`, `critical: true` em 005, condição de aborto, bloqueio ou retorno a 002.
  - **D (pós-merge):** memory, sync-specs, status derivado, encerramento.
- **Nenhum trabalho fora de task:** alterações no projeto real (`project/` ou repositório externo) só acontecem dentro de `004_processing`, com plano aprovado em 003, **na worktree da task**. Sem task, não há alteração.
- **Dependências pilotam o paralelismo:** tasks (e grupos/itens de subtasks) sem pré-requisito pendente podem rodar em paralelo, cada task na sua worktree — respeitando o WIP de 3.
- **Merge é do humano:** o agente nunca merga PR de task por conta própria — só quando comandado na rodada de merge. Exceção: task yolo, cujo PR mira `develop` e é mergeado pelo crítico; o PR final `develop` → branch de PR continua sendo do humano (seção Yolo mode).
- **Log de transições:** toda mudança de estágio adiciona linha no Log do card: `AAAA-MM-DD — 002→003 — motivo curto`.
- **Frontmatter sempre atualizado:** ao mover, atualize `stage:` e `updated:`; ao travar/destravar, `blocked:` e `blocked_reason:`.
- **Claim de task — um agente por task:** ao assumir uma task o orquestrador registra `claimed_by:`/`claimed_at:` no card (`scripts/pop_claim.py <id>`) e **libera ao parar** num gate (`--release`). Claim ativo de outro agente = task ocupada — não toque em **nenhum arquivo da pasta** (card, `.plan.md`, `.verify.md`, `subtasks/`): leitura ok, escrita proibida. O `pop_move` também recusa transição de task com claim ativo de outro agente (`--by` identifica quem pede). Lease de ~2h: claim mais velho que isso é órfão e pode ser tomado (o script decide).
- **Arquivos de task são linkados só pelo nome** (`[[1.1.1-user-table-creation]]`) — nunca pelo caminho, pois a pasta se move.
- **Nunca pule estágios.** Retornos permitidos: 003→002, 004→002, 005→004.

## Yolo mode

Delegação dos **gates de julgamento** ao **agente crítico** ([[.agents/skills/yolo-critic/SKILL|yolo-critic]]) quando a task tem `yolo: true` — mesma máquina de estados, mesmos artefatos, só muda o assinante. *(Não confundir com o "yolo" de CLI headless da `delegate-coding`.)*

- **Marcação (humano, no roadmap):** bullet `**Yolo:** sim` na epoch ou na phase, ou marcador ` · yolo: sim` na linha da task ([[_templates/EPOCH|template]]). **Herança com opt-out:** epoch → phases → tasks; task pode marcar ` · yolo: não`. Só o humano marca (ou o agente sob comando explícito dele).
- **Estampagem (card):** ao materializar a task (`new-task`), a herança é resolvida e o card recebe `yolo: true` no frontmatter + Log com a origem (`yolo herdado da phase X.Y`). O frontmatter é a fonte em runtime (INBOX, `pop_move`). Remoção da marca mid-flight vale a partir do **próximo** gate.
- **Escopo se auto-materializa:** o orquestrador cria os cards das tasks listadas no roadmap **sem entrevista**, em ordem de `depends_on`, respeitando o WIP de 3 — e para quando o escopo (phase/epoch) termina. Escopo fechado: dividir task pode (regra do 001); inventar phase/task nova, não.
- **Gates delegados ao crítico:** liberação em 001 (a marca no roadmap é a liberação antecipada — o `pop_move` aceita 001→002 com `yolo: true`); aprovação em 003 (leitura adversarial; **teto de 2 devoluções**, a 3ª vira `blocked`; critério de aceite sem run executável e pass observável é devolvido); merge do PR da task em 006.
- **Gates que continuam humanos:** `critical: true` em 005 (nunca sobrescrito — ciente de que o humano verifica ali um plano que não aprovou em 003); item `(user)` de capacidade (→ `blocked`); `blocked: true`; PR final do escopo.
- **Integração via `develop`:** criada da branch de PR do projeto (multi-repo: uma por repo afetado); PRs de task yolo miram `develop` e o crítico merga ali, sincronizando `develop` com a branch de PR antes de cada merge. Fim do escopo → **um** PR `develop` → branch de PR + open_question com o link (aparece no INBOX); merge **só do humano**, após testar o entregável. Sem git: rodada de merge = aprovação final da entrega.
