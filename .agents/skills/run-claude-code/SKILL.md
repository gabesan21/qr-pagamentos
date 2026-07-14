---
name: run-claude-code
description: Invoca o Claude Code como executor headless de tarefas de código (claude -p, yolo mode, sessões, subagents, saída JSON). Use quando for delegar trabalho de código ao Claude Code via CLI - contrato geral e escolha de ferramenta na skill delegate-coding.
---

# run-claude-code

Contrato, regras de yolo/auth e checklist: skill `delegate-coding` — leia antes da primeira delegação. Antes da primeira invocação na máquina, confirme as flags com `claude --help` — versões divergem (fonte é de meados de 2026; flags abaixo conferidas contra a instalação local em 2026-07-12, divergências anotadas em cada seção).

## Invocação headless

```bash
timeout 600 claude -p "task escopada" --dangerously-skip-permissions --output-format json
```

- `-p`/`--print`: roda sem TUI e imprime a resposta final. **Sozinho não auto-aprova tools** — a flag de yolo é obrigatória.
- Aceita pipe: `git diff | claude -p "revise este diff" ...`.
- `--bare` pula MCP, CLAUDE.md e hooks (~10x mais rápido) — use em tarefas pontuais que não precisam do contexto do repo.

## Saída e parsing

- `--output-format text|json|stream-json`. O JSON traz `result`, `session_id`, `total_cost_usd`, `usage{input_tokens, output_tokens, ...}`.
- `--json-schema '<schema>'` força a resposta a um shape JSON — use quando o orquestrador vai parsear campos.
- `stream-json` é NDJSON (um evento por linha) para acompanhar progresso.

```bash
claude -p "..." --dangerously-skip-permissions --output-format json | jq -r '.result, .session_id, .total_cost_usd'
```

## Sessões

- Criar nomeada: `claude -n "nome-da-task" -p "..."` (ou `--session-id` para fixar o id).
- Continuar a mais recente do diretório: `claude --continue -p "..."`.
- Retomar específica: `claude --resume <id|nome> -p "..."`.
- Alternativa sem mexer na original: `--fork-session`.
- Registre o `session_id` do JSON; follow-up da mesma task reutiliza a sessão, task nova cria outra.

## Yolo mode

`--dangerously-skip-permissions` — auto-aprova tudo. É o modo padrão desta família de skills (decisão de 2026-07-12): o controle vem do orquestrador (worktree isolada, prompt escopado, timeout), não de flags de permissão. O permissionamento fino (`--allowedTools`, `--permission-mode` etc.) existe e está mapeado na síntese, mas **não é usado** aqui.

## Agentes específicos

- Subagents built-in: `Explore` (read-only), `Plan` (read-only), `general-purpose` — invocados automaticamente; influencie via prompt ("use o subagente Explore para...").
- Custom: arquivo markdown em `.claude/agents/<nome>.md` (projeto) ou `~/.claude/agents/` com frontmatter `name`, `description`, `tools`, `model`, `skills`.
- System prompt: `--append-system-prompt "texto"` ou `--append-system-prompt-file <path>`; `--system-prompt-file` **substitui** o system prompt inteiro.
- `claude agents` lista os configurados.

## Modelo

`--model <model>` — confirmada na instalação local (a fonte não a documentava). Alternativas persistentes: `settings.json` (`"model": "..."`) ou por subagent (frontmatter `model`). **Qual modelo:** o tier do effort da task em `scripts/models.json` (entrada `claude-code`) — matriz papel × size na Orquestração do [[WORKFLOW|WORKFLOW]].

## MCP

Servers em `settings.json` sob `mcpServers`; `claude mcp list` confere. MCP adiciona latência de startup — `--bare` pula tudo quando não precisar.

## Contexto e diretórios

- Rode com o cwd já dentro da worktree da task (`--directory` da fonte **não existe** na instalação local); `--add-dir <path>` (repetível) dá acesso a diretórios extras.
- `-w/--worktree <nome>` cria worktree git isolada em `.claude/worktrees/<nome>` — alternativa quando o orquestrador ainda não isolou.
- `CLAUDE.md` do repo carrega automático, mas é advisory (não garantido).

## Auth

Pré-condição: já logado (ou `ANTHROPIC_API_KEY` no ambiente). **Não configure login nesta skill.** Se a saída mencionar credencial/API key/login/401: **aborte a task inteira do orquestrador** — sem retry, sem fallback; falha imediata **sem** sinal de auth é erro de invocação, não de login (regra 2 do `delegate-coding`).

## Pegadinhas

- `AskUserQuestion` trava/falha em headless — o prompt deve dar toda a informação e proibir perguntas.
- Some circuit breakers próprios: `--max-budget-usd <valor>`, além do `timeout` do SO (`--max-turns` da fonte **não existe** na instalação local).
- CLAUDE.md é advisory: instrução crítica vai no prompt, não só no arquivo.

## Receitas

```bash
# Auditoria com saída estruturada
timeout 600 claude -p "Audite src/auth/ e liste vulnerabilidades" \
  --dangerously-skip-permissions --output-format json --json-schema '{"type":"object","properties":{"issues":{"type":"array"}}}'

# Task de edição em worktree própria, com breaker de custo
timeout 900 claude -w task-fix-login -p "Corrija o bug X em src/login.ts; rode os testes; não toque em outros arquivos" \
  --dangerously-skip-permissions --output-format json --max-budget-usd 2

# Rápida, sem contexto do repo
timeout 300 claude --bare -p "Explique o diff em stdin" --dangerously-skip-permissions < diff.txt

# Sessão nomeada + follow-up
claude -n "refactor-auth" -p "..." --dangerously-skip-permissions --output-format json
claude --resume "refactor-auth" -p "agora rode os testes" --dangerously-skip-permissions --output-format json
```

## Ver também

- Contrato e escolha: `delegate-coding` · Mesma operação em outra ferramenta: `run-cursor-agent`, `run-opencode`, `run-codex`.
- Rastrear um fato até o bruto: [[researches/claude-code-headless/claude-code-headless|síntese]].
