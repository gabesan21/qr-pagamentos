# Epoch <n> — <nome da epoch>

> Blockquotes deste template são instruções de preenchimento — **apague-os ao preencher**.

- **Projeto:** [[categories/<categoria>/<projeto>/PROJECT|<Nome do projeto>]] · **Roadmap:** [[categories/<categoria>/<projeto>/ROADMAP|Roadmap]]
- **Status:** pendente | em andamento | concluída
- **Descrição:** uma linha — o que este capítulo entrega.
- **Yolo:** sim | não — bullet **opcional** (ausente = não); só o humano marca.
- **Abandonar/pausar se:** condição objetiva, se houver (auditada pela `weekly-review`).

> Uma phase por seção; sob cada phase, suas tasks — **sempre descrições de uma linha**. Detalhe vai para a spec ou para a pasta da task no kanban. Task iniciada ganha link `[[<id>]]` para o card (ver [[WORKFLOW|WORKFLOW]]).
> **Yolo herda:** epoch yolo → phases e tasks herdam; phase yolo → tasks herdam. Opt-out/opt-in por task: anexe ` · yolo: não` (ou ` · yolo: sim`) ao fim da célula Descrição — sem coluna nova. O `new-task` resolve a herança e estampa o card (seção Yolo do [[WORKFLOW|WORKFLOW]]).

## Recon e forks

> Pesquisas em `researches/` que embasaram o detalhamento; o que ficou sem resposta é RECON NEEDED, com o check que resolve. Forks: mudanças de rota pré-identificadas.

- [[categories/<categoria>/<projeto>/researches/<assunto>/<nota>|<assunto>]] — o que estabeleceu, em uma linha.
- [ ] RECON NEEDED: <suposição> — check: <pesquisa/experimento/task que resolve>.
- Fork: se <observação/conclusão X> → <o que muda na epoch, em uma linha>.

## Phase <n>.1 — <nome da phase>

- **Status:** pendente | em andamento | concluída
- **Descrição:** uma linha.
- **Yolo:** sim | não — bullet **opcional** (ausente = herda da epoch).
- **Specs:** [[categories/<categoria>/<projeto>/specs/<spec>|<spec>]]

| Task | Descrição (≤1 linha) | Status |
|------|----------------------|--------|
| `<n>.1.1-<slug>` | O que entrega. | não iniciada |
| [[<n>.1.2-<slug>]] | O que entrega (linkada: já existe no kanban). | 002_planning |

## Phase <n>.2 — <nome da phase>

- **Status:** pendente
- **Descrição:** uma linha.

| Task | Descrição (≤1 linha) | Status |
|------|----------------------|--------|
| `<n>.2.1-<slug>` | ... | não iniciada |
