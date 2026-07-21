---
name: delegate-coding
description: Delega trabalho de código a um CLI de coding agent headless (Cursor CLI, opencode, Codex CLI ou droid) - contrato de invocação, escolha da ferramenta e regras de yolo/auth. Use quando for executar uma tarefa de código através de outra ferramenta agêntica em vez de fazê-la diretamente.
---

# delegate-coding

**Princípio: quem controla é o orquestrador, não o CLI.** O agente delegado roda com aprovação automática total; o escopo, o isolamento e os limites vêm de quem invoca. Este hub define o contrato comum — o operacional de cada ferramenta está na skill dela.

> **Claude Code está fora desta família de propósito** (decisão de 2026-07-16): o uso headless do CLI implica custos adicionais, contra o objetivo das skills — não adicione `run-claude-code` de volta sem decisão do humano.

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
| Modelos do Cursor (composer) ou multi-modelo com worktree pronta na flag | Cursor CLI | `run-cursor-agent` |
| Multi-provider (`provider/model`), agents custom leves em markdown, config inline por env | opencode | `run-opencode` |
| Ecossistema OpenAI: plano ChatGPT/modelos GPT-5.x-codex, AGENTS.md nativo, resposta validada por JSON Schema | Codex CLI | `run-codex` |
| Catálogo multi-provider da Factory (incl. open models baratos), fail-fast de autonomia, worktree nativa na flag | droid CLI | `run-droid` |

Desempate: use a ferramenta **instalada** (`command -v cursor-agent opencode codex droid`); entre instaladas, a que já tem contexto no repo (`.cursor/rules/` → cursor; `.opencode/` → opencode; `.factory/` → droid; AGENTS.md → codex ou droid).

## Flags de yolo por ferramenta

| Ferramenta | Yolo | Observação |
|---|---|---|
| Cursor CLI | `--force` | sem ela o agente é read-only; com MCP some `--trust --approve-mcps` |
| opencode | `--auto` | flag da instalação local; a fonte documenta `--dangerously-skip-permissions` — confirme no `--help`; `deny` explícito em `opencode.json` ainda vence |
| Codex CLI | `--dangerously-bypass-approvals-and-sandbox` | alias `--yolo`; bypassa aprovações **e** sandbox; sem cap de custo local — o breaker é o `timeout` |
| droid CLI | `--skip-permissions-unsafe` | não combina com `--auto low\|medium\|high` (escadinha nativa, não usada aqui); sem flag alguma o droid é read-only |

## Checklist antes de invocar

- [ ] Ferramenta instalada e logada (falha de auth → **abort total**, regra 2)
- [ ] Flags conferidas com `--help` na primeira invocação na máquina (versões divergem)
- [ ] Worktree/diretório isolado da task como cwd
- [ ] Prompt com objetivo único, critério de conclusão e fronteira
- [ ] Flag de yolo da ferramenta + `timeout` do SO
- [ ] Formato JSON e captura do id de sessão
- [ ] Plano de verificação do resultado (diff, testes)

## Modelo por effort

Modelo se escolhe pelo tier da task, não por hábito: consulte **`pop/scripts/models.json`** (`cheap | medium | strong`) com a matriz papel × size da Orquestração do [[WORKFLOW|WORKFLOW]]. O executor recebe objetivo, contexto, specs, skill, ownership e critérios suficientes para agir com autonomia; não precisa de reasoning persistido nem microinstruções do planejador. A flag de modelo de cada ferramenta está na skill dela (seção "Modelo"); disponibilidade se confere com o comando de listagem da ferramenta (lookup pontual).

## Skills desta família

- `run-cursor-agent` — siga para invocar o Cursor CLI headless.
- `run-opencode` — siga para invocar o opencode headless.
- `run-codex` — siga para invocar o Codex CLI headless.
- `run-droid` — siga para invocar o droid CLI (Factory) headless.

Fontes: sínteses em [[researches/cursor-cli-headless/cursor-cli-headless|cursor-cli-headless]], [[researches/opencode-headless/opencode-headless|opencode-headless]] e [[researches/codex-cli-headless/codex-cli-headless|codex-cli-headless]] — siga para rastrear um fato até o bruto; o droid não tem síntese (skill escrita direto das docs oficiais em 2026-07-16).
