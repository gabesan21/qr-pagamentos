# INBOX

Tudo que espera uma decisão sua. Listas geradas **automaticamente** pelo plugin [Dataview](https://blacksmithgu.github.io/obsidian-dataview/) a partir do frontmatter dos cards — não edite à mão. Fluxo: [[WORKFLOW|WORKFLOW]].

## Aguardando sua liberação (001)

Cards recém-criados são seus para editar — a task só vai ao planejamento quando você marcar `- [x] Pronto para planejar` no card (seção Liberação).

```dataview
TABLE WITHOUT ID file.link AS Task, project AS Projeto, updated AS "Desde"
WHERE stage = "001_initial_task" AND yolo != true
SORT updated ASC
```

## Aguardando aprovação de plano (003)

```dataview
TABLE WITHOUT ID file.link AS Task, project AS Projeto, updated AS "Desde"
WHERE stage = "003_human_approval" AND yolo != true
SORT updated ASC
```

## Aguardando aprovação de verificação (005, tasks críticas)

```dataview
TABLE WITHOUT ID file.link AS Task, project AS Projeto, updated AS "Desde"
WHERE stage = "005_verifying" AND critical = true AND yolo != true
SORT updated ASC
```

## Aguardando merge (006)

```dataview
TABLE WITHOUT ID file.link AS Task, project AS Projeto, pr AS PR
WHERE awaiting_merge = true AND yolo != true
SORT updated ASC
```

## Bloqueadas

```dataview
TABLE WITHOUT ID file.link AS Task, project AS Projeto, blocked_reason AS Motivo
WHERE blocked = true
SORT updated ASC
```

## Questões abertas

Perguntas do agente que não pertencem a nenhum card — decisões de projeto novo, estrutura do vault etc. (pasta `open_questions/`).

```dataview
TABLE WITHOUT ID file.link AS Questão, origem AS Origem, created AS "Desde"
FROM "open_questions"
WHERE status = "aberta"
SORT created ASC
```

## Yolo em andamento

Informativo (não pede decisão): tasks com gates delegados ao agente crítico — ver seção Yolo mode do [[WORKFLOW|WORKFLOW]]. Travamentos aparecem em **Bloqueadas**; a entrega do escopo chega como questão aberta (você testa `develop` e decide se abre o PR).

```dataview
TABLE WITHOUT ID file.link AS Task, project AS Projeto, stage AS Estágio, updated AS "Desde"
WHERE yolo = true AND stage != "006_done"
SORT updated ASC
```

## Em execução agora

Informativo (não pede decisão): tasks com claim de agente ativo — ver regra de claim no [[WORKFLOW|WORKFLOW]].

```dataview
TABLE WITHOUT ID file.link AS Task, project AS Projeto, claimed_by AS Agente, claimed_at AS Desde
WHERE claimed_by
SORT claimed_at ASC
```

## Revisões

Relatórios da skill `weekly-review` são linkados aqui, mais recente primeiro.

- [[notes/weekly-review-2026-07-21|Weekly review — 2026-07-21]]

---

Agentes: nada a manter aqui além da seção **Revisões** — as listas acima derivam do frontmatter (`stage`, `critical`, `yolo`, `blocked`, `awaiting_merge` dos cards; `status` das questões abertas) e do checkbox de liberação nos cards de 001. Para localizar gates sem Obsidian, rode `python3 pop/scripts/pop_status.py` (grep em `stage:`/`awaiting_merge:` serve de fallback).
