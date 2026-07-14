---
name: run-codex
description: Invoca o Codex CLI da OpenAI como executor headless de tarefas de código (codex exec, yolo mode, sessões, saída JSONL). Use quando for delegar trabalho de código ao Codex via CLI - contrato geral e escolha de ferramenta na skill delegate-coding.
---

# run-codex

Contrato, regras de yolo/auth e checklist: skill `delegate-coding` — leia antes da primeira delegação. Antes da primeira invocação na máquina, confirme as flags com `codex exec --help` — versões divergem (fonte com referências até 2026-04; vários modos são version-gated).

## Invocação headless

```bash
timeout 600 codex exec --dangerously-bypass-approvals-and-sandbox --json "task escopada"
```

- `codex exec` (alias `codex e`) roda sem TUI até concluir e sai com status code — nunca chame `codex` puro em automação.
- Prompt como argumento posicional; conteúdo em pipe vira **contexto adicional** ao argumento; `-` força ler o prompt do stdin.
- Progresso vai para **stderr**, a resposta final para **stdout** — redirecione cada um para seu destino.
- Exige repo git no diretório; fora de repo, some `--skip-git-repo-check`.

## Saída e parsing

- `--json` emite JSONL (um evento por linha): `thread.started` (traz `thread_id`), `turn.started`, `item.*`, `turn.completed` (traz `usage` com tokens), `error`.
- `--output-schema <arquivo.json>` valida a resposta final contra um JSON Schema — use quando o orquestrador vai parsear campos. **Pegadinha:** é silenciosamente ignorado quando há MCP tools ativos.
- `-o/--output-last-message <path>` grava a mensagem final em arquivo (além do stdout).

```bash
codex exec --json "..." | jq -r 'select(.type=="thread.started") | .thread_id'   # id da sessão
codex exec --json "..." | jq 'select(.type=="turn.completed") | .usage'          # tokens
```

## Sessões

- Toda execução persiste em `~/.codex/sessions/` (JSONL); `--ephemeral` roda sem persistir.
- Continuar a mais recente: `codex exec resume --last "..."`; retomar específica: `codex exec resume <SESSION_ID> "..."`.
- `--all` no resume enxerga sessões de qualquer diretório (por padrão só as do cwd).
- Capture o `thread_id` do evento `thread.started`; follow-up da mesma task usa `resume`, task nova cria outra sessão.

## Yolo mode

`--dangerously-bypass-approvals-and-sandbox` (alias `--yolo`) — bypassa aprovações **e** o sandbox. É o modo padrão desta família de skills (decisão de 2026-07-12): o controle vem do orquestrador (worktree isolada, prompt escopado, timeout). **Não use `--full-auto`** — é legado e emite aviso. O modelo fino de sandbox (`--sandbox read-only|workspace-write|danger-full-access`) e aprovação (`-a untrusted|on-request|never`) está mapeado na síntese, mas **não é usado** aqui.

## Agentes específicos

- Profiles: `~/.codex/profile-<NOME>.config.toml`, selecionados com `-p <nome>` — empacotam modelo/config por tipo de task.
- `AGENTS.md` do repo e `~/.codex/AGENTS.md` global são lidos automaticamente, inclusive no `exec`.
- Skills (experimental): `~/.codex/skills/**/SKILL.md` valem também em headless.
- Subagents atrás da feature flag `multi_agent` — não conte com eles por padrão.

## Modelo

- `-m/--model <nome>` sobrescreve o config: `gpt-5.5`, `gpt-5.4-mini`, `gpt-5.3-codex`, `gpt-5.1-codex-mini`…
- `--oss` usa provider open-source local; providers alternativos (Azure etc.) via `model_provider` + `env_key` no `config.toml`.
- GPT-5.5 pode não estar disponível com auth por API key em algumas configurações — teste antes de fixar o modelo.
- **Qual modelo:** o tier do effort da task em `scripts/models.json` (entrada `codex`) — matriz papel × size na Orquestração do [[WORKFLOW|WORKFLOW]].

## MCP

Servers em `[mcp_servers.NAME]` no `~/.codex/config.toml` (stdio: `command`/`args`; remoto: `url` + `bearer_token_env_var`) — o `exec` herda a config. O client prioriza STDIO; server remoto pode exigir proxy. `codex mcp-server` faz o caminho inverso: expõe o codex como server MCP.

## Contexto e diretórios

- `--cd/-C <path>` define o workspace root — aponte para a worktree da task; `--add-dir <path>` dá escrita em diretórios extras.
- `CODEX_HOME` muda a raiz de config/sessões (default `~/.codex`) — útil para isolar config por orquestrador.
- `--image/-i <path>` (repetível) anexa imagens ao prompt.
- Determinismo em CI: `--ignore-user-config` (não carrega o config global) e `--ignore-rules`.

## Auth

Pré-condição: já logado (`codex login` já feito pelo humano, ou `CODEX_API_KEY` no ambiente). **Não configure login nesta skill.** Checagem mecânica antes de invocar: `codex login status` (exit 0 = logado). Se a saída mencionar credencial/API key/login/401: **aborte a task inteira do orquestrador** — sem retry, sem fallback; falha imediata **sem** sinal de auth é erro de invocação, não de login (regra 2 do `delegate-coding`). Pegadinha: `OPENAI_API_KEY` no env faz o codex trocar **silenciosamente** de plano ChatGPT para API key (billing distinto) — não exporte essa variável sem intenção.

## Pegadinhas

- **Sem cap de custo por run** no CLI local — só o budget do dashboard OpenAI; plano ChatGPT drena a mesma cota da sessão interativa. Circuit breaker é o `timeout` do SO (+ modelo mini para reduzir tokens).
- `--output-schema` ignorado em silêncio com MCP tools ativos (acima).
- Versões antigas do `codex exec --json` não retornavam o id da sessão — parseie o `thread.started`.
- Resume "não encontra" a sessão criada em outro diretório — use `--all`.

## Receitas

```bash
# Auditoria read-only por natureza do prompt, saída JSONL
timeout 600 codex exec --dangerously-bypass-approvals-and-sandbox --json \
  "Audit src/auth/ for security issues; do not modify files" | jq 'select(.type=="item.completed")'

# Task de edição na worktree da task, modelo explícito
timeout 900 codex exec --dangerously-bypass-approvals-and-sandbox --json \
  --cd /path/worktree -m gpt-5.3-codex "Fix bug X in src/login.ts; run the tests; do not touch other files"

# Saída estruturada validada por schema (sem MCP ativo!)
timeout 600 codex exec --dangerously-bypass-approvals-and-sandbox \
  --output-schema schema.json -o result.json "Score open PRs by risk (1-10)"

# Follow-up na mesma task
timeout 600 codex exec resume --last --dangerously-bypass-approvals-and-sandbox --json "Now run the full test suite"
```

## Ver também

- Contrato e escolha: `delegate-coding` · Mesma operação em outra ferramenta: `run-claude-code`, `run-cursor-agent`, `run-opencode`.
- Rastrear um fato até o bruto: [[researches/codex-cli-headless/codex-cli-headless|síntese]].
