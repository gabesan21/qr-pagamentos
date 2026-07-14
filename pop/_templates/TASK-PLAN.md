# Plano (wargame) — [[<id>-<slug>]]

> Blockquotes deste template são instruções de preenchimento — **apague-os ao preencher**.

- **Etapa:** 002_planning · **Responsável:** agent

> Você não está executando a task — está **wargameando** a execução. Quem roda o plano em 004 pode ser um executor mais simples: escreva para que ele execute **sem fazer uma única pergunta**. Cerimônia proporcional ao `size` do card: **S = mini-plano de ≤40 linhas** (rota, preflight, critérios — sem recon delegado, red-team e forks obrigatórios). Limite geral: **200 linhas** (exceção documentada à regra de ~150); movimentos detalhados moram nos grupos em `subtasks/`. Estourou 200 → a task é grande demais: proponha dividi-la em mais tasks encadeadas por `depends_on`.

## Recon

> Leitura prévia, read-only, **orçada**: comece pelas pesquisas e specs linkadas no card; depois liste as perguntas que o plano precisa e você não sabe responder — só pergunta acima do piso da regra 18 (~5K tokens de leitura) vira worker, em ondas de **até 3-5**; **0 workers é válido**. Cada relatório traz **fonte (arquivo/linha) por achado** e a seção **"Lacunas / Não encontrado"** (alimenta o RECON NEEDED); workers não disparam subagentes. **Sem web** — lacuna de conhecimento vira prompt no `RESEARCHES.md` + `blocked` (ver WORKFLOW 002); lookup pontual via comando é permitido e registrado aqui.

- <fonte lida> — o que ela estabeleceu, em uma linha.

### RECON NEEDED

> Suposições que o recon não resolveu. Cada uma com o **check exato** que a resolve e em que movimento ele roda.

- [ ] <suposição> — check: <comando/leitura que a confirma ou derruba> (no grupo <gNN>).

### Preflight de ambiente

> Bateria barata, rodada **direto** pelo planejador: versões de runtime e ferramentas de que o plano depende. Suposição de ambiente não verificada é a causa clássica de retorno 004→002.

- `<comando>` → <o que foi observado> (ex.: `node --version` → v24.x).

## Rota

Como a task será executada, em poucos parágrafos. Alternativas descartadas em uma linha cada, se relevante.

## Forks

> Rotas alternativas **pré-autorizadas**, cada uma com gatilho objetivo. Sem gatilho não é fork — é retorno ao humano (002).

- Se observar <X> (no movimento <ref>) → <rota B, em uma linha>.

## Condições de aborto

> Os momentos de **parar e sinalizar** (`blocked: true` + motivo) em vez de improvisar.

- <condição objetiva que encerra a execução>.

## Critérios de aceite e verificação

> É contra esta tabela que o 005 roda — cada critério com o run exato, a aparência do pass e o **modo 005**: `re-run` (comportamento externo observável — o verificador re-executa) ou `evidência` (o verificador audita a saída capturada pelo executor). Task com superfície de runtime exige **≥1 `re-run`**. Prefira o **gate agregado** do projeto a N runs separados — run individual só para o que ele não cobre. O `.verify.md` nasce dela. **Task yolo:** critério sem run executável e "Pass é" observável será **devolvido pelo crítico** em 003 — nada subjetivo.

| # | Critério | Run de verificação | Pass é | 005 |
|---|----------|--------------------|--------|-----|
| 1 | <objetivo e checável> | `<comando>` ou leitura de <onde> | <o que deve ser observado> | re-run \| evidência |

## Specs da mudança

> Montadas **aqui** (rascunho via `write-spec`), aprovadas junto com o gate 003, sincronizadas com as specs do projeto em 006 (`sync-specs`).

- [[pop/specs/<spec>|<spec>]] — o que muda nela, em uma linha.

## Contexto mínimo do executor

> Lista **fechada**, montada no wargame: tudo que o executor de 004 lê. Fora dela, só com gatilho de fork.

- <arquivo/spec/contrato> — o que ele responde, em uma linha.

## Grupos de subtasks

Um arquivo por grupo em `subtasks/` ([[_templates/SUBTASKS|template]]), com os movimentos detalhados (observação esperada, falha provável → contra-jogada):

> **Task yolo:** evite itens `(user)` — o crítico não faz ação de humano no mundo real; item `(user)` inevitável trava a task (`blocked: true`) e devolve ao humano via INBOX.

1. [[<id>-<slug>.g01-<slug-do-grupo>]] — uma linha sobre o grupo.
2. [[<id>-<slug>.g02-<slug-do-grupo>]] — ...

## Red-team

> **Obrigatório em size M/L**, antes de 003 — em S é dispensado, registrando a dispensa em uma linha. Ataque o próprio plano (ou peça a um subagente com contexto limpo) e registre:

- **Ataque que falhou contra o plano:** <o ataque e por que o plano resistiu>.
- **Ataque que passou → patch:** <o que furou> → <o que mudou no plano por causa disso>.
