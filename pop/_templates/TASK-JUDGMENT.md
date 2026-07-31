# Julgamento — [[<id>-<slug>]]

> Blockquotes deste template são instruções de preenchimento — **apague-os ao preencher**.

- **Etapa:** 005_closing (ato 1) · **Responsável:** juiz

> **Artefato do gate adversarial.** Nasce só quando a task é `yolo: true` **e** (`size: L` **ou** `critical: true`), depois da [[<id>-<slug>.r<n>.accusation|acusação da mesma rodada]] e em contexto fresco e separado dela; nessa configuração não existe `.verify.md`.
> **Um arquivo por rodada:** salve como `<id>.r<n>.judgment.md`, com o mesmo `n` da acusação que julga, começando em `r1`. Rodada nova nunca sobrescreve a anterior; rodadas nunca são apagadas, e a de maior `n` é a que decide.
> **Teto: 40 linhas por rodada** (validado por `pop_validate`). Julgue o que foi acusado; não refaça a revisão inteira.
> **Você nomeia o delta, não conserta o defeito** — nem aplique a correção, nem a despache a ninguém: gate que encomenda o próprio conserto deixa de ser gate. A correção é do executor relançado pelo orquestrador.
> Responda **primeiro** se o pedido original — o "O quê / Por quê" do card — foi atendido; só depois julgue as acusações. Aderência ao plano que não atende ao pedido nunca é falha do executor.

## Pedido original

- **Atendido:** sim | não — <uma linha comparando o que o card pediu com o que foi entregue>.

## Julgamento item a item

| # | Objeção (eixo) | Julgamento | Motivo |
|---|----------------|------------|--------|
| 1 | <objeção da acusação> (execução \| decisão) | procedente \| improcedente | <uma linha> |

> Acusação que declarou **"nenhuma objeção material"** é acusação bem formada: julgue esse registro como qualquer outro — concordando, ou apontando com evidência o que ele deixou passar.
> **Acusação inválida não se julga e não vira arquivo.** Item sem severidade, evidência ou remédio — ou acusação acima de 50 linhas — interrompe o julgamento: **não escreva este arquivo**; reporte ao orquestrador, que relança o advogado na mesma rodada. Não é rota, não consome contador de devolução e é registrada no Log do card. Segunda acusação inválida seguida → `blocked: true`.

## Veredito

- **Decisão:** aprovada → ato 2 | bloqueante de execução → 004_processing | defeito de plano → 002_planning | circuit breaker.
- **Procedentes bloqueantes:** nenhum | <lista curta>.
- **Sugestões/nits acolhidos:** <não bloqueiam; registrar só se úteis>.
- **Devoluções:** execução 0 | 1 | 2 de 2 · plano 0 | 1 | 2 de 2 — 3ª da mesma rota ativa circuit breaker.

## Delta da devolução

> **Obrigatório em todo veredito que não seja aprovação** — apague a seção só quando aprovar. Preencha-a **na forma** da seção "Delta da devolução" de [[_templates/TASK-VERIFY|TASK-VERIFY]], que é a fonte dos tipos e dos campos: siga aquele template em vez de reproduzi-lo aqui, para que mudança lá valha automaticamente aqui. O orquestrador transporta o tipo com `pop_move --return-kind <tipo>`.

_(preencha conforme [[_templates/TASK-VERIFY|TASK-VERIFY]] › "Delta da devolução")_

> Aprovando, escreva a memory na mesma sessão — você acabou de ler o diff e a acusação: o ledger `memory/<AAAA-MM-DD>/<id>.md` mais uma entrada `<id>.<nn>-<slug>.md` por coisa feita, com evidência linkada ([[_templates/MEMORY|MEMORY]] · [[_templates/MEMORY-ENTRY|MEMORY-ENTRY]]). Integração, PR e merge continuam do orquestrador e do humano.
