# Aprovação — [[<id>-<slug>]]

> Blockquotes deste template são instruções de preenchimento — **apague-os ao preencher**.

- **Etapa:** 003_human_approval · **Responsável:** user

> Uma rodada por ida a `003_human_approval`. O agente só age quando `- [x] Feito` — ver [[WORKFLOW|WORKFLOW]]. Rodadas antigas nunca são apagadas.
> **Task yolo:** a rodada usa `### Resposta do crítico (yolo)` no lugar de "Resposta do humano" — mesmo `- [ ] Feito`, assinatura `aprovado por agente crítico (yolo) — AAAA-MM-DD` ([[.agents/skills/yolo-critic/SKILL|yolo-critic]]). Nunca reuse a subseção humana: quem assinou cada rodada precisa ficar auditável. Teto de **2 devoluções** do crítico; a 3ª ida a 003 vira `blocked: true`. Se o humano intervir, escreve na própria subseção "Resposta do humano" — ela prevalece e zera o teto.

## Rodada 1 — AAAA-MM-DD

### Resumo do plano

3–5 linhas: o que será feito, critérios de aceite principais, riscos. Plano completo: [[<id>-<slug>.plan]].

### Resposta do humano

_(escreva aqui: aprovado, ou o que mudar)_

- [ ] Feito

### Decisão do agente

_(preenchido após o Feito: "aprovado → 004" ou "mudanças pedidas → 002: <resumo do pedido>")_

## Merge — 006 — AAAA-MM-DD

> Rodada final, criada quando a task chega a `006_done` com PR aberto. O merge é **sempre do humano** — direto no repositório, ou comandado aqui para o agente executar. **Task yolo:** sem PR — o crítico integra `task/<id>` em `develop` por merge local e assina aqui (subseção `### Resposta do crítico (yolo)`); a entrega final do escopo chega ao humano via open_question, onde ele decide se abre o PR `develop` → branch de PR — ver [[WORKFLOW|WORKFLOW]].

- **PR:** <link> — branch `task/<id>-<slug>` → `<branch de PR do AGENTS.md do projeto>`
- _Sem repositório git: esta rodada é a aprovação final da entrega, sem PR._

### Resposta do humano

_(mergeie você mesmo, ou escreva "pode mergear" + instruções)_

- [ ] Feito

### Decisão do agente

_(após o merge: commit final, `pop/memory/<id>.md` gerado, worktree removida, task encerrada)_
