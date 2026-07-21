# scripts — CLI do vault

Scripts em **Python 3 (≥3.9), só stdlib** — agent-agnostic e multiplataforma (`pathlib`). Substituem varreduras manuais de agente por 1 comando. Todos aceitam `--vault DIR` (default: pasta acima de `pop/scripts/`) e `--help`.

| Script | Faz |
|--------|-----|
| `pop_status.py` | Panorama: tasks por estágio/projeto, gates pendentes (liberação em 001, 003, 005 crítica, merge), bloqueadas, paradas >14 dias, claims ativos, alerta de WIP > 3. `--project <cat>/<proj>` filtra. |
| `pop_claim.py <task>` | Claim (lease) da task — um agente por task: grava `claimed_by:`/`claimed_at:` no card; claim ativo de outro agente → recusa (exit 1); lease de 2h expira claim órfão. `--release` libera, `--status` consulta, `--by` identifica o agente. |
| `pop_validate.py` | Valida limites, cards, specs, `pop-hash` e tasks concluídas residuais no roadmap (memory versionada como prova); avisos: worktrees órfãs e wikilinks quebrados. Exit 1 se houver violação. |
| `pop_roadmap.py close <task>` | Em 006, valida a memory canônica da task e remove exatamente sua linha do arquivo da epoch. `check` audita resíduos; `prune --tracked-only` aplica migração retroativa só com memory versionada. |
| `pop_move.py <task> <estágio>` | Move a task, atualiza card/Log e telemetria (`--context`, `--test-seconds`). Em yolo conta devoluções 003/005 e ativa circuit breaker na 3ª reprovação. |
| `pop_task.py <cat>/<proj> <id>` | Scaffolding: card em `001_initial_task` a partir de `_templates/TASK.md` + `subtasks/` vazia. `--title "..."` define o título. Repo embutido de `full-multi-repo`: `<cat>/<proj>/<repo>`. |
| `pop_worktree.py route\|add\|remove <task>` | Consome a rota Git da task; meta PoP recusa worktree e fica em `main`; yolo externo cria branch de task a partir de `develop` e expõe PR final para `main`. Nos demais casos cria/remove `worktrees/<id>` normalmente. |
| `pop_yolo.py wave\|verify-mode\|record\|telemetry\|reset` | Scheduler seguro de até 3 tasks, estratégia de verificação, telemetria mínima e reset humano de circuit breaker. |
| `pop_delivery.py integrate <task>` | Integra idempotentemente `task/<id>` em `develop`; `scope-pr` abre/reusa o PR final `develop` → `main`, sem merge. |
| `pop_check_scope.py --base REF --allow PATH [--deny PATH]` | Confere diff commitado/local/não rastreado; `--allow` define ownership e `--deny` cria exceções proibidas (repetíveis; `**` é recursivo). |
| `pop_install_included.py <dir>` | Instala/atualiza o pacote `included` declarado em `_templates/included-manifest.json`; `--audit-manifest` verifica o fechamento da fonte única. |

`poplib.py` é o módulo compartilhado: raiz do vault, descoberta de projetos (globs `categories/*/*/kanban/` e `categories/*/*/project/*/kanban/` — repos embutidos de `full-multi-repo`; rótulos `<cat>/<proj>` ou `<cat>/<proj>/<repo>`, sempre relativos a `categories/` e sem o segmento `project/`) e parser próprio de frontmatter (sem PyYAML).

Exemplo:

```
python3 pop/scripts/pop_task.py agents/meu-projeto 1.1.1-user-table-creation --title "Tabela de usuários"
python3 pop/scripts/pop_move.py 1.1.1-user-table-creation 002_planning --reason "plano iniciado"
python3 pop/scripts/pop_status.py
```
