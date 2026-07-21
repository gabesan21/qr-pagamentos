---
id: <id-unico-em-kebab-case>
project: <label-do-projeto>
domain: <dominio-em-kebab-case>
kind: contract
status: draft
implementation: planned
origin: "<phase-de-origem>"
created: AAAA-MM-DD
updated: AAAA-MM-DD
supersedes: []
superseded_by:
---

# Spec — <nome do contrato/tema>

> Blockquotes deste template são instruções de preenchimento — **apague-os ao preencher**.

> Campos e enums do frontmatter permanecem em inglês. `kind`: `contract | overview`; `status`: `draft | active | superseded`; `implementation`: `planned | partial | implemented | not_applicable`. `origin` registra a phase de nascimento, não ownership atual. Relações de substituição usam IDs.

## Contrato

Descrição objetiva do comportamento ou tema durável coberto. Uma spec responde a uma pergunta; se responder a duas, divida-a.

## Comportamento esperado

- Dado <estado/entrada>, quando <evento>, então <resultado observável>.

## Invariantes

- <regra que deve permanecer verdadeira em qualquer implementação>.

## Interfaces

> Registre somente interfaces prometidas a consumidores: payloads, schemas, comandos, eventos, estados ou assinaturas públicas. Código só quando ele próprio for contrato.

- **Entrada:** <formato, restrições e exemplo mínimo se necessário>.
- **Saída:** <formato e garantias>.
- **Compatibilidade:** <versões ou consumidores afetados>.

## Erros e limites

- **<condição>:** <erro/estado observável e comportamento esperado>.
- **Limite:** <restrição relevante>.

## Critérios de conformidade

- [ ] <comportamento ou invariante objetivamente verificável>.

## Fora de escopo

- <o que não pertence a este contrato e onde está coberto, se linkável>.

## Questões abertas

- <pergunta ainda sem resposta; remova a seção quando vazia>.

## Referências relacionadas

> Cada link leva um gatilho. Em aplicações, inclua contratos DOX relevantes.

- [[pop/specs/<outra-spec>|<outra-spec>]] — *siga se <condição>*.
- [`<subtree>/AGENTS.md`](../<caminho-no-repo>/AGENTS.md) — *siga antes de alterar <área>*.

> Não registre solução interna, sequência de edição, reasoning, pseudocódigo, changelog ou lista de tasks entregues. Estratégia pertence ao plano; acontecimento, commit e datas de execução pertencem à `memory/`; procedimento reutilizável pertence a uma skill.
