# Spec — <nome do contrato/tema>

> Blockquotes deste template são instruções de preenchimento — **apague-os ao preencher**.

- **Projeto:** [[pop/PROJECT|<Nome do projeto>]]
- **Epoch/Phase:** [[pop/roadmap/<n>-<slug>|Phase <n>.<m>]]
- **Status:** rascunho | aprovada | implementada | obsoleta
- **Criada em:** AAAA-MM-DD
- **Atualizada em:** AAAA-MM-DD

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

> Não registre solução interna, sequência de edição, reasoning ou pseudocódigo. Estratégia de uma mudança pertence ao plano; procedimento reutilizável pertence a uma skill.
