# TYPES — types de projeto

O PoP é um **agregador de repositórios**: cada projeto declara um `type` no seu próprio `AGENTS.md` (modelo [[_templates/AGENTS-PROJECT|AGENTS-PROJECT]]), que define onde mora o trabalho real, onde fica o harness do PoP e onde os repositórios são declarados. Regras gerais: [[AGENTS|AGENTS]] · Fluxo: [[WORKFLOW|WORKFLOW]].

## Visão rápida

| Type | Pasta `project/` | Harness do PoP | Repositório(s) |
|------|------------------|----------------|----------------|
| `default` | existe: trabalho real ou clone do repo externo | em `categories/<categoria>/<projeto>/`, fora de `project/` | opcional — declarado **só no AGENTS.md do projeto** |
| `included` | **não existe** | na **raiz do repositório do projeto**, junto dos demais arquivos | opcional — se houver, entra em **Repositórios agregados** no [[INDEX|INDEX]] raiz |
| `multi-repo` | contém **múltiplos repositórios**, um subdiretório por repo | em `categories/<categoria>/<projeto>/` | **obrigatório** — todos no AGENTS.md do projeto **e** no INDEX raiz |
| `full-multi-repo` | múltiplos repositórios, cada um com **harness próprio embutido** (estilo `included`) | dividido: geral em `categories/<categoria>/<projeto>/`, por-repo dentro de cada repo | **obrigatório** — todos no AGENTS.md do projeto **e** no INDEX raiz |

## default

O padrão do PoP. O harness (kanban, roadmap, specs, notes, memory…) mora em `categories/<categoria>/<projeto>/` dentro do repositório do PoP; o trabalho real mora em `project/`.

- **Sem repo externo:** `project/` é versionado no próprio repositório do PoP.
- **Com repo externo:** `project/` recebe o clone (`project/<nome-do-repo>/`), listado no `.gitignore` do projeto. O repo e a branch de PR são declarados **apenas no AGENTS.md do projeto** — não na lista geral do PoP. O harness do PoP **nunca é commitado** nos arquivos de `project/` — o repo externo fica limpo de specs de IA.

## included

O harness do PoP vive **dentro do repositório do projeto**, na raiz, misturado aos demais arquivos — não existe subpasta `project/`. É o type para quem quer o workflow do PoP commitado no próprio repo, funcionando standalone para quem nem usa o PoP.

- **Com repo:** o repo é clonado em `categories/<categoria>/<projeto>/` e listado em **Repositórios agregados** no [[INDEX|INDEX]] raiz; o caminho do clone entra no `.gitignore` **raiz** do PoP (o PoP não versiona o conteúdo — só o registro no índice). A materialização usa `python3 scripts/pop_install_included.py <repo>`; o manifesto é a única lista do pacote e a atualização repete o mesmo comando.
- **Sem repo:** a pasta do projeto no PoP é a própria raiz do projeto, versionada no PoP.

## multi-repo

Como o `default`, mas `project/` contém **múltiplos repositórios**, um subdiretório por repo (`project/<repo-a>/`, `project/<repo-b>/`), todos clonados e gitignorados no `.gitignore` do projeto.

- Declarar **todos** os repos (URL, caminho, branch de PR) no AGENTS.md do projeto **e** em Repositórios agregados no INDEX raiz.
- Worktrees: uma por repositório afetado pela task, em `worktrees/<id-da-task>/<repo>/` — ver [[WORKFLOW|WORKFLOW]].

## full-multi-repo

Como o `multi-repo` na pasta principal, mas cada repo em `project/<repo>/` carrega o **próprio harness embutido** (instalação `included` completa, commitada no repo): kanban, specs, memory, notes, skills, researches e ROADMAP individuais. O conjunto vira um **monorepo lógico**: quem trabalha num repo só (ex.: dev frontend) usa o harness daquele repo, standalone; quem trabalha no todo usa a pasta principal no PoP.

- **Pasta principal (no PoP):** AGENTS.md, ficha, ROADMAP geral + `roadmap/` (epochs macro cujas phases apontam, com gatilho, para os ROADMAPs individuais ou para tasks cross), `kanban/` **só para tasks cross-repo**, `worktrees/` dessas tasks, `researches/` e `notes/` transversais. **Sem `specs/` nem `memory/`** — vivem sempre nos repos.
- **Cada repo:** anatomia `included` completa; o AGENTS.md do repo declara `type: included` (a verdade standalone) + uma seção **"Parte de"** linkando o projeto-mãe, o ROADMAP geral e o kanban cross.
- **Task de um repo só** → kanban do próprio repo, worktree em `worktrees/<id>/` dentro do repo (o repo é o próprio git).
- **Task cross-repo** → kanban central; uma worktree por repo afetado em `worktrees/<id>/<repo>/` (como no `multi-repo`); ao concluir (006), grava `memory/<id>.md` em **cada repo afetado** e sincroniza as specs **nos repos** — o card central linka essas memórias.
- **Specs de contrato entre repos** (ex.: API front↔back) vivem no repo "dono" do contrato; os demais linkam.
- **Slug de task leva o nome do repo** (ex.: `1.2.1-front-login-page`): ids são únicos no vault inteiro e os scripts localizam task por id.
- Clones gitignorados no `.gitignore` do projeto; `worktrees/` gitignorada no `.gitignore` de cada repo.

## O que `new-project` cria por type

| Passo | default | included | multi-repo | full-multi-repo |
|-------|---------|----------|------------|-----------------|
| Anatomia padrão (AGENTS.md, .agents/, memory/, worktrees/, kanban/…) | no PoP | dentro do repo (ou no PoP, sem repo) | no PoP | geral reduzida no PoP (sem specs/memory) + `included` completa dentro de cada repo |
| `.agents/skills/` | cópias reais das core skills | cópias reais das core skills | cópias reais das core skills | cópias na principal **e** em cada repo |
| Clone(s) | `project/<repo>/` (se houver) | `categories/<categoria>/<projeto>/` | `project/<repo>/` para cada | `project/<repo>/` para cada |
| `.gitignore` do projeto | `worktrees/` + clone | `worktrees/` | `worktrees/` + clones | `worktrees/` + clones (cada repo ignora a própria `worktrees/`) |
| `.gitignore` raiz do PoP | — | caminho do clone | — | — |
| Repositórios agregados (INDEX raiz) | — | repo (se houver) | todos os repos | todos os repos |
