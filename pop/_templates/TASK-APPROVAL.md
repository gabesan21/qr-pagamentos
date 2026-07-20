# Aprovação — [[<id>-<slug>]]

> Blockquotes deste template são instruções de preenchimento — **apague-os ao preencher**.

- **Etapa:** 003_human_approval · **Responsável:** user | revisor independente em yolo

> Uma rodada por ida a 003. O gate aprova o brief, não reasoning ou detalhes de implementação. Rodadas antigas nunca são apagadas. Em `yolo: true`, substitua a subseção humana por `### Resposta do revisor (yolo)`, preserve o checkbox e use assinatura auditável; teto em [[WORKFLOW|WORKFLOW]].

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

## Merge — 006 — AAAA-MM-DD

> Rodada criada quando o fluxo aplicável exigir merge humano. Em yolo, siga a política de integração de [[WORKFLOW|WORKFLOW]]; não invente um segundo gate de qualidade aqui.

- **PR:** <link> — `task/<id>-<slug>` → `<branch de PR>`.
- _Sem repositório git: registre a aprovação final aplicável._

### Resposta do humano

_(mergeie, ou autorize explicitamente o agente)_

- [ ] Feito

### Decisão do agente

_(commit final, memory gerada, worktree removida e task encerrada)_
