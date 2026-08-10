# Plano — [[<id>-<slug>]]

> Blockquotes deste template são instruções de preenchimento — **apague-os ao preencher**.

- **Etapa:** 002_planning · **Papel:** `pop-planner` (separado da execução)
> **Teto: 80 linhas, em qualquer `size`** (validado por `pop_validate`). O `pop-planner` escreve esta origem; papéis posteriores recebem seu path no envelope e leem só as seções autorizadas. Não couber significa modularizar em `subtasks/`.

## Objetivo e resultado esperado

- **Objetivo:** <o que deve mudar>.
- **Resultado observável:** <como o usuário ou sistema percebe a entrega>.

## Estratégia

Poucos parágrafos sobre a abordagem base, decisões que restringem a execução e ordem geral. Detalhes duráveis pertencem às specs; detalhes operacionais ficam a cargo dos executores.

## Áreas afetadas

- `<subtree, módulo ou artefato>` — por que pode mudar.

## Frentes de execução

> Toda frente enviada a contexto separado ganha arquivo em `subtasks/` ([[_templates/SUBTASKS|SUBTASKS]], ≤50 linhas). Task de frente única usa este plano; paralelismo exige independência lógica e de escrita.

### <F01> — <nome>

- **Entrega:** <resultado desta frente>.
- **Contrato:** [[<id>-<slug>.g01-<slug-da-frente>]] — *siga como fatia única de execução desta frente* (omita quando a task tem uma frente só: os campos abaixo bastam).
- **Papel:** `pop-executor` | `pop-execution-orchestrator`.
- **Escopo:** <limite funcional>.
- **Paths de entrada:** `<card, seções deste plano, fatia, specs/skills>`.
- **Owns:** `<arquivos ou padrões que pode alterar>`.
- **May read:** `<paths autorizados somente para leitura>`.
- **Must not edit:** `<fronteiras de escrita>`.
- **Depends on:** `<Fxx>` | nenhuma.
- **Entrada esperada:** <contrato ou artefato produzido pela dependência> | nenhuma.
- **Skills:** [[pop/skills/<skill>|<skill>]] — *use para <gatilho>*.
- **Web:** deny | allow read-only oficial (somente exceção cumulativa elegível).
- **Gate/delta:** <gate aplicável ou paths/frentes da reentrada> | nenhum.
- **Saída:** <artefato/formato>, teto <N>, evidência <tipo>, status `concluída | BLOCKED`.
- **Critérios:** <IDs dos critérios abaixo atendidos por esta frente>.

> Dependência ou entrada esperada ausente/incompatível → reporte `BLOCKED` ao agente principal. Nunca implemente, simule ou corrija a dependência.

## Ordem e paralelismo

> Represente a DAG em ondas. Paralelismo exige independência lógica e de escrita.

1. **Onda 1:** F01.
2. **Onda 2:** F02 e F03 em paralelo após F01.
3. **Integração:** o agente principal valida ownership, integra e confere os critérios `agent`.

## Riscos e condições de aborto

- **Risco:** <impacto> — mitigação: <controle>.
- **Abortar se:** <condição objetiva> — sinalizar `blocked: true` com <evidência>.

## Critérios de aceite

> Critérios observáveis, comparados no gate de `005_closing`. Eles são **o contrato**: valem para o executor e para o gate, e precisam cobrir o "O quê / Por quê" do card — critério que não cobre o pedido é defeito de plano e volta para cá.
> **Todo critério declara quem verifica** (`agent` | `phase` | `user`). **A task não roda teste algum:** critério que exige executar teste (unitário, integração, e2e, bateria) é **`phase`** — acumula na checklist da phase e roda uma única vez, na task `verificacao-da-phase` (seção "Verificação de phase" do [[WORKFLOW|WORKFLOW]]); só o plano dessa task declara re-run como critério `agent`. `agent` fica para inspeção barata e determinística no alcance do agente — consulte `notes/references/limites-de-verificacao.md` do escopo antes de atribuir; verificação que dependa de infra fora desse alcance nasce `user` e vai para a checklist de verificação humana da entrega, sem bloquear gate. Exigir do agente verificação impossível é defeito de plano.
> **Append-only entre rodadas:** devolução por `lacuna` acrescenta linha e mantém os IDs existentes — renumerar critério ou frente quebra as referências do `.verify.md` e da telemetria, e força a re-revisão a recomeçar do zero.

| # | Critério | Verifica | Verificação | Pass é | Modo 005 |
|---|----------|----------|-------------|--------|----------|
| 1 | <comportamento ou contrato> | agent \| phase \| user | leitura de <artefato> ou `<teste na task de verificação da phase>` | <observação objetiva> | evidência \| phase \| humano |

## Specs e contratos

> Linke contratos duráveis; não copie seu conteúdo. Crie ou altere spec apenas quando a entrega mudar comportamento, interface ou invariante durável.

- [[pop/specs/<spec>|<spec>]] — *siga para <contrato>; mudança esperada: <uma linha ou nenhuma>*.
- [`<subtree>/AGENTS.md`](../<caminho-no-repo>/AGENTS.md) — *siga antes de alterar <área>*.

## Topologia de execução

- **Forma/justificativa:** executor único | especialistas sequenciais | paralelos | ondas híbridas — <skills, dependências e write sets>.
- **Perfis:** fixos por papel nativo; `size` altera só orçamento/profundidade.
