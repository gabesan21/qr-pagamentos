# TYPES — types de projeto

O PoP é um **agregador de repositórios**: cada projeto declara um `type` no seu próprio `AGENTS.md` (modelo [[_templates/AGENTS-PROJECT|AGENTS-PROJECT]]). Desde 2026-07-14 a anatomia é a mesma para todos: **o harness do PoP mora na subpasta `pop/`** e o conteúdo do projeto fica na **raiz** da pasta (na raiz só ficam `AGENTS.md`, `CLAUDE.md`, `.agents/skills/`, `.gitignore` e o conteúdo). O type define duas coisas: **onde mora(m) o(s) repositório(s)** e **qual `pop/` é dono de qual kanban**. Regras gerais: [[AGENTS|AGENTS]] · Fluxo: [[WORKFLOW|WORKFLOW]].

> **Transição:** projetos criados antes de 2026-07-14 ainda usam a anatomia legada (harness na raiz da pasta e conteúdo em `project/`) até a migração; os scripts `pop_*` suportam as duas.

## Visão rápida

| Type | Raiz do projeto (conteúdo) | `pop/` | Repositório(s) |
|------|----------------------------|--------|----------------|
| `default` | pasta no vault (`categories/<categoria>/<projeto>/`) | versionado no PoP | opcional — declarado **só no AGENTS.md do projeto** |
| `included` | o **próprio repo externo** (a pasta no vault é o clone gitignorado) | commitado **no repo** | opcional — se houver, entra em **Repositórios agregados** no [[INDEX|INDEX]] raiz |
| `multi-repo` | pasta no vault com **um clone por repo na raiz** (gitignorados) | versionado no PoP, kanban único | **obrigatório** — todos no AGENTS.md do projeto **e** no INDEX raiz |
| `full-multi-repo` | como multi-repo, mas cada clone traz o **próprio `pop/`** estilo `included` | mãe: só ROADMAP geral + kanban cross-repo | **obrigatório** — todos no AGENTS.md do projeto **e** no INDEX raiz |

**Nomes reservados:** nenhum repo/pasta de conteúdo na raiz de um projeto pode se chamar `pop` (colide com o harness) nem `project` (colide com a descoberta da anatomia legada durante a transição).

## default

O padrão do PoP. A pasta do projeto no vault carrega o harness em `pop/` e o conteúdo (código, manuscrito etc., estrutura livre) direto na raiz.

- **Sem repo externo:** raiz e `pop/` versionados no próprio repositório do PoP.
- **Com repo externo:** o repo e a branch de PR são declarados **apenas no AGENTS.md do projeto** — não na lista geral do PoP; se houver clone local, ele entra no `.gitignore` do projeto. O harness do PoP **nunca é commitado** no repo externo — ele fica limpo de arquivos de IA.

## included

A raiz do projeto **é o repositório externo**: o `pop/` inteiro (incluindo `WORKFLOW.md`, `TYPES.md`, `INBOX.md`, `_templates/` e `pop/scripts/`) é commitado no repo, com `AGENTS.md` e `.agents/skills/` na raiz. É o type para quem quer o workflow do PoP viajando com o próprio repo, funcionando standalone para quem nem usa o PoP — e o dev vê só `AGENTS.md`, `.agents/` e uma pasta `pop/`.

- **Com repo:** o repo é clonado em `categories/<categoria>/<projeto>/` e listado em **Repositórios agregados** no [[INDEX|INDEX]] raiz; o caminho do clone entra no `.gitignore` **raiz** do PoP (o PoP não versiona o conteúdo — só o registro no índice). A materialização usa `python3 pop/scripts/pop_install_included.py <repo>`; o manifesto é a única lista do pacote e a atualização repete o mesmo comando.
- **Sem repo:** a pasta do projeto no PoP é a própria raiz do projeto, versionada no PoP.

## multi-repo

Como o `default`, mas a raiz da pasta contém **múltiplos repositórios**, um subdiretório por repo (`<repo-a>/`, `<repo-b>/`), todos clonados e gitignorados no `.gitignore` do projeto. O harness (kanban único, specs, memory…) fica no `pop/` do projeto, versionado no PoP.

- Declarar **todos** os repos (URL, caminho, branch de PR) no AGENTS.md do projeto **e** em Repositórios agregados no INDEX raiz.
- Worktrees: uma por repositório afetado pela task, em `pop/worktrees/<id-da-task>/<repo>/` — ver [[WORKFLOW|WORKFLOW]].

## full-multi-repo

Como o `multi-repo` na pasta principal, mas cada repo clonado na raiz carrega o **próprio harness embutido** (instalação `included` completa em `<repo>/pop/`, commitada no repo): kanban, specs, memory, notes, skills, researches e ROADMAP individuais. O conjunto vira um **monorepo lógico**: quem trabalha num repo só (ex.: dev frontend) usa o `pop/` daquele repo, standalone; quem trabalha no todo usa a pasta principal no PoP.

- **Pasta principal (no PoP):** AGENTS.md, e no `pop/` da mãe: ficha, ROADMAP geral + `roadmap/` (epochs macro cujas phases apontam, com gatilho, para os ROADMAPs individuais ou para tasks cross), `kanban/` **só para tasks cross-repo**, `worktrees/` dessas tasks, `researches/` e `notes/` transversais. **Sem `specs/` nem `memory/`** — vivem sempre nos repos.
- **Cada repo:** anatomia `included` completa; o AGENTS.md do repo declara `type: included` (a verdade standalone) + uma seção **"Parte de"** linkando o projeto-mãe, o ROADMAP geral e o kanban cross.
- **Task de um repo só** → kanban do próprio repo, worktree em `pop/worktrees/<id>/` dentro do repo (o repo é o próprio git).
- **Task cross-repo** → kanban central; uma worktree por repo afetado em `pop/worktrees/<id>/<repo>/` na mãe (como no `multi-repo`); ao concluir (006), grava `pop/memory/<id>.md` em **cada repo afetado** e sincroniza as specs **nos repos** — o card central linka essas memórias.
- **Specs de contrato entre repos** (ex.: API front↔back) vivem no repo "dono" do contrato; os demais linkam.
- **Slug de task leva o nome do repo** (ex.: `1.2.1-front-login-page`): ids são únicos no vault inteiro e os scripts localizam task por id.
- Clones gitignorados no `.gitignore` do projeto; `pop/worktrees/` gitignorada no `.gitignore` de cada repo.

## O que `new-project` cria por type

| Passo | default | included | multi-repo | full-multi-repo |
|-------|---------|----------|------------|-----------------|
| `AGENTS.md` + `.agents/skills/` (raiz) + `pop/` (harness completo) | no PoP | dentro do repo (ou no PoP, sem repo) | no PoP | `pop/` reduzido na mãe (sem specs/memory) + `included` completo dentro de cada repo |
| `.agents/skills/` | cópias reais das core skills | cópias reais das core skills | cópias reais das core skills | cópias na principal **e** em cada repo |
| Clone(s) | opcional, na raiz do projeto (se houver) | `categories/<categoria>/<projeto>/` | `<repo>/` na raiz do projeto, para cada | `<repo>/` na raiz do projeto, para cada |
| `.gitignore` do projeto | `pop/worktrees/` + clone | `pop/worktrees/` | `pop/worktrees/` + clones | `pop/worktrees/` + clones (cada repo ignora a própria `pop/worktrees/`) |
| `.gitignore` raiz do PoP | — | caminho do clone | — | — |
| Repositórios agregados (INDEX raiz) | — | repo (se houver) | todos os repos | todos os repos |
