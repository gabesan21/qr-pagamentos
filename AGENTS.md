# QR Pagamentos - agent instructions

> Project managed by the **ProjectOfProjects (PoP)** workflow. `CLAUDE.md` is a symlink to this file; always edit this file.

- **Type:** included - see [[TYPES|TYPES]].
- **Project language:** English - specs, notes, research, code comments, and the entire kanban flow use English.
- **Supported application languages (i18n):** Brazilian Portuguese (`pt-BR`) and English (`en`).
- **Project brief:** [[categories/applications/qr-pagamentos/PROJECT|PROJECT]] - read when the task needs product purpose or harness decisions.
- **Roadmap:** [[categories/applications/qr-pagamentos/ROADMAP|ROADMAP]] - read when selecting or sequencing work.

## Repository

| Repo | URL | Clone path | PR branch |
|------|-----|------------|-----------|
| qr-pagamentos | https://github.com/gabesan21/qr-pagamentos.git | repository root | main |

Yolo phases integrate task PRs into `develop`. At the end of each phase, the human tests the deliverable and merges the final `develop` -> `main` PR.

## Workflow

Every change to the application passes through `kanban/001_initial_task` -> `kanban/006_done`:

1. **001** - create the task with `new-task` and explicit `depends_on` prerequisites.
2. **002** - write a plan with acceptance criteria and linked specs using `advance-task`, `write-spec`, and `sync-specs`.
3. **003** - obtain approval from the human or the yolo critic.
4. **004** - implement in `worktrees/<id>/` on branch `task/<id>` only after every dependency is complete.
5. **005** - verify every criterion in the worktree; human verification is required only when `critical: true`.
6. **006** - open the task PR and write `memory/<id>.md`; yolo task PRs target `develop`, while the final phase PR targets `main`.

One execution continues until the next real gate. The complete state machine is in [[WORKFLOW|WORKFLOW]].

## Context protocol

1. Start from the card and plan; read only what they link.
2. If context is missing, delegate a specific question instead of reading a directory broadly.
3. Stop searching when the affected behavior and paths are known.
4. Record unresolved uncertainty as `RECON NEEDED` or `blocked`; never guess.
5. Consult specs and memory before archaeology in Git history or code.

## Skills

- **PoP workflow:** `.agents/skills/` contains `new-task`, `advance-task`, `plan-roadmap`, `write-spec`, and `sync-specs`.
- **Project operations:** `skills/` will contain reusable build, test, run, migration, and deployment procedures as they become real.

## Processo DOX — contexto hierárquico de agentes no código

### O que é

Uma árvore de arquivos `AGENTS.md` dentro do código: o da raiz do código é o **trilho DOX** — regras do projeto inteiro + índice de alto nível; cada diretório relevante tem o seu, com regras locais e índice do próprio subtree. Cada `AGENTS.md` é um **contrato de trabalho vinculante para o seu subtree**: nenhuma edição às cegas, nenhuma documentação defasada.

### Regras

1. **Antes de editar:** leia o AGENTS.md raiz do código, identifique **todos** os caminhos afetados e **caminhe a árvore** até cada local de edição, lendo todo AGENTS.md aplicável no caminho. A caminhada pode ser delegada a um subagente que devolve **só as regras aplicáveis** aos caminhos da task — o executor recebe o extrato, não a árvore.
2. **Entendimento local:** qualquer ponto do código deve ser compreensível lendo apenas o AGENTS.md mais próximo + todos os pais acima dele. Se não for, falta contrato — crie/complete o local antes de editar.
3. **Conflitos:** o documento mais próximo manda nos detalhes locais; um filho **nunca enfraquece** diretiva do pai.
4. **Concisão operacional:** regras amplas nos níveis altos, detalhe concreto nos filhos. Só o que muda decisões de edição — nada de prosa. **Polaridade:** prefira constraints negativas ("nunca X neste subtree") e condicionais ("se Y, então Z"); evite diretriz positiva genérica ("siga o estilo") — guardrails rendem +13,8pp de acerto, guidance genérica −6,4pp. Teto: **~60 linhas** por contrato de subtree; estourou, o detalhe desce para um filho. Exceção: diretório de árvore grande (muitas subpastas) pode exceder para comportar o índice do subtree — a exceção cobre o índice, não prosa.
5. **Revisão obrigatória:** toda mudança relevante exige revisar os AGENTS.md afetados — atualize quando mudarem propósito, escopo, responsabilidade, estrutura, fluxos, entradas, saídas ou padrões de qualidade.
6. **Fechamento (closeout):** ao concluir o trabalho, re-cheque os caminhos alterados, atualize o documento dono e os pais afetados, refresque os índices, remova conteúdo obsoleto e rode as verificações pertinentes.
7. **Contratos relacionados:** seção opcional em cada contrato com links relativos markdown (`../services/payments/AGENTS.md`) para contratos de outros subtrees dos quais decisões locais dependem — cada link com **gatilho** de 1 linha (*quando segui-lo*). Máx. **~3 laterais (ideal 0-2)** e **<7 referências totais** por contrato (laterais + skills + índice de filhos); só dependência que muda decisão de edição (não todo import); link sem gatilho não vale. Precisou de mais? Sinal de acoplamento ou de roteamento que pertence ao índice do pai. A caminhada vira: vertical até o local de edição + laterais cujo gatilho casa com a task. O closeout (regra 6) atualiza também os laterais dos contratos tocados. **Elo contrato→spec:** quando o harness do PoP mora no mesmo repositório (`included` ou repo de `full-multi-repo`), o contrato pode linkar a **spec do tema** por caminho relativo markdown (`specs/<spec>.md`), com gatilho e contando no teto de referências; no type `default` a ponte contrato↔spec é o card/plano da task — o vault não resolve de dentro do repo (a direção spec→contrato existe sempre, no template de spec).
8. **Skills do subtree:** o contrato pode linkar skills do projeto (`skills/`) **específicas daquela pasta** — procedimento que muda como se edita o subtree (ex.: `migrations/` linka a skill de migration com gatilho "siga antes de criar/alterar qualquer migration"). Sempre link com gatilho, nunca cópia do conteúdo (cópia = drift). Skill de **workflow** (advance-task etc.) nunca entra em contrato — dona dela é a tabela "Skills por etapa" do card: o card responde "como trabalho esta task"; o contrato responde "o que vale ao editar esta pasta, seja qual for a task". Os links de skill contam no teto de referências da regra 7.
9. **Citações verificáveis:** contrato que cita arquivo ou trecho concreto do código pode fixar a citação com a anotação `<!-- pop-hash: <caminho-relativo> sha256=<hash do arquivo citado> -->` (comentário HTML, invisível; caminho relativo à pasta do contrato; hash via `sha256sum <arquivo>`). O `pop_validate` recomputa **fail-closed** — arquivo citado sumiu ou mudou → violação — onde o vault alcança o arquivo (repos embutidos de `full-multi-repo` e clones presentes em `project/`). Ao revisar a citação, atualize o hash: a mensagem de violação imprime o novo.

### Inicialização

Código sem árvore DOX → varredura recursiva e construção da árvore: AGENTS.md raiz com o índice geral e contratos-filhos **só onde há gatilho objetivo** — não crie AGENTS.md vazio "por via das dúvidas". Em projeto importado (`import-project`), a inicialização é task da Epoch 1 (Organização).

- **Gatilhos de contrato-filho:** ≥2 convenções não óbvias; erro prévio de edição às cegas; stack diferente do resto do repo; ownership diferente (outro time/dono); regras de segurança/permissão distintas; código legado.
- **Árvore nasce enxuta:** contratos iniciais de **20–30 linhas**, crescendo até o teto de ~60 conforme necessidade real; raiz passou de ~150 linhas → desça detalhe para um filho. Escala de referência: **5–15 contratos** bastam para a maioria dos repos.
- **Curadoria humana obrigatória:** a árvore inicial passa pelo gate 003 da task que a cria — contrato LLM-gerado sem curadoria **piora** o resultado (−3% de sucesso, +23% de custo).

### No fluxo do PoP

- **002 (wargame):** o recon inclui os AGENTS.md aplicáveis aos caminhos que a task toca; o plano lista os contratos que precisarão de atualização.
- **004:** edite só depois de caminhar a árvore; os AGENTS.md alterados entram na mesma worktree/PR da task.
- **005:** a verificação confere que os contratos afetados foram atualizados — critério de aceite implícito de toda task de aplicação.
- **Type `default` com repo externo que deve ficar limpo de arquivos de IA:** decida com o usuário na entrevista — commitar a árvore DOX no repo (padrão do PoP) ou manter apenas o contrato raiz no AGENTS.md do projeto, dentro do PoP.

## Essential rules

- Use English for project content and ISO dates (`YYYY-MM-DD`). Use wikilinks for internal references and keep notes near 150 lines.
- Never implement or modify application behavior outside a task in `004_processing` with an approved plan.
- Never use Nautt Finance hosted payment links; this application owns its products, links, and checkout pages.
- Never expose Nautt API keys, session secrets, or webhook secrets to clients or committed files.
- Never execute an item owned by `(user)`.
- Every completed task writes `memory/<id>.md` with dates and the final commit.
