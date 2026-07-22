# Aprovação — [[<id>-<slug>]]

> Blockquotes deste template são instruções de preenchimento — **apague-os ao preencher**.

- **Etapa:** 003_human_approval · **Responsável:** user | revisor independente em yolo `critical`

> Uma rodada por ida a 003. Em yolo, este arquivo só recebe rodada de 003 quando `critical: true` — crítico **strong** assina, devoluções 1–2 retornam automaticamente a 002 e a 3ª falha ativa `circuit_breaker`; as demais tasks yolo transitam 002 → 004 sem rodada. Rodadas nunca são apagadas.

## Rodada 1 — AAAA-MM-DD

### Brief para decisão

- **Entrega:** <uma linha>.
- **Estratégia:** <uma ou duas linhas>.
- **Topologia:** <executor único ou frentes/ondas>.
- **Risco principal:** <risco material ou nenhum>.
- **Critérios principais:** <IDs ou resumo curto>.
- **Plano:** [[<id>-<slug>.plan]] — *siga para revisar o brief completo*.

### Resposta do humano

_(escreva aqui: aprovado, ou o que mudar)_

- [ ] Feito

### Decisão do agente

_(após o Feito: `aprovado → 004` ou `mudanças pedidas → 002: <resumo>`)_

### Resposta do crítico (yolo)

- **Contexto:** strong independente.
- **Devolução:** 0 | 1 | 2 de 2.
- **Decisão:** aprovado → 004 | devolvido → 002 | circuit breaker.
- **Motivo/evidência:** <objetivo, sem reasoning>.

## Merge — 006 — AAAA-MM-DD

> Rodada criada quando o fluxo aplicável exigir merge humano. Em yolo, siga a política de integração de [[WORKFLOW|WORKFLOW]]; não invente um segundo gate de qualidade aqui.

- **PR:** <link> — `task/<id>-<slug>` → `<branch de PR>`.
- _Sem repositório git: registre a aprovação final aplicável._

### Resposta do humano

_(mergeie, ou autorize explicitamente o agente)_

- [ ] Feito

### Decisão do agente

_(commit final, memory gerada, worktree removida e task encerrada)_
