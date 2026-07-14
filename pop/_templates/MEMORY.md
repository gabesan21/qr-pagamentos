---
task: <id>-<slug>
project: <categoria>/<projeto>
started: AAAA-MM-DD
finished: AAAA-MM-DD
commit: <hash do commit final (merge)>
pr: <link do PR, se houver>
---

# <id>-<slug> — <título curto>

Resumo da implementação em até **2000 caracteres**: o que mudou e onde, decisões tomadas, desvios do plano e ponteiros (arquivos, specs, PR). Escrito ao finalizar `006_done`, **após o merge** — é o registro durável da task: a pasta `pop/kanban/006_done/` (no meta-projeto da raiz do vault: sem o prefixo `pop/`) pode ser limpa periodicamente, este arquivo fica e serve de prova de conclusão para o gate de dependências (`depends_on`).

Links com gatilho (1 linha cada — *quando segui-lo*):

- **Spec afetada:** [[pop/specs/<spec>|<spec>]] — *siga se <condição>*.
- **Learning gerado:** [[pop/notes/learnings/<nota>|<nota>]] — *siga se <condição>*.
