# Plano — [[<id>-<slug>]]

> Blockquotes deste template são instruções de preenchimento — **apague-os ao preencher**.

- **Etapa:** 002_planning · **Responsável:** agent planejador

> O planejador é separado do executor. Este arquivo guarda o resultado do planejamento: um brief suficiente para orientar agentes capazes, sem reasoning, pseudocódigo, trechos de implementação ou edição passo a passo. Alvo: ≤80 linhas; teto ~150. Se as frentes não couberem, proponha tasks encadeadas por `depends_on`.

## Objetivo e resultado esperado

- **Objetivo:** <o que deve mudar>.
- **Resultado observável:** <como o usuário ou sistema percebe a entrega>.

## Estratégia

Poucos parágrafos sobre a abordagem base, decisões que restringem a execução e ordem geral. Detalhes duráveis pertencem às specs; detalhes operacionais ficam a cargo dos executores.

## Áreas afetadas

- `<subtree, módulo ou artefato>` — por que pode mudar.

## Lacunas e preflight (somente se aplicável)

- **RECON NEEDED:** <suposição> — check: <leitura/comando exato>.
- **Preflight:** `<comando>` → <ambiente necessário observado>.

## Frentes de execução

> Uma frente é uma unidade de ownership, não uma lista de edições. Use [[_templates/SUBTASKS|SUBTASKS]] somente quando uma frente precisar de arquivo próprio. Frentes sem dependência lógica **e** sem sobreposição de escrita podem rodar em paralelo; as demais rodam em ondas.

### <F01> — <nome>

- **Entrega:** <resultado desta frente>.
- **Escopo:** <limite funcional>.
- **Owns:** `<arquivos ou padrões que pode alterar>`.
- **May read:** `<contexto permitido/recomendado>`.
- **Must not edit:** `<fronteiras de escrita>`.
- **Depends on:** `<Fxx>` | nenhuma.
- **Entrada esperada:** <contrato ou artefato produzido pela dependência> | nenhuma.
- **Skills:** [[pop/skills/<skill>|<skill>]] — *use para <gatilho>*.
- **Critérios:** <IDs dos critérios abaixo atendidos por esta frente>.

> Dependência ou entrada esperada ausente/incompatível → reporte `BLOCKED` ao orquestrador. Nunca implemente, simule ou corrija a dependência por conta própria.

## Ordem e paralelismo

> Represente a DAG em ondas. Paralelismo exige independência lógica e de escrita.

1. **Onda 1:** F01.
2. **Onda 2:** F02 e F03 em paralelo após F01.
3. **Integração:** orquestrador valida ownership, integra resultados e roda o gate agregado.

## Riscos e condições de aborto

> Registre apenas riscos materiais e condições objetivas que exigem parar; não enumere falha/contra-jogada para cada ação.

- **Risco:** <impacto> — mitigação: <controle>.
- **Abortar se:** <condição objetiva> — sinalizar `blocked: true` com <evidência>.

## Critérios de aceite

> Critérios observáveis, comparados pelo revisor independente em 005. Prefira o gate agregado. Superfície de runtime exige ao menos um `re-run`.

| # | Critério | Verificação | Pass é | Modo 005 |
|---|----------|-------------|--------|----------|
| 1 | <comportamento ou contrato> | `<comando>` ou leitura de <artefato> | <observação objetiva> | re-run \| evidência |

## Specs e contratos

> Linke contratos duráveis; não copie seu conteúdo. Crie ou altere spec apenas quando a entrega mudar comportamento, interface ou invariante durável.

- [[pop/specs/<spec>|<spec>]] — *siga para <contrato>; mudança esperada: <uma linha ou nenhuma>*.
- [`<subtree>/AGENTS.md`](../<caminho-no-repo>/AGENTS.md) — *siga antes de alterar <área>*.

## Topologia de execução

- **Forma:** executor único | especialistas sequenciais | especialistas paralelos | ondas híbridas.
- **Justificativa:** <skills, dependências e limites de escrita que determinam a forma>.
- **Modelo/tier por papel:** <somente quando houver escolha relevante>.
