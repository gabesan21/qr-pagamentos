# Plano (wargame) — [[<id>-<slug>]]

> Blockquotes deste template são instruções de preenchimento — **apague-os ao preencher**.

- **Etapa:** 002_planning · **Responsável:** agent

> Você não está executando a task — está **wargameando** a execução. Quem roda o plano em 004 pode ser um executor mais simples: escreva para que ele execute **sem fazer uma única pergunta**. Limite: **200 linhas** (exceção documentada à regra de ~150); movimentos detalhados moram nos grupos em `subtasks/`. Estourou 200 → a task é grande demais: proponha dividi-la em mais tasks encadeadas por `depends_on`.

## Recon

> Leitura prévia, read-only, **antes** de planejar: specs, código/material afetado, referências. Em boards com muita pesquisa, dispare **subagentes paralelos** — um por frente de investigação, em **ondas de 3-5** — e consolide aqui. Cada relatório traz **fonte (arquivo/linha) por achado** e a seção **"Lacunas / Não encontrado"** (alimenta o RECON NEEDED); workers de recon não disparam subagentes.

- <fonte lida> — o que ela estabeleceu, em uma linha.

### RECON NEEDED

> Suposições que o recon não resolveu. Cada uma com o **check exato** que a resolve e em que movimento ele roda.

- [ ] <suposição> — check: <comando/leitura que a confirma ou derruba> (no grupo <gNN>).

## Rota

Como a task será executada, em poucos parágrafos. Alternativas descartadas em uma linha cada, se relevante.

## Forks

> Rotas alternativas **pré-autorizadas**, cada uma com gatilho objetivo. Sem gatilho não é fork — é retorno ao humano (002).

- Se observar <X> (no movimento <ref>) → <rota B, em uma linha>.

## Condições de aborto

> Os momentos de **parar e sinalizar** (`blocked: true` + motivo) em vez de improvisar.

- <condição objetiva que encerra a execução>.

## Critérios de aceite e verificação

> É contra esta tabela que o 005 roda — cada critério com o run exato e a aparência do pass. O `.verify.md` nasce dela. **Task yolo:** critério sem run executável e "Pass é" observável será **devolvido pelo crítico** em 003 — nada subjetivo.

| # | Critério | Run de verificação | Pass é |
|---|----------|--------------------|--------|
| 1 | <objetivo e checável> | `<comando>` ou leitura de <onde> | <o que deve ser observado> |

## Specs da mudança

> Montadas **aqui** (rascunho via `write-spec`), aprovadas junto com o gate 003, sincronizadas com as specs do projeto em 006 (`sync-specs`).

- [[categories/<categoria>/<projeto>/specs/<spec>|<spec>]] — o que muda nela, em uma linha.

## Contexto mínimo do executor

> Lista **fechada**, montada no wargame: tudo que o executor de 004 lê. Fora dela, só com gatilho de fork.

- <arquivo/spec/contrato> — o que ele responde, em uma linha.

## Grupos de subtasks

Um arquivo por grupo em `subtasks/` ([[_templates/SUBTASKS|template]]), com os movimentos detalhados (observação esperada, falha provável → contra-jogada):

> **Task yolo:** evite itens `(user)` — o crítico não faz ação de humano no mundo real; item `(user)` inevitável trava a task (`blocked: true`) e devolve ao humano via INBOX.

1. [[<id>-<slug>.g01-<slug-do-grupo>]] — uma linha sobre o grupo.
2. [[<id>-<slug>.g02-<slug-do-grupo>]] — ...

## Red-team

> **Obrigatório** antes de 003 — dispense apenas em task trivial de pouquíssimos passos, registrando a dispensa em uma linha. Ataque o próprio plano (ou peça a um subagente com contexto limpo) e registre:

- **Ataque que falhou contra o plano:** <o ataque e por que o plano resistiu>.
- **Ataque que passou → patch:** <o que furou> → <o que mudou no plano por causa disso>.
