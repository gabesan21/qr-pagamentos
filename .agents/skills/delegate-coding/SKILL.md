---
name: delegate-coding
description: Delega trabalho de código a um CLI de coding agent headless (Claude Code, Cursor CLI, opencode ou Codex CLI) - contrato de invocação, escolha da ferramenta e regras de yolo/auth. Use quando for executar uma tarefa de código através de outra ferramenta agêntica em vez de fazê-la diretamente.
---

# delegate-coding

**Princípio: quem controla é o orquestrador, não o CLI.** O agente delegado roda com aprovação automática total; o escopo, o isolamento e os limites vêm de quem invoca. Este hub define o contrato comum — o operacional de cada ferramenta está na skill dela.

## Contrato de invocação (vale para as 4 ferramentas)

1. **Yolo mode sempre.** O CLI delegado roda com auto-aprovação total (flags na tabela abaixo). Nunca configure permissionamento fino no CLI — planejamento e permissões são responsabilidade do orquestrador.
2. **Login é pré-condição.** As ferramentas já estão autenticadas na máquina. **Erro de autenticação (menção a credencial/login/API key/401/403 na saída) aborta completamente a task do orquestrador** — sem retry, sem fallback para outra ferramenta, sem seguir com a implementação. Reporte ao humano e pare. Falha imediata **sem** sinal de auth (flag desconhecida, uso incorreto) é **erro de invocação**, não de login: confira o `--help`, corrija o comando e reinvoque.
3. **Isolamento pelo orquestrador:** rode o CLI dentro de uma worktree/diretório dedicado à task, nunca na árvore principal.
4. **Prompt escopado:** objetivo único, arquivos/áreas explícitos, critério de conclusão verificável e fronteira "não toque em X". Uma task = uma sessão.
5. **Timeout sempre:** envolva toda invocação em `timeout <segundos> <comando>` — CLIs headless podem travar sem sair.
6. **Saída parseável:** peça formato JSON e extraia resultado, custo e id de sessão; registre o id para follow-up.
7. **Verifique o resultado:** a saída do CLI é alegação, não prova — confira diff/testes antes de aceitar.

## Escolha da ferramenta

| Se a task precisa de… | Use | Skill |
|---|---|---|
| Ecossistema Anthropic: subagents `.claude/agents/`, CLAUDE.md, saída com JSON Schema, budget cap (`--max-budget-usd`) | Claude Code | `run-claude-code` |
| Modelos do Cursor (composer) ou multi-modelo com worktree pronta na flag | Cursor CLI | `run-cursor-agent` |
| Multi-provider (`provider/model`), agents custom leves em markdown, config inline por env | opencode | `run-opencode` |
| Ecossistema OpenAI: plano ChatGPT/modelos GPT-5.x-codex, AGENTS.md nativo, resposta validada por JSON Schema | Codex CLI | `run-codex` |

Desempate: use a ferramenta **instalada** (`command -v claude cursor-agent opencode codex`); entre instaladas, a que já tem contexto no repo (CLAUDE.md → claude; `.cursor/rules/` → cursor; `.opencode/` → opencode; AGENTS.md sem CLAUDE.md → codex).

## Flags de yolo por ferramenta

| Ferramenta | Yolo | Observação |
|---|---|---|
| Claude Code | `--dangerously-skip-permissions` | `-p` sozinho ainda pede permissão — a flag é obrigatória |
| Cursor CLI | `--force` | sem ela o agente é read-only; com MCP some `--trust --approve-mcps` |
| opencode | `--auto` | flag da instalação local; a fonte documenta `--dangerously-skip-permissions` — confirme no `--help`; `deny` explícito em `opencode.json` ainda vence |
| Codex CLI | `--dangerously-bypass-approvals-and-sandbox` | alias `--yolo`; bypassa aprovações **e** sandbox; sem cap de custo local — o breaker é o `timeout` |

## Checklist antes de invocar

- [ ] Ferramenta instalada e logada (falha de auth → **abort total**, regra 2)
- [ ] Flags conferidas com `--help` na primeira invocação na máquina (versões divergem)
- [ ] Worktree/diretório isolado da task como cwd
- [ ] Prompt com objetivo único, critério de conclusão e fronteira
- [ ] Flag de yolo da ferramenta + `timeout` do SO
- [ ] Formato JSON e captura do id de sessão
- [ ] Plano de verificação do resultado (diff, testes)

## Modelo por effort

Modelo se escolhe pelo tier da task, não por hábito: consulte **`scripts/models.json`** (`cheap | medium | strong`) com a matriz papel × size da Orquestração do [[WORKFLOW|WORKFLOW]]. Executor de plano wargameado raramente precisa do strong — o plano existe para ser executável às cegas. A flag de modelo de cada ferramenta está na skill dela (seção "Modelo"); disponibilidade se confere com o comando de listagem da ferramenta (lookup pontual).

## Skills desta família

- `run-claude-code` — siga para invocar o Claude Code headless.
- `run-cursor-agent` — siga para invocar o Cursor CLI headless.
- `run-opencode` — siga para invocar o opencode headless.
- `run-codex` — siga para invocar o Codex CLI headless.

Fontes: sínteses em [[researches/claude-code-headless/claude-code-headless|claude-code-headless]], [[researches/cursor-cli-headless/cursor-cli-headless|cursor-cli-headless]], [[researches/opencode-headless/opencode-headless|opencode-headless]] e [[researches/codex-cli-headless/codex-cli-headless|codex-cli-headless]] — siga para rastrear um fato até o bruto.
