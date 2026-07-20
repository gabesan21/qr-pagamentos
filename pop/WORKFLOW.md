# WORKFLOW — fluxo de tasks no kanban

Regras gerais do vault: [[AGENTS|AGENTS]] · Caixa de entrada: [[INBOX|INBOX]]

Toda task é uma pasta com id `<epoch>.<phase>.<task>-<slug>` que se move inteira entre os estágios do `kanban/` do projeto.

## Responsável por estágio

| Estágio | Responsável | Executa | O que acontece |
|---------|-------------|---------|----------------|
| 001_initial_task | agent (**+ user** libera) | orquestrador | Card mínimo nasce do roadmap; só sai com liberação humana. |
| 002_planning | agent | planejador separado | Produz um brief: objetivo, estratégia, frentes, contratos, riscos e critérios. |
| 003_human_approval | **user** | orquestrador prepara | Humano aprova o brief; em yolo, o revisor independente assume o gate. |
| 004_processing | agent | orquestrador de execução | Escolhe executor único ou especialistas em sequência/ondas e integra os resultados. |
| 005_verifying | agent (**+ user** se `critical: true`) | revisor independente | Compara objetivo, specs, diff, testes e qualidade; aprova ou devolve. |
| 006_done | agent (**+ user** no merge) | orquestrador | Integração/PR, memory, specs e encerramento. |

Cada artefato declara seu responsável. Agentes nunca executam item `(user)` nem marcam `- [ ] Feito` no lugar do humano. O INBOX deriva do frontmatter; mantenha `stage`, `critical`, `blocked` e `awaiting_merge` fiéis.

## Orquestração

O agente principal controla claim, gates e transições. O raciocínio pesado, os prompts operacionais e a coordenação entre especialistas são **efêmeros**: o kanban guarda decisões, contratos e evidências, não transcrições do pensamento.

Contrato durável: [[pop/specs/multi-agent-orchestration|multi-agent orchestration]] — *follow when changing roles, ownership, parallelism, or artifacts*.

- **002 — planejador sempre separado:** recebe card + links pertinentes e devolve o `.plan.md`. Recon delegado só existe para pergunta específica acima do piso da regra 18; zero workers é normal.
- **004 — execução adaptativa:** um subagente orquestrador de execução lê o brief e escolhe executor único, especialistas sequenciais ou ondas paralelas. Planejador nunca executa.
- **005 — um revisor independente:** contexto fresco, distinto de planejador e executores; verifica comportamento e qualidade. `critical` aumenta profundidade/modelo, não cria um segundo revisor.
- **001 e 006:** ficam com o orquestrador principal; em yolo, a integração em `develop` também é mecânica dele.

Modelos são escolhidos pelo papel e pelo risco, via `pop/scripts/models.json`:

| Papel | S | M | L / critical |
|-------|---|---|--------------|
| planejador 002 | medium | strong | strong |
| worker de recon | — | cheap | cheap |
| orquestrador de execução 004 | medium | medium | strong |
| especialista de execução | cheap/medium | medium | medium |
| revisor independente | medium | medium | strong |

`size` estima esforço, não autoriza cerimônia automática. Incerteza, risco, quantidade de skills e independência das frentes decidem a topologia. O Log registra apenas os contextos realmente lançados.

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

- Crie card mínimo: frontmatter, “O quê / Por quê”, phase, dependências e links com gatilho.
- O card é do humano até `- [x] Pronto para planejar`. Comando explícito permite ao agente marcar com Log; `yolo: true` herda a liberação do roadmap.
- Declare `depends_on:`. Vazio significa que a task pode concorrer com outras, respeitando WIP.
- Sugira `size: S | M | L`; task ampla demais para um brief coeso deve ser dividida.
- Linke `[[<id>]]` na epoch.

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
- Só prossiga com `- [x] Feito`: mudanças pedidas → 002; aprovado/vazio → 004. Em yolo, o revisor independente faz esse sanity check em sessão própria.
- Só entre em 004 quando toda `depends_on` tiver `memory/<id>*.md` ou card na janela transitória de 006.
- WIP máximo de três tasks em 004; no yolo o orquestrador prioriza por dependências.

### 004_processing — execução orquestrada (agent)

- Crie a worktree de integração da task, branch `task/<id>`, no repo dono do trabalho; projetos multi-repo criam uma por repo afetado.
- O orquestrador de execução escolhe:
  - **executor único:** uma frente coesa, uma skill predominante e um conjunto de escrita;
  - **especialistas sequenciais:** ownership distinto, mas dependência lógica entre frentes;
  - **ondas paralelas:** contratos estáveis, dependência satisfeita e conjuntos de escrita independentes.
- Todo contrato efêmero de frente declara: `owns`, `may_read`, `must_not_edit`, `depends_on`, `expected_input`, skill, critério de conclusão e “dependência ausente → reporte BLOCKED; nunca a implemente”.
- Agentes paralelos usam branches/worktrees próprias derivadas da branch da task. Eles nunca integram outros workers; o orquestrador centraliza merge/cherry-pick na worktree de integração.
- Antes de integrar, valide o diff contra `owns`/`must_not_edit` com `python3 pop/scripts/pop_check_scope.py --allow ... --deny ...`; alteração fora do escopo é devolvida, mesmo correta.
- Dependência interna não pronta não é lançada. Se um worker encontrar entrada ausente/incompatível, ele reporta; não cria a dependência por conta própria.
- Caminhe o DOX aplicável antes da primeira edição de cada frente. Reuse o extrato se base/hash não mudou; não faça duas caminhadas narrativas iguais.
- Rode o gate agregado após integrar. Item `(user)`, aborto ou ausência de rota autorizada → `blocked`; descoberta que muda objetivo/contrato → 002.
- Registre apenas resultados, desvios, commits e evidências relevantes. Tudo integrado e limpo → 005.

### 005_verifying — revisão independente (agent, + user se crítica)

- Abra contexto fresco e leia nesta ordem: objetivo, specs/contratos, testes e diff. O relato de execução é apoio, não fonte de verdade.
- Reexecute critérios `re-run`; audite `evidência`, promovendo a re-run quando inconclusiva; rode o gate agregado quando aplicável.
- Revise comportamento, bordas, testes, complexidade, acoplamento, nomes, erros, segurança, documentação, specs e DOX tocados. Em código, siga `clean-code-review`.
- Cada achado traz trecho/evidência, impacto e severidade: **bloqueante**, **sugestão** ou **nit**. Só bloqueante devolve a 004/002.
- Há exatamente um revisor por rodada. `critical: true` usa revisão strong/profunda e ainda aguarda aprovação humana; em yolo, o mesmo papel assume o gate, sem segundo crítico.
- Grave resultado/evidência por ID de critério; não copie o plano inteiro. Tudo passou → 006.

### 006_done — integração, merge e encerramento (agent + user)

1. Fora de yolo, abra PR `task/<id>` → branch de PR, registre `pr:`/`awaiting_merge:` e aguarde o humano. Sem repo, a rodada é aprovação final.
2. Em yolo, o orquestrador sincroniza e integra mecanicamente `task/<id>` em `develop`; conflito → `blocked`, nunca resolução autônoma. O revisor não opera Git.
3. Após merge/integração, escreva `memory/<id>.md` como ledger curto: resultado, commit, datas, specs, decisões/desvios e ponteiros.
4. Sincronize apenas specs/DOX realmente afetados com o estado entregue; atualize status da task/phase/epoch e índices se necessário.
5. Extraia learning somente quando houver conhecimento reutilizável; remova todas as worktrees/branches efêmeras da task.
6. Apague `kanban/006_done/<id>/` somente após os passos anteriores; a memory é a prova durável.

## Regras transversais

- **Comando explícito do humano vence o fluxo:** execute ou faça uma única pergunta se houver ambiguidade/destrutividade; registre o desvio.
- **Uma execução vai até o próximo gate humano:** 001, 003, 005 critical, item `(user)`, `blocked` ou merge em 006. Subagente de estágio é colhido antes de encerrar.
- **Nenhum trabalho fora de task:** conteúdo do projeto só muda em 004, após 003, na worktree apropriada.
- **Paralelismo exige duas independências:** lógica (não depende do resultado alheio) e escrita (não disputa arquivos/contratos). Especialização pode ser sequencial.
- **Claim é por task:** `pop_claim.py` protege a pasta contra outro orquestrador; ownership de frentes protege workers dentro dela.
- **Log de transições:** uma linha por movimento, com contextos realmente lançados; frontmatter sempre fiel.
- Arquivos móveis usam wikilink só pelo nome. Retornos normais: 003→002, 004→002, 005→004.

## Yolo mode

`yolo: true` delega julgamentos ao papel de revisor independente e mantém a mesma máquina de estados.

- A marca vem do roadmap e pode ser herdada; só o humano a define. O escopo auto-materializa tasks existentes, respeitando `depends_on` e WIP 3.
- Em 003, o revisor faz sanity check do brief: objetivo, contratos, dependências, riscos e critérios. Teto de duas devoluções; terceira → `blocked`.
- Em 005 nasce **nova sessão limpa do mesmo papel**. Ela revisa implementação e qualidade; `critical` torna a revisão strong e destaca a task no fechamento, sem criar outro agente.
- Continuam humanos: item `(user)`, lacuna de pesquisa/`blocked` e revisão final do escopo.
- O orquestrador, não o revisor, integra cada task em `develop`, sem PR por task. No fim do escopo cria open_question com resumo, como testar e criticals; PR `develop` → branch de PR só sob comando humano.
