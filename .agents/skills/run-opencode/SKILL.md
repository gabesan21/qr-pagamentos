---
name: run-opencode
description: Invoca o opencode como executor headless de tarefas de código (opencode run, yolo mode, agents custom, multi-provider, saída NDJSON). Use quando for delegar trabalho de código ao opencode via CLI - contrato geral e escolha de ferramenta na skill delegate-coding.
---

# run-opencode

Contrato, regras de yolo/auth e checklist: skill `delegate-coding` — leia antes da primeira delegação. Antes da primeira invocação na máquina, confirme as flags com `opencode run --help` — versões divergem (fonte é de meados de 2026; flags abaixo conferidas contra a instalação local em 2026-07-12, divergências anotadas em cada seção).

## Invocação headless

```bash
timeout 600 opencode run --auto --format json "task escopada"
```

- `opencode run [mensagem..]` processa, imprime e sai (sem argumentos abre a TUI — nunca chame `opencode` puro em automação).
- **stdin não é garantido** ("if supported" na fonte) — passe a mensagem como argumento.
- Invocações repetidas: suba `opencode serve` uma vez e use `--attach http://localhost:<porta>` para evitar cold start.

## Saída e parsing

- `--format default|json`. O json é **NDJSON** (um evento por linha): `step_start`, `text`, `tool_use`, `tool_result`, `step_finish` (traz tokens e custo), com `sessionID` nos eventos.

```bash
opencode run --format json "..." | jq -r 'select(.type=="text") | .part.text'      # texto final
opencode run --format json "..." | jq 'select(.type=="step_finish") | .part'       # tokens/custo
```

## Sessões

- Continuar a anterior: `-c/--continue`; retomar específica: `-s/--session ses_...`; ramificar preservando a original: `--fork`; nomear: `--title "..."`.
- Gerência: `opencode session list --format json -n 10`, `opencode export <ID>`, `opencode import <arquivo|URL>`.
- Capture o `sessionID` dos eventos NDJSON para follow-up.

## Yolo mode

Yolo é o modo padrão desta família de skills (decisão de 2026-07-12); o controle vem do orquestrador (worktree isolada, prompt escopado, timeout). **A flag varia por versão:** na instalação local a flag é `--auto` ("auto-approve permissions that are not explicitly denied"); a fonte documenta `--dangerously-skip-permissions` — use o que `opencode run --help` mostrar. Particularidade nas duas: **`deny` explícito em `opencode.json` ainda vence** — se algo for bloqueado inexplicavelmente, procure um `deny` na config do repo. O permissionamento fino (`permission` allow/ask/deny, `OPENCODE_PERMISSION`) está mapeado na síntese, mas **não é usado** aqui.

## Agentes específicos

- Primários built-in: `build` (dev completo, default) e `plan` (read-only). Subagents: `general`, `explore`, `scout`.
- Seleção: `--agent <nome>`; subagents também por `@mention` no prompt.
- Custom: `opencode agent create` (ou não-interativo com `--path --description --mode --tools --model`), ou markdown com frontmatter (`description`, `mode: primary|subagent|all`, `tools:`) em `.opencode/`.

## Modelo

- `--model/-m provider/model` — multi-provider é o ponto forte: `anthropic/claude-sonnet-4-6`, `openai/gpt-5`, `google/gemini-3-pro`...
- `--variant` controla esforço de raciocínio (Anthropic: `high`/`max`; OpenAI: `none`…`xhigh`; Google: `low`/`high`).
- `opencode models [provider]` lista; config persistente em `opencode.json` (`model`, `small_model`).
- **Qual modelo:** o tier do effort da task em `pop/scripts/models.json` (entrada `opencode`) — matriz papel × size na Orquestração do [[WORKFLOW|WORKFLOW]].

## MCP

A fonte só documenta **permissões** de MCP (padrões `"mymcp_*"` no bloco `permission`), não o registro de servers — confira a doc oficial se precisar de MCP.

## Contexto e diretórios

- `--dir <path>` define o working directory da execução.
- `--file/-f <path>` (repetível) anexa arquivos ao prompt.
- Config inline sem tocar em arquivos: `OPENCODE_CONFIG_CONTENT='{"model":"..."}'` (prioridade: env → `opencode.json` local → global) — útil para o orquestrador injetar config por invocação.

## Auth

Pré-condição: já logado (`opencode auth login` já feito pelo humano; credenciais em `~/.local/share/opencode/auth.json` ou `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` no ambiente). **Não configure login nesta skill.** Se a saída mencionar credencial/API key/provider auth/401: **aborte a task inteira do orquestrador** — sem retry, sem fallback; falha imediata **sem** sinal de auth é erro de invocação, não de login (regra 2 do `delegate-coding`).

## Pegadinhas

- Tool `question` pode travar sem TTY — o prompt deve dar toda a informação e proibir perguntas.
- `websearch` exige provider OpenCode ou `OPENCODE_ENABLE_EXA=true`; `lsp` exige `OPENCODE_EXPERIMENTAL_LSP_TOOL=true`.
- `read` limita 2000 linhas por chamada (offset/limit para arquivos grandes).
- Regras de bash na config: a **última** que casa vence — `deny` residual pode vir daí.

## Receitas

```bash
# Task de edição com modelo explícito
timeout 600 opencode run --auto --format json \
  --model anthropic/claude-sonnet-4-6 "Write tests for src/utils.ts; run them"

# Em diretório isolado, modelo barato, custo capturado
timeout 600 opencode run --auto --dir /path/worktree \
  --model anthropic/claude-haiku-4-5 --format json "Execute npm test and report results" \
  | jq 'select(.type=="step_finish") | .part'

# Reconhecimento com o agent plan (read-only por natureza)
timeout 300 opencode run --agent plan --format json "Audit the codebase for security issues"

# Follow-up em fork da sessão
opencode run --session ses_abc123 --fork --auto --format json "Try an alternative approach"
```

## Ver também

- Contrato e escolha: `delegate-coding` · Mesma operação em outra ferramenta: `run-cursor-agent`, `run-codex`.
- Rastrear um fato até o bruto: [[researches/opencode-headless/opencode-headless|síntese]].
