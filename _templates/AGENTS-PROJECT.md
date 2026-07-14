# <Nome do projeto> — instruções para agentes

> Blockquotes deste template são instruções de preenchimento — **apague-os ao preencher** (exceto este abaixo, que permanece no projeto).

> Projeto gerido pelo workflow do **ProjectOfProjects (PoP)**. `CLAUDE.md` é um symlink deste arquivo — edite sempre este.

- **Type:** default | included | multi-repo | full-multi-repo — ver [[TYPES|TYPES]].
- **Idioma do projeto:** <pt-BR> — specs, notes, pesquisas, comentários de código e todo o fluxo do kanban seguem este idioma.
- **Idiomas suportados (i18n):** <lista de idiomas que a aplicação deve suportar — tratados no roadmap e nas specs. Só para aplicações; remova se não se aplica.>
- **Ficha:** [[categories/<categoria>/<projeto>/PROJECT|PROJECT]] · **Roadmap:** [[categories/<categoria>/<projeto>/ROADMAP|ROADMAP]]

## Repositórios

| Repo | URL | Clone em | Branch de PR |
|------|-----|----------|--------------|
| <nome> | <url> | `project/<nome>/` (default/multi-repo/full-multi-repo) \| raiz do projeto (included) | <main> |

_Sem repositório externo: o trabalho vive no repositório do PoP e os PRs de task apontam para a branch principal dele._

> **`full-multi-repo`:** cada repo embutido tem o **próprio AGENTS.md** (type `included`) com uma seção **"Parte de"** linkando este projeto-mãe, o ROADMAP geral e o kanban cross-repo. Specs e memory vivem só nos repos — ver [[TYPES|TYPES]].

## Workflow

Toda alteração no projeto passa pelo kanban (`kanban/001_initial_task → … → 006_done`):

1. **001** — task nasce (skill `new-task`), com `depends_on:` listando as tasks pré-requisito.
2. **002** — plano com critérios de aceite e specs linkadas (skills `advance-task`, `write-spec`, `sync-specs`).
3. **003** — gate humano: o agente só avança com `- [x] Feito`.
4. **004** — execução **em worktree própria** (`worktrees/<id>/`, branch `task/<id>`); só entra quando toda `depends_on` concluiu.
5. **005** — verificação dos critérios na worktree (+ aprovação humana se `critical: true`).
6. **006** — PR para a branch de PR acima → **o humano merga** → agente escreve `memory/<id>.md`, remove a worktree e conclui.

**Uma execução = até o próximo gate humano:** o agente atua como orquestrador — subagente dedicado por etapa — e encadeia estágios até um gate: aprovação em 003, verificação se `critical`, item `(user)`, bloqueio ou rodada de merge em 006. Detalhe completo: [[WORKFLOW|WORKFLOW]] (na raiz do PoP; copiado para este repositório quando o type é `included`).

## Protocolo de contexto

1. Comece pelo card e pelo plano: leia **só** o que eles listam.
2. Faltou contexto → subagente com pergunta específica, nunca "ler a pasta para se ambientar".
3. Pare de buscar quando souber responder *o que muda e onde* — mais que isso é overthinking.
4. Dúvida que a busca não resolveu = **RECON NEEDED** no plano ou `blocked:` no card — nunca suposição.
5. Specs e memory existem para não reler o passado: consulte-as antes de qualquer arqueologia em git/código.

## Skills

- **Workflow do PoP:** `.agents/skills/` — `new-task`, `advance-task`, `plan-roadmap`, `write-spec`, `sync-specs`.
- **Do domínio do projeto:** `skills/` — listadas na ficha [[categories/<categoria>/<projeto>/PROJECT|PROJECT]].

## Processo DOX (só aplicações)

> Projetos de **aplicação** colam aqui a seção completa de [[_templates/DOX|_templates/DOX.md]] — árvore de AGENTS.md no código como contratos hierárquicos. Este AGENTS.md pode exceder as ~150 linhas para comportá-la. **Remova esta seção nos demais tipos de projeto.**

## Regras essenciais

- Conteúdo em pt-BR; wikilinks para referências internas; arquivos ≤~150 linhas; datas AAAA-MM-DD.
- **Nunca** alterar o projeto real fora de uma task em `004_processing` cujo plano foi aprovado em 003.
- **Nunca** marcar `- [ ] Feito` nem executar itens `(user)` — são exclusivos do humano.
- **Nunca** fazer merge de PR de task — o merge é do humano (ou comandado por ele na rodada de merge).
- Toda task concluída gera `memory/<id>.md` (≤2000 chars, commit final, datas) — a pasta `kanban/006_done/` pode ser limpa; a memória fica.
