# Grupo <g01> — <nome do grupo> — [[<id>-<slug>]]

> Blockquotes deste template são instruções de preenchimento — **apague-os ao preencher**.

- **Ordem:** posição deste grupo na execução (ver [[<id>-<slug>.plan|plano]]).
- **Depende de:** grupos pré-requisito (ex.: `g01`) — vazio = pode rodar em paralelo com os demais grupos.
- **Descrição:** uma linha — o que este grupo entrega junto.

## Movimentos

> Todo item declara o dono: `(agent)` ou `(user)`. Agentes nunca executam item `(user)` — sinalizam e aguardam.
> Item que exige outro item concluído antes anota `(após <ref>)`; sem anotação, itens do grupo podem ser paralelizados.
> Todo movimento `(agent)` carrega **Espero ver** (a observação que confirma que funcionou) e **Se falhar** (falha provável → causa que ela sinaliza → contra-jogada).

- [ ] (agent) Movimento objetivo, executável e verificável.
  - Espero ver: <exatamente o que deve ser observado se funcionou>.
  - Se falhar: <falha provável> → <causa que sinaliza> → <contra-jogada>.
- [ ] (agent) (após anterior) Movimento que precisa do primeiro concluído.
  - Espero ver: <observação>.
  - Se falhar: <falha> → <causa> → <contra-jogada>.
- [ ] (user) Ação que só o humano pode fazer (ex.: criar conta, aprovar compra) — diga o que ele deve devolver.

## Notas de execução

- AAAA-MM-DD — descobertas, desvios do plano, links para o que foi produzido.
