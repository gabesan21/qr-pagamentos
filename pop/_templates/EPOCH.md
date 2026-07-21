# Epoch <n> — <nome da epoch>

> Blockquotes deste template são instruções de preenchimento — **apague-os ao preencher**.

- **Projeto:** [[pop/PROJECT|<Nome do projeto>]] · **Roadmap:** [[pop/ROADMAP|Roadmap]]
- **Status:** pendente | em andamento | concluída (ou **contínua** — reservado à Epoch 0 de manutenção, ver [[AGENTS|AGENTS]]: nunca conclui, a `weekly-review` não a cobra por estagnação)
- **Descrição:** uma linha — o que este capítulo entrega.
- **Yolo:** sim | não — bullet **opcional** (ausente = não); só o humano marca.
- **Abandonar/pausar se:** condição objetiva, se houver (auditada pela `weekly-review`).

> Uma phase por seção; sob cada phase, somente suas tasks ainda abertas — **sempre descrições de uma linha**. Detalhe vai para a spec ou para a pasta da task no kanban. Task iniciada ganha link `[[<id>]]`; ao concluir 006, sai da tabela depois de sua memory válida (ver [[WORKFLOW|WORKFLOW]]).
> **Yolo herda:** epoch yolo → phases e tasks herdam; phase yolo → tasks herdam. Opt-out/opt-in por task: anexe ` · yolo: não` (ou ` · yolo: sim`) ao fim da célula Descrição — sem coluna nova. O `new-task` resolve a herança e estampa o card (seção Yolo do [[WORKFLOW|WORKFLOW]]).
> **Size:** o agente sugere `S|M|L` na Descrição; `new-task` estampa no card e o humano corrige em 001. Size orienta tier/esforço; risco, skills, dependências e write sets determinam a topologia no [[WORKFLOW|WORKFLOW]].

## Recon e forks

> Pesquisas em `pop/researches/` (no meta-projeto da raiz do vault: sem o prefixo `pop/`) que embasaram o detalhamento; o que ficou sem resposta é RECON NEEDED, com o check que resolve. Forks: mudanças de rota pré-identificadas.

- [[pop/researches/<assunto>/<nota>|<assunto>]] — o que estabeleceu, em uma linha.
- [ ] RECON NEEDED: <suposição> — check: <pesquisa/experimento/task que resolve>.
- Fork: se <observação/conclusão X> → <o que muda na epoch, em uma linha>.

## Phase <n>.1 — <nome da phase>

- **Status:** pendente | em andamento | concluída
- **Descrição:** uma linha.
- **Yolo:** sim | não — bullet **opcional** (ausente = herda da epoch).
- **Specs:** [[pop/specs/<spec>|<spec>]]

| Task | Descrição (≤1 linha) | Status |
|------|----------------------|--------|
| `<n>.1.1-<slug>` | O que entrega. · size: M | não iniciada |
| [[<n>.1.2-<slug>]] | O que entrega (linkada: já existe no kanban). | 002_planning |

## Phase <n>.2 — <nome da phase>

- **Status:** pendente
- **Descrição:** uma linha.

| Task | Descrição (≤1 linha) | Status |
|------|----------------------|--------|
| `<n>.2.1-<slug>` | ... | não iniciada |
