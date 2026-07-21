---
name: run-droid
description: Invoca o droid CLI da Factory como executor headless de tarefas de código (droid exec, níveis de autonomia, sessões, saída JSON). Use quando for delegar trabalho de código ao droid via CLI - contrato geral e escolha de ferramenta na skill delegate-coding.
---

# run-droid

Contrato, regras de yolo/auth e checklist: skill `delegate-coding` — leia antes da primeira delegação. Antes da primeira invocação na máquina, confirme as flags com `droid exec --help` — versões divergem (fonte: docs oficiais da Factory lidas em 2026-07-16).

## Invocação headless

```bash
timeout 600 droid exec --skip-permissions-unsafe -o json "task escopada"
```

- `droid exec` roda sem TUI até concluir e sai com status code — nunca chame `droid` puro em automação (abre a TUI).
- Prompt: argumento posicional, arquivo (`-f/--file prompt.md`) ou pipe (`echo "task" | droid exec`).
- **Fail-fast de autonomia:** se o nível de autonomia não cobre uma ação pedida, o droid para imediatamente com erro claro, exit ≠ 0 e **nenhuma mudança parcial**.
- Exit code: `0` sucesso; ≠ 0 falha (violação de permissão, erro de tool, objetivo não cumprido) — trate como falha de pipeline.

## Saída e parsing

- `-o/--output-format text|json|stream-jsonrpc`. O `json` é um **objeto único** no fim (não NDJSON): `{type:"result", subtype, is_error, duration_ms, num_turns, result, session_id}`.
- `stream-jsonrpc` é protocolo JSON-RPC bidirecional por linha (requests no stdin) para integrações custom — para orquestração normal, use `json`.

```bash
droid exec --skip-permissions-unsafe -o json "..." | jq -r '.result'       # resposta final
droid exec --skip-permissions-unsafe -o json "..." | jq -r '.session_id'   # id da sessão
```

## Sessões

- Continuar: `droid exec -s/--session-id <id> "..."` (exige novo prompt); ramificar com novo id: `--fork <id>`.
- No interativo: `droid --resume [id]` (default: última modificada); busca em sessões: `droid search "..."`.
- `--tag <spec>` (repetível) e `--log-group-id <id>` etiquetam e agrupam runs — úteis para observabilidade em CI.
- Capture o `session_id` do JSON de resultado; follow-up da mesma task usa `-s`, task nova cria outra sessão.

## Yolo mode

`--skip-permissions-unsafe` — bypass completo de confirmações, o modo padrão desta família de skills (decisão de 2026-07-12): o controle vem do orquestrador (worktree isolada, prompt escopado, timeout). **Não combina com `--auto`** (mutuamente exclusivos). A escadinha nativa de autonomia (`sem flag` = read-only; `--auto low` cria/edita arquivos; `medium` instala deps, rede, commit; `high` push e execução arbitrária) está mapeada, mas **não é usada** aqui — exceto o default read-only, útil para reconhecimento.

## Agentes específicos

- `--use-spec` inicia em modo especificação (planeja antes de executar); `--spec-model`/`--spec-reasoning-effort` configuram a fase de spec.
- Mission mode (`--mission` + `--worker-model`/`--validator-model` e efforts) orquestra multi-agente **dentro** do droid — sem uso normal aqui: o orquestrador é o PoP.
- `--append-system-prompt <texto>` / `--append-system-prompt-file <path>` anexam guidance ao system prompt.
- `AGENTS.md` do repo é lido nativamente; custom droids, slash commands e skills via config (`~/.factory/`).

## Modelo

- `-m/--model <id>`: `claude-sonnet-4-6`, `claude-opus-4-8`, `gpt-5.5`, `gpt-5.3-codex`, `gemini-3.1-pro-preview`, open models (`glm-5.2`, `kimi-k2.7-code`…) — cada um com multiplicador de billing próprio (variantes `-fast` custam mais).
- `-r/--reasoning-effort <nível>` sobrescreve o default do modelo (default varia por modelo).
- BYOK: `customModels` em `~/.factory/settings.json`, referenciados como `custom:<displayName>-0`.
- **Qual modelo:** o tier do effort da task em `pop/scripts/models.json` (entrada `droid`) — matriz papel × size na Orquestração do [[WORKFLOW|WORKFLOW]].

## MCP

- `droid mcp add <name> <url> --type http|sse` (remoto) ou `droid mcp add <name> "<comando>"` (stdio local); `droid mcp remove <name>` remove — o `exec` herda a config.

## Contexto e diretórios

- `--cwd <path>` define o diretório de execução — aponte para a worktree da task.
- Worktree git nativa na flag: `-w/--worktree [nome]` (branch separada) + `--worktree-dir <path>`.
- `--enabled-tools`/`--disabled-tools` restringem tools por invocação; `--list-tools` lista as disponíveis para o modelo.

## Auth

Pré-condição: já logado (login do droid já feito pelo humano, ou `FACTORY_API_KEY` no ambiente — chave gerada em app.factory.ai/settings/api-keys). **Não configure login nesta skill.** Se a saída mencionar credencial/API key/login/401: **aborte a task inteira do orquestrador** — sem retry, sem fallback; falha imediata **sem** sinal de auth é erro de invocação, não de login (regra 2 do `delegate-coding`).

## Pegadinhas

- `--skip-permissions-unsafe` e `--auto` são mutuamente exclusivos — passar os dois é erro.
- Exit ≠ 0 com erro de permissão não é bug: é o fail-fast de autonomia (nível insuficiente para o que o prompt pediu) — no yolo da família não ocorre.
- `stream-jsonrpc` espera requests no stdin — não é stream passivo de eventos; para parsing simples fique no `-o json`.
- Multiplicadores de billing variam muito por modelo — open models e `claude-haiku-4-5-20251001` reduzem custo em tasks leves.

## Receitas

```bash
# Task de edição na worktree da task, modelo explícito, saída JSON
timeout 900 droid exec --skip-permissions-unsafe -o json --cwd /path/worktree \
  -m claude-sonnet-4-6 "Fix bug X in src/login.ts; run the tests; do not touch other files" | jq -r '.result'

# Reconhecimento read-only por natureza (default sem flag de autonomia)
timeout 600 droid exec -o json "Audit src/auth/ for security issues; do not modify files"

# Prompt de arquivo + etiquetas para CI
timeout 900 droid exec --skip-permissions-unsafe -f prompt.md -o json --tag ci --log-group-id build-123

# Follow-up na mesma sessão
timeout 600 droid exec --skip-permissions-unsafe -s <session_id> -o json "Now run the full test suite"
```

## Ver também

- Contrato e escolha: `delegate-coding` · Mesma operação em outra ferramenta: `run-cursor-agent`, `run-opencode`, `run-codex`.
- Fonte: docs oficiais da Factory (https://docs.factory.ai/cli/droid-exec/overview) — skill escrita direto da doc em 2026-07-16, sem síntese em `researches/`.
