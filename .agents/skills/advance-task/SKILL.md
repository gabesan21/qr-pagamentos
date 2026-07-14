---
name: advance-task
description: Orquestra o avanço de uma task pelo kanban (001→006), delegando o trabalho de cada estágio a um subagente dedicado e encadeando estágios até o próximo gate humano. Use quando o usuário pedir para avançar, planejar, executar, verificar ou concluir uma task.
---

# advance-task

Você é o **orquestrador**: identifica o estágio da task, resolve gates e transições e **avança até o próximo gate humano** — nunca pare em transição agent→agent. A fonte de verdade é o [[WORKFLOW|WORKFLOW]]: leia **apenas a seção do estágio em que a task está + as Regras transversais** — esta skill não reescreve os estágios.

**Delegue a subagentes:** todo o trabalho de 002, 004 e 005 (um subagente dedicado por etapa); o orquestrador executa só 001, 006, gates e transições.

## Entrada

- **id da task** (ex.: `1.1.1-user-table-creation`). Localize a pasta: `find <projeto>/kanban -maxdepth 2 -name "<id>*" -type d`.

## Loop do orquestrador

0. **Claim primeiro:** `scripts/pop_claim.py <task-id>` — recusou (claim ativo de outro agente)? **Não toque na task**, informe e encerre.
1. Leia o card: `stage`, `critical`, `yolo`, `blocked`, `depends_on`, tabela "Skills por etapa". **Task em 001 sem `- [x] Pronto para planejar`?** É gate humano: libere o claim, pare e informe — o card ainda é do humano. Exceções: o humano mandou explicitamente seguir direto nesta conversa → marque o checkbox por ele e registre no Log (`liberada por comando do humano`); `yolo: true` → a marca no roadmap é a liberação — marque com Log `liberada por yolo (marcado no roadmap)`.
2. Enquanto não houver gate humano pendente:
   - Leia no [[WORKFLOW|WORKFLOW]] a seção do estágio atual e execute-a — **001 e 006** você mesmo (são baratos); **002/004/005** via subagente dedicado (abaixo). **Via rápida:** task trivial de pouquíssimos passos (mesma régua da dispensa de red-team) → execute o **004** você mesmo e registre a via rápida no Log; o **005 continua em subagente** (olhos frescos não se dispensam).
   - Transição: `scripts/pop_move.py <task-id> <estágio>` move a pasta, atualiza `stage:`/`updated:` e appenda a linha no Log — atomicamente (sem o script, faça os três à mão).
3. Ao chegar num gate, **libere o claim** (`scripts/pop_claim.py <task-id> --release`), **pare e informe**: estágio atual, o que aguarda o humano e o que a próxima chamada fará.

**Gates humanos (únicas paradas):** liberação em `001` (`- [x] Pronto para planejar`); aprovação em `003`; verificação humana se `critical: true` em `005`; item `(user)` de subtask; `blocked: true`; rodada de merge em `006`.

**Task `yolo: true`** (seção Yolo mode do [[WORKFLOW|WORKFLOW]]): os gates de 001, 003 e merge de task em 006 são resolvidos pelo subagente **crítico** ([[.agents/skills/yolo-critic/SKILL|yolo-critic]]) — as demais paradas continuam humanas. **Loop de escopo:** concluída uma task de escopo yolo, materialize a próxima elegível da phase/epoch (`new-task` sem entrevista, em ordem de `depends_on`, WIP 3) até o escopo terminar — aí abra o fechamento de escopo (PR `develop` → branch de PR + open_question, protocolo na skill do crítico). Marca yolo removida mid-flight vale a partir do próximo gate.

## Subagentes por estágio

Cada subagente recebe **só** a skill da sua etapa (tabela "Skills por etapa" do card) + o contexto mínimo — nunca o vault inteiro:

- **002 — planejador:** recebe card + specs linkadas → devolve o `.plan.md` (dispara a própria onda de recon do wargame, **3-5 por onda**; os workers de recon são folha — reportam "Lacunas / Não encontrado", nunca disparam subagentes).
- **004 — executor:** recebe plano + seção "Contexto mínimo do executor" → trabalha na worktree da task, devolve checkboxes marcados + divergências.
- **005 — verificador:** recebe a tabela de verificação do plano → devolve o `.verify.md` com evidências. **Nunca o mesmo agente que executou** — julga sem o viés de quem fez.
- **003/006 yolo — crítico:** recebe card + `.plan.md` + `.approval.md` (006: + `.verify.md` e PR) → assina a rodada ou devolve com motivos (skill [[.agents/skills/yolo-critic/SKILL|yolo-critic]]; teto de 2 devoluções). Distinto de planejador/executor/verificador.

## Cuidados (desta skill; os do fluxo estão nas Regras transversais)

- **Nunca pule estágios nem gates.** Retornos permitidos: 003→002, 004→002, 005→004 — o orquestrador decide o retorno; o subagente só reporta.
- **Claim ativo de outro agente cobre a pasta inteira da task** (card, `.plan.md`, `.verify.md`, `subtasks/`): leitura ok, escrita proibida — o `pop_move` também recusa a transição.
- Subagente reportou aborto, item `(user)` ou descoberta que muda o plano → pare/retorne conforme o WORKFLOW; **não improvise na janela principal**.
- Ao destravar uma task, limpe `blocked:` e `blocked_reason:`.
- Learning em 006 **atualiza nota existente do mesmo tema** quando houver (não duplique); contradição com nota/decisão anterior vira linha `> Contradiz: [[alvo]] — <por quê>` visível.
