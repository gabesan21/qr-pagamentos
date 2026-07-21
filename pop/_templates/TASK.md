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
yolo_003_returns: 0
yolo_005_returns: 0
circuit_breaker: false
created: AAAA-MM-DD
updated: AAAA-MM-DD
---

# <id>-<slug> — <título curto>

> Blockquotes deste template são instruções de preenchimento — **apague-os ao preencher**. Caminhos de harness levam o prefixo `pop/`; no meta-projeto da raiz do vault, não.

- **Phase:** [[pop/roadmap/<n>-<slug-da-epoch>|Phase <n>.<m>]]
- **Plano:** [[<id>-<slug>.plan]] · **Aprovação:** [[<id>-<slug>.approval]] · **Verificação:** [[<id>-<slug>.verify]]

## O quê

Uma ou duas frases sobre a entrega observável, sem antecipar a implementação.

## Por quê

Uma frase: por que agora e o que destrava.

## Liberação (user)

> Só o humano marca, salvo comando explícito registrado no Log. Sem `[x]`, a task não sai de 001. Em `yolo: true`, a liberação antecipada do roadmap permite ao agente marcar e registrar `liberada por yolo`; ver [[WORKFLOW|WORKFLOW]].

- [ ] Pronto para planejar

## Skills por etapa

> 002 é preenchida na criação; 004/005, pelo planejador. Liste apenas skills que mudem como o responsável deve trabalhar.

| Etapa | Skills do projeto | Responsável |
|-------|-------------------|-------------|
| 002_planning | [[pop/skills/<skill>\|<skill>]] | agent |
| 004_processing | [[pop/skills/<skill>\|<skill>]] | agent |
| 005_verifying | [[pop/skills/<skill>\|<skill>]] | agent |

## Dependências

> Espelha `depends_on:`. Dependência ausente bloqueia a execução; não autoriza o agente a implementá-la. Vazio = a task não tem pré-requisito no kanban.

- [[<id-de-task-pré-requisito>]] — entrega necessária para iniciar esta task.

## Links

> Cada link leva um gatilho: quando vale segui-lo.

- **Spec:** [[pop/specs/<spec>|<spec>]] — *siga para conhecer <contrato/invariante>*.
- **Task relacionada:** [[<id-de-outra-task>]] — *siga se <condição>*.

## Log

- AAAA-MM-DD — criada em 001_initial_task — <motivo/origem>.

## Telemetria mínima

> Uma linha por estágio concluído/retornado. Registre custo observável, nunca reasoning, prompts ou tentativas.

| Estágio | Contextos | Devoluções | Testes/estratégia | Resultado |
|---------|-----------|------------|-------------------|-----------|
| 002 | planejador: 1 | 0 | n/a | plano criado |
