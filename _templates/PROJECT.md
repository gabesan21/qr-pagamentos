# <Nome do projeto>

- **Categoria:** [[applications/INDEX|applications]] | [[work/INDEX|work]]
- **Status:** ideia | planejando | em andamento | pausado | concluído | abandonado
- **Prioridade:** alta | média | baixa
- **Criado em:** AAAA-MM-DD
- **Roadmap:** [[ROADMAP|Roadmap]]

## Objetivo

Uma ou duas frases: o que é sucesso para este projeto?

## Contexto

O que um agente precisa saber antes de trabalhar nisso: histórico, motivação, estado atual do mundo.

## Estrutura de pastas

Anatomia padrão (ver AGENTS.md da raiz): `AGENTS.md` do projeto + `.agents/skills/`, `ROADMAP.md` + `roadmap/` (epochs), `project/` (conforme o type — [[TYPES|TYPES]]), `researches/` (pesquisas por assunto), `skills/`, `specs/`, `notes/` (learnings/decisions/ideas/references), `memory/` (resumos de tasks concluídas), `worktrees/` (gitignorada), `kanban/` (estágios 001–006 do [[WORKFLOW|WORKFLOW]]). Liste aqui apenas o que fugir do padrão.

## Harness do agente

Regras específicas para agentes trabalhando neste projeto:

- **Type e repositórios:** declarados no [[AGENTS|AGENTS do projeto]] (`default` | `included` | `multi-repo` | `full-multi-repo`, repos e branch de PR — ver [[TYPES|TYPES]]).
- **Worktree por task:** sim (padrão) | não (aceitável só em projeto sem repositório git — tasks perdem o isolamento e o PR).
- **Ferramentas e restrições:** o que pode e o que não pode.
- **Tom/estilo:** se aplicável.
- **Tasks críticas por padrão?** sim | não — e o que torna uma task crítica neste projeto (gate humano extra em 005, ver [[WORKFLOW|WORKFLOW]]).
- **Skills:** liste as skills em `skills/` com uma linha sobre quando usar cada uma.

## Projetos relacionados

- [[PROJECT|<nome>]] — por que se relacionam.

## Decisões

- **AAAA-MM-DD:** decisão tomada e justificativa. (Se crescer, extrair para nota própria em `notes/`.)
