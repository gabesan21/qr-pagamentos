# Plano — [[<id>-<slug>]]

> Blockquotes deste template são instruções de preenchimento — **apague-os ao preencher**.

- **Etapa:** 002_planning · **Responsável:** agent planejador

> O planejador é separado do executor. Este arquivo guarda o resultado do planejamento: um brief suficiente para orientar agentes capazes, sem reasoning, pseudocódigo, trechos de implementação ou edição passo a passo.
> **Teto: 80 linhas, em qualquer `size`** (validado por `pop_validate`). Esta é a fatia que todos leem, então ela não cresce com a task — o que cresce é o número de arquivos de frente. Não couber significa **modularizar** em `subtasks/`, nunca comprimir a ponto de perder decisão. Dividir a task por `depends_on` é exceção, para quando as frentes não compartilham objetivo.
> **Task `yolo: true` e (`size: L` ou `critical: true`)**: o 002 entrega **também** `<id>.defense.md` ([[_templates/TASK-DEFENSE|TASK-DEFENSE]], ≤30 linhas) — sem ela a configuração A do ato 1 não roda e a task volta para cá.

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

> Uma frente é uma unidade de ownership, não uma lista de edições. **Toda frente que for para um contexto separado ganha arquivo próprio** em `subtasks/` ([[_templates/SUBTASKS|SUBTASKS]], ≤50 linhas) — é a fatia de leitura daquele executor; aqui fica só a linha de resumo e o link. Task de frente única não tem `subtasks/`: o executor lê o plano, que já é curto. Frentes sem dependência lógica **e** sem sobreposição de escrita podem rodar em paralelo; as demais rodam em ondas.

### <F01> — <nome>

- **Entrega:** <resultado desta frente>.
- **Contrato:** [[<id>-<slug>.g01-<slug-da-frente>]] — *siga como fatia única de execução desta frente* (omita quando a task tem uma frente só: os campos abaixo bastam).
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

> Critérios observáveis, comparados no gate de `005_closing`. Eles são **o contrato**: valem para o executor e para o gate, e precisam cobrir o "O quê / Por quê" do card — critério que não cobre o pedido é defeito de plano e volta para cá. Prefira o gate agregado. Superfície de runtime exige ao menos um `re-run`.
> **Append-only entre rodadas:** devolução por `lacuna` acrescenta linha e mantém os IDs existentes — renumerar critério ou frente quebra as referências do `.verify.md` e da telemetria, e força a re-revisão a recomeçar do zero.

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
