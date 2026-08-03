---
task: <id>-<slug>
entry: <nn>-<slug-da-entrada>
---

# <título curto: a coisa feita>

> **Entrada de memory.** Mora em `memory/<AAAA-MM-DD>/<id>-<slug>.<nn>-<slug-da-entrada>.md`, na mesma pasta do [[_templates/MEMORY|ledger]] da task, que a indexa em `## Entradas`. Limite: **800 caracteres**. Entrada não linkada pelo ledger é órfã e reprova a validação.
> `<nn>` é sequencial de dois dígitos (`01`, `02`…) na **ordem cronológica dos acontecimentos**, não na ordem de conveniência. Renumerar quebra a linha do tempo.
> Uma entrada = **uma coisa feita**. Áreas alteradas, telemetria, decisão durável e desvio são cada um a sua entrada, não bullets espremidos num arquivo só. Se não couber em 800 caracteres, quase sempre são duas entradas.
> Não refaça a narrativa do plano nem da execução, não invente história e não substitua ponteiro por resumo.

<Duas a quatro frases: o que foi feito e por que dessa forma. Fato, não narrativa de tentativa e erro.>

## Evidência

> **Obrigatória: ao menos um wikilink.** É o que transforma a entrada em prova em vez de afirmação. Aponte a spec que o trabalho alterou ou o arquivo que ele tocou — wikilink para arquivo não-markdown é válido e desejável.

- [[specs/<spec>|<spec>]] — *siga para o contrato que esta mudança alterou*.
- [[pop/scripts/<arquivo>.py]] — *o arquivo onde a mudança está*.
