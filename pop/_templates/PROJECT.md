# <Nome do projeto>

- **Categoria:** [[applications/INDEX|applications]] | [[work/INDEX|work]]
- **Status:** ideia | planejando | em andamento | pausado | concluído | abandonado
- **Prioridade:** alta | média | baixa
- **Criado em:** AAAA-MM-DD
- **Roadmap:** [[pop/ROADMAP|Roadmap]]

## Objetivo

Uma ou duas frases: o que é sucesso para este projeto?

## Contexto

O que um agente precisa saber antes de trabalhar nisso: histórico, motivação, estado atual do mundo.

## Estrutura de pastas

Anatomia padrão (ver AGENTS.md da raiz): `AGENTS.md` do projeto + `.agents/skills/` na raiz; **todo o harness em `pop/`** — `pop/PROJECT.md` + `pop/ROADMAP.md` + `pop/roadmap/` (epochs), `pop/researches/` (pesquisas por assunto), `pop/skills/`, `pop/specs/`, `pop/notes/` (learnings/decisions/ideas/references), `pop/memory/` (resumos de tasks concluídas), `pop/worktrees/` (gitignorada), `pop/kanban/` (estágios 001–006 do [[WORKFLOW|WORKFLOW]]); o **conteúdo do projeto** (código, manuscrito, clones — conforme o type, [[TYPES|TYPES]]) vive direto na raiz. Liste aqui apenas o que fugir do padrão.

## Harness do agente

Regras específicas para agentes trabalhando neste projeto:

- **Type e repositórios:** declarados no [[AGENTS|AGENTS do projeto]] (`default` | `included` | `multi-repo` | `full-multi-repo`, repos e branch de PR — ver [[TYPES|TYPES]]).
- **Worktree por task:** sim (padrão) | não (aceitável só em projeto sem repositório git — tasks perdem o isolamento e o PR).
- **Ferramentas e restrições:** o que pode e o que não pode.
- **Tom/estilo:** se aplicável.
- **Tasks críticas por padrão?** sim | não — e o que torna uma task crítica neste projeto (gate humano extra em 005, ver [[WORKFLOW|WORKFLOW]]).
- **Skills:** liste as skills em `pop/skills/` com uma linha sobre quando usar cada uma.

## Projetos relacionados

- [[pop/PROJECT|<nome>]] — por que se relacionam.

## Decisões

- **AAAA-MM-DD:** decisão tomada e justificativa. (Se crescer, extrair para nota própria em `pop/notes/`.)
