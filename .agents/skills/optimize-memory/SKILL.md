---
name: optimize-memory
description: Converte memory legada para o layout granular (pasta de data + ledger + entradas com evidência) e enxuga arquivo que passe do teto, sem perder identidade, prova, cronologia ou decisões críticas. Use quando o humano pedir otimização/compactação de memory, quando um ledger passar de 1200 ou uma entrada de 800 caracteres, quando existir memory fora de pasta de data, ou na frente de saúde de memories da weekly-review.
---

# optimize-memory

Deixar `memory/` granular e verificável sem virar changelog nem apagar a prova da task. A unidade é sempre **um ledger por task**; nunca fundir, excluir ou renomear uma task.

## O layout alvo

```
memory/AAAA-MM-DD/<id>.md              ← ledger: prova + índice, ≤1200 caracteres
memory/AAAA-MM-DD/<id>.<nn>-<slug>.md  ← entrada: uma coisa feita, ≤800 caracteres
```

A pasta é a data de conclusão e **tem de ser igual a `finished`** do ledger. O ledger carrega o frontmatter íntegro, entrega, verificação, impacto em contratos, `## Entradas` (uma linha por entrada, em ordem cronológica) e `## Links`. Cada entrada tem `task` + `entry` no frontmatter, o que foi feito em duas a quatro frases e **ao menos um wikilink de evidência** — a spec alterada ou o arquivo tocado. Forma exata: [[_templates/MEMORY|MEMORY]] e [[_templates/MEMORY-ENTRY|MEMORY-ENTRY]].

## Entrada e preflight

1. Receber o escopo exato: projeto, conjunto de arquivos ou achados da `weekly-review`.
2. Classificar cada arquivo em um dos dois modos: **converter** (memory plana em `memory/<id>.md`, ou ledger que concentra o que deveriam ser entradas) e **enxugar** (ledger ou entrada acima do teto, já no layout).
3. Ler a spec vigente, decisões e memories somente quando linkadas pelo arquivo ou necessárias para distinguir decisão crítica de narrativa secundária.
4. Antes de editar, registrar para cada arquivo: caminho, `task`, `project`, `started`, `finished`, `commit`, `pr`, sequência dos fatos e decisões duráveis.
5. Campo obrigatório ausente ou cronologia ambígua → **BLOCKED**; não inferir nem converter o arquivo.

## O que preservar literalmente ou sem perda semântica

- Um ledger por task, com o mesmo id, e todo o frontmatter.
- ID/slug da task, projeto, datas inicial/final, commit e PR (inclusive valor vazio explícito).
- Ordem dos acontecimentos relevantes: início, entrega, verificação, integração/PR e término.
- Resultado entregue, verificação final, desvios que alteraram o contrato e decisões críticas com sua justificativa.
- Links com gatilho para specs, decisions, learnings, PR e commit ainda válidos.

Decisão crítica é a que limita comportamento futuro, registra escolha humana, segurança, compatibilidade, ownership, migração, irreversibilidade ou desvio aprovado. Na dúvida, preservar.

## Modo converter

1. Mover o arquivo para `memory/<finished>/<id>.md`, usando o `finished` do próprio frontmatter — nunca a data de hoje, nunca inferida.
2. Reduzir o ledger a entrega, verificação, impacto em contratos, `## Entradas` e `## Links`.
3. Transformar em entradas o que saiu: áreas alteradas, telemetria, cada decisão durável, cada desvio. **Uma coisa feita por arquivo**, numerada `01`, `02`… na ordem cronológica dos acontecimentos.
4. Dar a cada entrada a sua evidência. Entrada cuja mudança não tenha spec nem arquivo para apontar quase sempre pertence a outra entrada — funda antes de inventar link.
5. Indexar toda entrada no `## Entradas` do ledger, com uma linha dizendo o que ela conta.

## Modo enxugar

Compactar, dentro do arquivo que passou do teto:

- Repetições do plano, listas de passos de edição e narrativa de tentativa/erro.
- Relações extensas de arquivos quando uma área/subtree e uma frase bastam.
- Evidências duplicadas quando o comando final e o resultado preservam a prova.
- Contexto já expresso por spec/decision linkada, mantendo uma frase e o gatilho.

Entrada que não couber em 800 caracteres depois disso quase sempre são **duas entradas** — dividir é a saída preferida sobre comprimir. Ledger que não couber em 1200 está guardando conteúdo de entrada: mova, não aperte. Preferir fatos curtos em ordem cronológica; não adicionar história nova, reinterpretar decisões ou substituir ponteiros por resumo.

## Procedimento seguro

1. Produzir a versão candidata mantendo o frontmatter e a estrutura dos templates.
2. Comparar original e candidato com o inventário do preflight; qualquer perda irredutível reprova o candidato.
   - **A comparação é determinística, não impressão de leitura.** Extraia do original o conjunto de hashes de commit (inclusive os citados no corpo, não só o do frontmatter) e os valores literais de `pr` e `authorization`; confira que todos aparecem no candidato. Token presente no original e ausente depois é perda, mesmo que o texto pareça equivalente — foi assim que uma conversão perdeu 8 hashes em 2026-07-27.
3. Confirmar tetos (`≤1200` no ledger, `≤800` por entrada), datas em `AAAA-MM-DD` e pasta igual a `finished`.
4. Validar wikilinks — inclusive a evidência de cada entrada — e executar `python3 pop/scripts/pop_validate.py` no escopo corrente.
5. Revisar o diff arquivo a arquivo. Se a prova de preservação falhar, restaurar o original e reportar **BLOCKED**.

## Saída

Relatar arquivos convertidos e enxugados, contagem de caracteres antes/depois, entradas criadas, campos/decisões preservados e validações. Se não houver ganho material sem perda, manter a memory intacta e registrar “sem otimização segura”.

## Limites

- Não editar specs, decisões, roadmaps, cards, código ou Git durante esta operação.
- Não consolidar memories por epoch/phase, não eliminar eventos e não alterar commits/PRs.
- Não converter memory de escopo alheio: memory plana com `finished` anterior a 2026-07-27 é legado tolerado e, fora do escopo corrente, não é trabalho seu.
- Na `weekly-review`, a frente apenas aponta candidatas e riscos; edição exige escopo autorizado pelo humano.
