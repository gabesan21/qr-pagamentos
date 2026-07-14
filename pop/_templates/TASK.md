---
id: <n>.<m>.<t>
project: <categoria>/<projeto>
epoch: <n>
phase: "<n>.<m>"
stage: 001_initial_task
critical: false
yolo: false
size: S | M | L
blocked: false
blocked_reason:
depends_on: []
claimed_by:
claimed_at:
worktree:
pr:
awaiting_merge: false
created: AAAA-MM-DD
updated: AAAA-MM-DD
---

# <id>-<slug> — <título curto>

> Blockquotes deste template são instruções de preenchimento — **apague-os ao preencher**. Caminhos de harness levam o prefixo `pop/` — no claim (004), `worktree:` recebe `pop/worktrees/<id>-<slug>` (no meta-projeto da raiz do vault: sem o prefixo `pop/`).

- **Phase:** [[pop/roadmap/<n>-<slug-da-epoch>|Phase <n>.<m>]]
- **Plano:** [[<id>-<slug>.plan]] · **Aprovação:** [[<id>-<slug>.approval]] · **Verificação:** [[<id>-<slug>.verify]]

## O quê

Uma ou duas frases: o que esta task entrega.

## Por quê

Uma frase: por que agora, e o que destrava.

## Liberação (user)

> Só o humano marca (ou o agente, **sob comando explícito** do humano, registrando no Log). Sem `[x]`, a task não sai de 001 — o card é seu para editar; o `pop_move` recusa 001→002. **Exceção yolo:** task `yolo: true` nasce com o checkbox marcado pelo agente — a marca no roadmap é a liberação antecipada (Log: `liberada por yolo (marcado no roadmap)`); ver seção Yolo do [[WORKFLOW|WORKFLOW]].

- [ ] Pronto para planejar

## Skills por etapa

> Linha de 002 preenchida na criação da task (001); linhas de 004/005 preenchidas em 002_planning. Responsáveis por estágio: ver [[WORKFLOW|WORKFLOW]].

| Etapa | Skills do projeto | Responsável |
|-------|-------------------|-------------|
| 002_planning | [[pop/skills/<skill>\|<skill>]] | agent |
| 004_processing | [[pop/skills/<skill>\|<skill>]] | agent |
| 005_verifying | [[pop/skills/<skill>\|<skill>]] | agent |

## Dependências

> Espelha `depends_on:` do frontmatter. A task só entra em `004_processing` quando toda dependência está concluída — `pop/memory/<id>*.md` existente é o sinal padrão (a pasta em `006_done` é apagada ao fechar); card ainda em `006_done` também conta, para a janela curta antes do apagamento. Vazio = pode rodar em paralelo com as demais.

- [[<id-de-task-pré-requisito>]] — o que ela entrega que esta task precisa.

## Links

> Cada link leva 1 linha de gatilho — *quando* vale segui-lo. Link sem gatilho é ignorado com razão.

- **Specs:** [[pop/specs/<spec>|<spec>]] — *siga se <condição>*.
- **Tasks relacionadas:** [[<id-de-outra-task>]] — *siga se <condição>*.

## Log

- AAAA-MM-DD — criada em 001_initial_task — <motivo/origem>
