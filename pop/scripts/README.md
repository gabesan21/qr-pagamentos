# scripts — CLI do escopo

Scripts em **Python 3 (≥3.9), só stdlib** — agent-agnostic e multiplataforma (`pathlib`). Substituem varreduras manuais de agente por 1 comando. Todos aceitam `--scope DIR` (default: a raiz do escopo corrente, a pasta acima de `pop/scripts/`) e `--help`.

**Ids de task:** duas origens — roadmap `1.2.3-slug` (`<epoch>.<phase>.<task>`) e modifications `M-1.2-slug` (task `2` da modification `M-1`; frontmatter com `origin: modifications` + `modification: M-1`, sem `epoch`/`phase`).

| Script | Faz |
|--------|-----|
| `pop_status.py` | Panorama: tasks por estágio/projeto, gates pendentes (liberação em 001, 003, 005 crítica, merge), bloqueadas, paradas >14 dias, claims ativos, alerta de WIP > 3. `--project <cat>/<proj>` filtra. |
| `pop_claim.py <task>` | Claim (lease) da task — um agente por task: grava `claimed_by:`/`claimed_at:` no card; claim ativo de outro agente → recusa (exit 1); lease de 2h expira claim órfão. `--release` libera, `--status` consulta, `--by` identifica o agente. |
| `pop_validate.py` | Valida limites, frescor do harness instalado nos projetos (carimbo `content_sha` vs. origem — defasado é violação), cards (frontmatter por origem: roadmap exige `epoch`/`phase`; modifications exige `modification: M-<n>`), specs, `pop-hash` e tasks concluídas residuais no roadmap/modifications (memory versionada como prova); avisos: worktrees órfãs e wikilinks quebrados. Exit 1 se houver violação. |
| `pop_roadmap.py close <task>` | No fechamento do `005_closing`, valida a memory canônica da task e remove exatamente sua linha do arquivo da epoch ou da modification (`modifications/m-*.md`); em modification de task única remove só o wikilink da linha do `MODIFICATIONS.md`. `check` audita resíduos; `prune --tracked-only` aplica migração retroativa só com memory versionada. |
| `pop_move.py <task> <estágio>` | Move a task, atualiza card/Log e telemetria (`--context`, `--test-seconds`). Yolo não crítica transita 002→004 direto (003 só em `critical: true`). Em yolo conta devoluções 003/005 e ativa circuit breaker na 3ª reprovação. Retorno saindo de `005_closing` grava a causa em `return_kind`: `--return-kind lacuna\|premissa` é obrigatório para →002; →004 assume `execucao`. Em yolo, valida os marcadores `pop-verdict`/`pop-delta` do `.verify.md` (aprovação é terminal; delta `pontual=true` → reparo dirigido; devolução exige delta), grava `return_base` e recusa reentrada 004→005 sem diff nos `paths` do delta. |
| `pop_task.py <cat>/<proj> <id>` | Scaffolding: card em `001_initial_task` a partir de `_templates/TASK.md` + `subtasks/` vazia, com o bloco de frontmatter da origem do id (roadmap ou `M-`). `--title "..."` define o título. Repo embutido: `<cat>/<proj>/<repo>`. |
| `pop_worktree.py route\|add\|remove <task>` | Consome a rota Git da task; escopo local recusa worktree e fica em `main`; yolo externo cria branch de task a partir de `develop` e expõe PR final para `main`. Nos demais casos cria/remove `worktrees/<id>` normalmente. |
| `pop_yolo.py wave\|verify-mode\|record\|telemetry\|reset` | Scheduler seguro de até 3 tasks, estratégia de verificação, telemetria mínima e reset humano de circuit breaker. `verify-mode` usa `full` só em `critical` ou retorno por `premissa`; nos demais retornos o diferencial cobre o delta. `telemetry` soma as devoluções por causa (`returns_lacuna\|premissa\|execucao`). |
| `pop_delivery.py integrate <task>` | Integra idempotentemente `task/<id>` em `develop`; `scope-pr` abre/reusa o PR final `develop` → `main`, sem merge. |
| `pop_check_scope.py --base REF --allow PATH [--deny PATH]` | Confere diff commitado/local/não rastreado; `--allow` define ownership e `--deny` cria exceções proibidas (repetíveis; `**` é recursivo). |
| `pop_install_included.py <dir>` | Instala/**atualiza** o harness declarado em `_templates/included-manifest.json`: espelha o conjunto gerido no alvo e grava nele o `content_sha` da origem mais o **inventário** do que escreveu. A poda da atualização seguinte só alcança esse inventário — pasta gerida não é pasta exclusiva, e arquivo do projeto em `pop/scripts/` fica. `--check-fresh <dir>` recomputa e falha fechado se o alvo ficou atrás (o `pop_validate` acusa como violação); `--sha` imprime a versão da origem — rodados de uma cópia instalada, ambos respondem apenas a versão local, porque comparar é papel de quem instalou; `--audit-boundary` reprova o pacote que cite algo acima da raiz do alvo; `--check` só confere se está instalado; `--audit-manifest` verifica o fechamento da fonte única. |
| `pop_recon.py <dir>` | Relatório determinístico de recon de qualquer diretório (zero LLM, só stdlib): árvore truncada, linguagens/LOC, manifests (`package.json`/`go.mod`/`pyproject.toml`/`Cargo.toml`), hotspots por churn git (degrada com nota se não houver `.git`), entry points/configs/CI e, em bases majoritariamente markdown, modo escrita (capítulos, wordcount, frontmatter). `--output [PATH]` grava em arquivo (default `RECON.md`) em vez de stdout. |

`poplib.py` é o módulo compartilhado: raiz do escopo corrente (a busca para no marcador `pop/.included-harness.json` — harness instalado é um mundo completo), descoberta dos escopos de projeto hospedados, rótulo de projeto e parser próprio de frontmatter (sem PyYAML).

Exemplo:

```
python3 pop/scripts/pop_task.py agents/meu-projeto 1.1.1-user-table-creation --title "Tabela de usuários"
python3 pop/scripts/pop_task.py agents/meu-projeto M-1.1-ajusta-contrato --title "Ajusta contrato"
python3 pop/scripts/pop_move.py 1.1.1-user-table-creation 002_planning --reason "plano iniciado"
python3 pop/scripts/pop_status.py
```
