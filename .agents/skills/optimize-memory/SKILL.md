---
name: optimize-memory
description: Compacta memories do PoP sem perder identidade, prova, cronologia ou decisões críticas. Use quando o humano pedir otimização/compactação de memory, quando uma memory ultrapassar 2000 caracteres ou na frente de saúde de memories da weekly-review.
---

# optimize-memory

Enxugar cada ledger sem transformar `memory/` em changelog nem apagar a prova da task. A unidade é sempre **um arquivo por task**; nunca fundir, excluir ou renomear memories.

## Entrada e preflight

1. Receber o escopo exato: projeto, conjunto de arquivos ou achados da `weekly-review`.
2. Ler a spec vigente, decisões e memories somente quando linkadas pelo arquivo ou necessárias para distinguir decisão crítica de narrativa secundária.
3. Antes de editar, registrar para cada arquivo: caminho, `task`, `project`, `started`, `finished`, `commit`, `pr`, sequência dos fatos e decisões duráveis.
4. Campo obrigatório ausente ou cronologia ambígua → **BLOCKED**; não inferir nem compactar o arquivo.

## O que preservar literalmente ou sem perda semântica

- Um arquivo por task, no mesmo caminho, e todo o frontmatter.
- ID/slug da task, projeto, datas inicial/final, commit e PR (inclusive valor vazio explícito).
- Ordem dos acontecimentos relevantes: início, entrega, verificação, integração/PR e término.
- Resultado entregue, verificação final, desvios que alteraram o contrato e decisões críticas com sua justificativa.
- Links com gatilho para specs, decisions, learnings, PR e commit ainda válidos.

Decisão crítica é a que limita comportamento futuro, registra escolha humana, segurança, compatibilidade, ownership, migração, irreversibilidade ou desvio aprovado. Na dúvida, preservar.

## O que compactar

- Repetições do plano, listas de passos de edição e narrativa de tentativa/erro.
- Relações extensas de arquivos quando uma área/subtree e uma frase bastam.
- Evidências duplicadas quando o comando final e o resultado preservam a prova.
- Contexto já expresso por spec/decision linkada, mantendo uma frase e o gatilho.

Preferir fatos curtos em ordem cronológica. Não adicionar história nova, reinterpretar decisões ou substituir ponteiros por resumo.

## Procedimento seguro

1. Produzir a versão compacta mantendo o frontmatter e a estrutura mínima do [[_templates/MEMORY|template de memory]].
2. Comparar original e candidato com o inventário do preflight; qualquer perda irredutível reprova o candidato.
3. Confirmar `≤2000` caracteres e datas em `AAAA-MM-DD`.
4. Validar wikilinks e executar `python3 pop/scripts/pop_validate.py` no vault/projeto aplicável.
5. Revisar o diff arquivo a arquivo. Se a prova de preservação falhar, restaurar o original e reportar **BLOCKED**.

## Saída

Relatar arquivos compactados, contagem de caracteres antes/depois, campos/decisões preservados e validações. Se não houver ganho material sem perda, manter a memory intacta e registrar “sem compactação segura”.

## Limites

- Não editar specs, decisões, roadmaps, cards, código ou Git durante esta operação.
- Não consolidar memories por epoch/phase, não eliminar eventos e não alterar commits/PRs.
- Na `weekly-review`, a frente apenas aponta candidatas e riscos; edição exige escopo autorizado pelo humano.
