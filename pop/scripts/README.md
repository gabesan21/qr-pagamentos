# scripts — CLI do vault

Scripts em **Python 3 (≥3.9), só stdlib** — agent-agnostic e multiplataforma (`pathlib`). Substituem varreduras manuais de agente por 1 comando. Todos aceitam `--vault DIR` (default: pasta acima de `scripts/`) e `--help`.

| Script | Faz |
|--------|-----|
| `pop_status.py` | Panorama: tasks por estágio/projeto, gates pendentes (liberação em 001, 003, 005 crítica, merge), bloqueadas, paradas >14 dias, claims ativos, alerta de WIP > 3. `--project <cat>/<proj>` filtra. |
| `pop_claim.py <task>` | Claim (lease) da task — um agente por task: grava `claimed_by:`/`claimed_at:` no card; claim ativo de outro agente → recusa (exit 1); lease de 2h expira claim órfão. `--release` libera, `--status` consulta, `--by` identifica o agente. |
| `pop_validate.py` | Valida limites: 144/600 chars nos índices, ≤150 linhas por nota (planos ≤200; `raw/` de pesquisa isento), frontmatter dos cards, `stage:` coerente, anotações `pop-hash` de citação de código (fail-closed — regra 9 do DOX, [[_templates/DOX]]); avisos: worktrees órfãs e wikilinks quebrados. Exit 1 se houver violação. |
| `pop_move.py <task> <estágio>` | Move a pasta da task, valida a transição (retornos: 003→002, 004→002, 005→004; `--force` p/ exceções), atualiza `stage:`/`updated:` e o `## Log` (`--reason`). Recusa task com claim ativo de outro agente (`--by`) e 001→002 sem `- [x] Pronto para planejar`. |
| `pop_task.py <cat>/<proj> <id>` | Scaffolding: card em `001_initial_task` a partir de `_templates/TASK.md` + `subtasks/` vazia. `--title "..."` define o título. Repo embutido de `full-multi-repo`: `<cat>/<proj>/<repo>`. |
| `pop_worktree.py add\|remove <task>` | Cria/remove `worktrees/<id>` + branch `task/<id>` via git. Repo alvo: `--repo` (caminho, ou **nome de clone** em `project/<nome>/` → worktree aninhada `worktrees/<id>/<nome>/`, p/ task cross de `multi-repo`/`full-multi-repo`); default: a pasta do projeto se for repo git (included/repo embutido), senão a raiz do vault. `--base`, `--delete-branch`. |
| `pop_install_included.py <dir>` | Instala/atualiza o pacote `included` declarado em `_templates/included-manifest.json`; `--audit-manifest` verifica o fechamento da fonte única. |

`poplib.py` é o módulo compartilhado: raiz do vault, descoberta de projetos (globs `categories/*/*/kanban/` e `categories/*/*/project/*/kanban/` — repos embutidos de `full-multi-repo`; rótulos `<cat>/<proj>` ou `<cat>/<proj>/<repo>`, sempre relativos a `categories/` e sem o segmento `project/`) e parser próprio de frontmatter (sem PyYAML).

Exemplo:

```
python3 scripts/pop_task.py agents/meu-projeto 1.1.1-user-table-creation --title "Tabela de usuários"
python3 scripts/pop_move.py 1.1.1-user-table-creation 002_planning --reason "plano iniciado"
python3 scripts/pop_status.py
```
