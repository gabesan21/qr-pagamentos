---
draft: new-project
status: rascunho
created: AAAA-MM-DD
---

# Rascunho de projeto novo — <nome provisório>

> Copie este arquivo para `drafts/new/<nome-kebab>.md` e preencha o que souber — são as mesmas perguntas da entrevista da skill `new-project`. **"Não sei ainda" é resposta válida**: deixe em branco ou escreva a dúvida. Quando terminar, mude `status: rascunho` → `pronto`. Ao ser acionado, o agente usa o rascunho como entrevista pré-respondida (confirma, não repergunta), lança o que bloquear decisão em `open_questions/` e **apaga este arquivo** ao materializar o projeto. Blockquotes são instruções — apague-as ao preencher.

## Essência

- **O que é o projeto** (1–2 frases):
- **Sucesso** — como você saberá que deu certo:
- **Tipo** (programação, escrita, negócio, pesquisa, pessoal...):
- **Categoria** (em `categories/`: `agents` | `applications` | `writing` | `work` — ou propor nova):
- **Nome em kebab-case** (proposta):

## Type e repositórios

> Types explicados em [[TYPES|TYPES]]: `default` (conteúdo na raiz da pasta do projeto, harness em `pop/`) | `included` (a raiz do projeto é o repo, `pop/` commitado nele) | `multi-repo` (um clone por repo na raiz da pasta, `pop/` único) | `full-multi-repo` (vários repos, cada um com `pop/` estilo `included` embutido; kanban central só para tasks cross-repo).

- **Type:**
- **Repositório(s)** — URL e nome de cada (**todos**, se `multi-repo`):
- **Branch de PR** — para onde as worktrees de task abrem PR (ex.: `main`):

## Contexto e harness

- **Ferramentas e restrições** que os agentes devem respeitar:
- **Tom/estilo**, se aplicável:
- **Tasks críticas por padrão?** (gate humano extra na verificação — sim/não):
- **Projetos do vault relacionados:**
- **Idioma padrão do projeto** (specs, notes, pesquisas, comentários de código):
- **Idiomas suportados (i18n)**, se for aplicação:

## Roadmap (opcional)

> A skill `plan-roadmap` refina isso com você — aqui vale um esboço.

- **Destino** — onde o projeto precisa chegar:
- **Epochs candidatas** (uma linha cada):
- **Temas que pedem pesquisa profunda** (viram prompts no RESEARCHES.md):

## Specs iniciais (opcional)

- **Temas que merecem spec desde já** (uma linha cada):

## Perguntas abertas

> O que você ainda não decidiu e quer discutir com o agente.

-
