# Defesa do plano — [[<id>-<slug>]]

> Blockquotes deste template são instruções de preenchimento — **apague-os ao preencher**.

- **Etapa:** 002_planning · **Responsável:** agent planejador

> **Artefato do gate adversarial.** Nasce junto com o plano quando a task é `yolo: true` **e** (`size: L` **ou** `critical: true`) — sem ele o advogado do diabo não tem o que atacar e o ato 1 devolve a task a 002. Nenhuma outra configuração produz este arquivo.
> **Teto: 30 linhas** (validado por `pop_validate`). Não couber significa que o plano concentra decisão demais para uma task só — não que a defesa deva comprimir.
> Isto é uma **lista curta de decisões contestáveis**, nunca chain-of-thought, pseudocódigo ou transcrição de raciocínio: registre a decisão e o que a derruba, não o caminho até ela.
> Decisão sem alternativa real e sem falsificador não é decisão, é preenchimento — e vira ruído para quem ataca. Ordene por consequência: a escolha mais cara de reverter vem primeiro.

## Decisões contestáveis

| # | Decisão | Escolha adotada | Alternativa rejeitada | Por quê | O que a falsificaria |
|---|---------|-----------------|------------------------|---------|----------------------|
| 1 | <o ponto em disputa> | <o que o plano faz> | <a opção descartada> | <razão, uma linha> | <observação ou run que provaria a escolha errada> |
