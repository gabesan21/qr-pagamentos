---
name: run-cursor-agent
description: Invoca o Cursor CLI (cursor-agent) como executor headless de tarefas de código (-p --force, sessões por UUID, modelos, saída JSON). Use quando for delegar trabalho de código ao Cursor via CLI - contrato geral e escolha de ferramenta na skill delegate-coding.
---

# run-cursor-agent

Contrato, regras de yolo/auth e checklist: skill `delegate-coding` — leia antes da primeira delegação. Antes da primeira invocação na máquina, confirme as flags com `cursor-agent --help` — versões divergem (fonte é de meados de 2026).

## Invocação headless

```bash
timeout 600 cursor-agent -p --force --output-format json "task escopada"
```

- `-p`/`--print`: modo headless. O prompt é argumento posicional e vem **depois** das flags.
- Sem `--force` o agente é read-only; `--force` (alias `--yolo`) libera edições e comandos.
- Aceita pipe: `git diff | cursor-agent -p "revise este diff"`.
- Referencie arquivos direto no prompt (caminhos relativos/absolutos; imagens inclusive).

## Saída e parsing

- `--output-format text|json|stream-json`. O JSON traz `result`, `files_modified`, `summary`.
- `stream-json` é NDJSON de eventos (`system`, `assistant`, `tool_call`, `tool_result`, `result`, `error`); some `--stream-partial-output` para deltas de texto. Útil também para detectar conclusão quando o processo trava (ver Pegadinhas).

```bash
cursor-agent -p --force --output-format json "..." | jq -r '.result, .summary'
```

## Sessões

- `cursor-agent ls` lista; `cursor-agent resume` retoma a última; `--resume <uuid>` retoma específica; `--continue` continua a anterior.
- `create-chat` cria sessão vazia e retorna o ID.
- **`-n/--name` é só rótulo de exibição — retomar exige o UUID.** Capture o id na criação.
- `--cloud`/`-c` faz handoff para a nuvem (continua após fechar o terminal).
- Boa prática da fonte: uma task = uma sessão; prefira prompts discretos a um `--continue` longo.

## Yolo mode

`--force` — é o modo padrão desta família de skills (decisão de 2026-07-12); o controle vem do orquestrador (worktree isolada, prompt escopado, timeout). Com MCP, some `--trust --approve-mcps`. `--sandbox enabled|disabled` existe, mas `.cursor/sandbox.json` é ignorado em headless (bug na fonte) — não confie nele.

## Agentes específicos

- Modos de execução: `--mode agent|plan|ask` (`plan` = read-only, `ask` = Q&A sem edições) — sem uso normal aqui, dado o contrato yolo, mas úteis para reconhecimento.
- Regras de projeto: `.cursor/rules/` (crie com `cursor-agent generate-rule`); não há flag de system prompt dedicado — contexto vai no prompt ou nas rules.
- Subagentes **não herdam o modelo** e caem em `composer-1.5` — sem fix confiável; evite depender deles.

## Modelo

- `--model/-m <id>`; liste com `cursor-agent models` ou `--list-models`.
- **`--model default`/`auto` falha em alguns planos — sempre especifique** (ex.: `composer-2`, `claude-sonnet-4.6`, `gpt-5.4-low`, `gemini-3.1-pro`).
- **Qual modelo:** o tier do effort da task em `scripts/models.json` (entrada `cursor-agent`) — matriz papel × size na Orquestração do [[WORKFLOW|WORKFLOW]].

## MCP

- Config em `.cursor/mcp.json` (projeto) ou `~/.cursor/mcp.json` (global), bloco `mcpServers` com `command/args/env`; interpolação `${env:NAME}`, `${workspaceFolder}` etc.
- Em headless/CI o MCP só é reconhecido com `--trust --approve-mcps`.
- `cursor-agent mcp list`, `mcp list-tools <id>`, `mcp enable/disable <id>`.

## Contexto e diretórios

- `--workspace <dir>` define o diretório de trabalho.
- Worktree git isolada pronta na flag: `-w/--worktree "nome"` + `--worktree-base <branch>` (`--skip-worktree-setup` pula o `.cursor/worktrees.json`).
- Qualidade de contexto cai perto de 80-90% da capacidade — prompts escopados, não despejo de repositório.

## Auth

Pré-condição: já logado (ou `CURSOR_API_KEY` no ambiente). **Não configure login nesta skill.** Se a saída mencionar credencial/API key/login/401: **aborte a task inteira do orquestrador** — sem retry, sem fallback; falha imediata **sem** sinal de auth é erro de invocação, não de login (regra 2 do `delegate-coding`).

## Pegadinhas

- **Pode travar sem sair ao terminar** — `timeout <s>` é obrigatório em toda invocação; para monitorar, use `stream-json` e detecte o evento `result`.
- MCP "não configurado" em CI → faltou `--trust --approve-mcps`.
- Nome de sessão não retoma; só UUID.
- Subagentes degradam para `composer-1.5`.

## Receitas

```bash
# Edição direta com saída JSON
timeout 600 cursor-agent -p --force --output-format json --model composer-2 \
  "Adicione testes para src/utils.ts; rode-os; não toque em outros módulos"

# Stream para acompanhar progresso e detectar conclusão
timeout 900 cursor-agent -p --force --output-format stream-json --stream-partial-output \
  "Analise o projeto e gere relatório em REPORT.md"

# Em worktree isolada própria
timeout 900 cursor-agent -p --force -w "task-fix-login" --worktree-base main \
  --model claude-sonnet-4.6 "Corrija o bug X em src/login.ts"

# Com MCP (Playwright etc.)
timeout 900 cursor-agent -p --force --trust --approve-mcps "Rode os testes E2E com Playwright e resuma falhas"
```

## Ver também

- Contrato e escolha: `delegate-coding` · Mesma operação em outra ferramenta: `run-opencode`, `run-codex`.
- Rastrear um fato até o bruto: [[researches/cursor-cli-headless/cursor-cli-headless|síntese]].
