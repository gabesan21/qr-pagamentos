---
task: <id>-<slug>
project: <categoria>/<projeto>
started: AAAA-MM-DD
finished: AAAA-MM-DD
commit: <hash do commit final>
pr: <link do PR, se houver>
authorization: <D-AAAAMMDD-<slug>: comando humano que dispensou o kanban · F-AAAAMMDD-<slug>: triagem de fix direto (regra 13)>
---

# <id>-<slug> — <título curto>

> **Ledger** da task: o arquivo que prova que ela terminou. Mora em `memory/<AAAA-MM-DD>/<id>-<slug>.md`, e a **pasta é a data de conclusão — igual a `finished`**. Limite: **1200 caracteres**.
> O ledger não conta o que foi feito; ele identifica, atesta e **indexa**. O que foi feito mora nas **entradas** ao lado, `memory/<AAAA-MM-DD>/<id>-<slug>.<nn>-<slug-da-entrada>.md` ([[_templates/MEMORY-ENTRY|MEMORY-ENTRY]]) — uma coisa feita por arquivo, ≤800 caracteres, cada uma com wikilink de evidência. É essa granularidade que permite otimizar depois com [[.agents/skills/optimize-memory/SKILL|optimize-memory]] sem reler a memory inteira.
> Áreas alteradas, telemetria, decisões duráveis e desvios **não** são bullets daqui: são entradas.
> Desvio humano que dispense literalmente o kanban usa `task: D-AAAAMMDD-<slug>`; **fix direto** aprovado na triagem da regra 13 usa `task: F-AAAAMMDD-<slug>`. Ambos preenchem `authorization` e não possuem card nem linha de roadmap/modifications — mas têm ledger e entradas como qualquer outra.

- **Entrega:** <uma frase: o que passou a existir ou mudou>.
- **Verificação:** <gate agregado e resultado>.
- **Impacto em contratos:** specs: <avaliadas; atualizadas quando afetadas> · DOX: <avaliado; atualizado quando afetado>.

## Entradas

> Uma linha por entrada, em ordem cronológica, cada uma dizendo o que aquele arquivo conta. Entrada não linkada aqui é órfã e reprova a validação.

- [[<id>-<slug>.01-<slug-da-entrada>]] — <o que foi feito, uma linha>.
- [[<id>-<slug>.02-<slug-da-entrada>]] — <o que foi feito, uma linha>.

## Links

> Cada link leva um gatilho: quando vale segui-lo. Evidência de mudança pertence às entradas; aqui ficam os ponteiros da task inteira.

- **Origem:** [[pop/roadmap/<n>-<slug>|Phase <n>.<m>]] — *siga para o contexto que pediu a task*.
- **PR/commit:** <link ou hash> — *siga para inspecionar o diff final*.
