# <Nome do projeto> — instruções para agentes

> Blockquotes deste template são instruções de preenchimento — **apague-os ao preencher** (exceto este abaixo, que permanece no projeto).

> Projeto gerido pelo workflow do **ProjectOfProjects (PoP)**. `CLAUDE.md` é um symlink deste arquivo — edite sempre este.

- **Type:** default | included | multi-repo | full-multi-repo — ver [[TYPES|TYPES]].
- **Idioma do projeto:** <pt-BR> — specs, notes, pesquisas, comentários de código e todo o fluxo do kanban seguem este idioma.
- **Idiomas suportados (i18n):** <lista de idiomas que a aplicação deve suportar — tratados no roadmap e nas specs. Só para aplicações; remova se não se aplica.>
- **Ficha:** [[pop/PROJECT|PROJECT]] · **Roadmap:** [[pop/ROADMAP|ROADMAP]] · **Modifications:** [[pop/MODIFICATIONS|MODIFICATIONS]] (criado sob demanda)

## O que NÃO entra neste arquivo

> Instrução de preenchimento — **mantenha esta seção no projeto**: ela é o que impede o arquivo de inchar.

Fonte única: o que está no vault não se copia para cá, porque duplicata é drift garantido — muda o fluxo, e a cópia fica mentindo. **Nunca** escreva aqui:

- narração dos estágios do kanban (nomes, ordem, o que cada um faz) — só [[WORKFLOW|WORKFLOW]];
- protocolo de contexto e qualquer heurística de leitura/busca — [[WORKFLOW|WORKFLOW]] e as skills;
- regras gerais do vault (kanban obrigatório, memory/roadmap enxuto, soberania do comando humano) — "Regras transversais" do [[WORKFLOW|WORKFLOW]], que o instalador entrega junto do harness;
- qualquer trecho copiável de [[WORKFLOW|WORKFLOW]] ou [[TYPES|TYPES]] — linke com gatilho em vez de reproduzir.

Aqui entra só o que é **deste projeto**: type, idioma, repos e branch de PR, skills e comandos de verificação, DOX. **Teto: ~60 linhas** — a única exceção é a seção DOX das aplicações.

## Repositórios

| Repo | URL | Clone em | Branch de PR |
|------|-----|----------|--------------|
| <nome> | <url> | `<nome>/` na raiz do projeto (default/multi-repo/full-multi-repo) \| a raiz do projeto **é** o repo (included) | <main> |

_Sem repositório externo: o trabalho vive no repositório do PoP e os PRs de task apontam para a branch principal dele._

> **`full-multi-repo`:** cada repo embutido tem o **próprio AGENTS.md** (type `included`) com uma seção **"Parte de"** linkando este projeto-mãe, o ROADMAP geral e o kanban cross-repo. Specs e memory vivem só nos repos — ver [[TYPES|TYPES]].

## Workflow

Toda alteração no projeto passa pelo kanban em `pop/kanban/`, com tasks vindas do roadmap (`<n>.<m>.<t>-<slug>`) ou das modifications (`M-<n>.<t>-<slug>`).

- Pedido de alteração sem card aciona `new-task` → `advance-task`; “iniciar o fluxo em yolo” materializa/libera a task e percorre a rota yolo inteira, nunca execução direta.
- **Entrega:** o PR da task aponta para a **branch de PR declarada** na tabela de repositórios acima; o merge é sempre do humano.
- **Estágios, gates, rota yolo e protocolo de contexto:** [[WORKFLOW|WORKFLOW]] é a fonte única — leia antes de criar, avançar, verificar ou fechar qualquer task deste projeto, e não replique nada dele aqui.

## Skills

- **Workflow do PoP:** `.agents/skills/` — `new-task`, `advance-task`, `plan-roadmap`, `write-spec`, `sync-specs`.
- **Do domínio do projeto:** `pop/skills/` — listadas na ficha [[pop/PROJECT|PROJECT]].

### Clean code (só projetos de código)

> **Remova esta seção se o projeto não é de código.**

- `clean-code-change` (`.agents/skills/`) — siga ao **planejar (002) e executar (004)** qualquer task que crie ou altere código.
- `clean-code-review` (`.agents/skills/`) — siga ao **verificar (005)** task de código e como critério de leitura em gate de plano ou PR.
- **Obrigatório:** em 002, toda task que cria/altera código entra com `clean-code-change` na linha **004** e `clean-code-review` na linha **005** da tabela **Skills por etapa** do card.

#### Verificação do projeto

> Comandos exatos que as skills de clean code rodam — mantenha fiéis ao ferramental real do projeto.

| Verificação | Comando |
|-------------|---------|
| Formatter | `<comando>` |
| Linter | `<comando>` |
| Testes | `<comando>` |

## Processo DOX (só aplicações)

> Projetos de **aplicação** colam aqui a seção completa de [[_templates/DOX|_templates/DOX.md]] — árvore de AGENTS.md no código como contratos hierárquicos. Este AGENTS.md pode exceder o teto de ~60 linhas para comportá-la — e só por causa dela. **Remova esta seção nos demais tipos de projeto.**

## Regras essenciais

- Conteúdo no idioma declarado acima; wikilinks para referências internas; arquivos ≤~150 linhas; datas AAAA-MM-DD.
- **Nunca** marcar `- [ ] Feito` nem executar itens `(user)` — são exclusivos do humano.
- **Nunca** fazer merge de PR de task — o merge é do humano (ou comandado por ele na rodada de merge).
- **Regras gerais do vault** — kanban obrigatório para tocar o projeto, memory + roadmap enxuto no fechamento, soberania do comando humano sem waiver implícito: seção "Regras transversais" do [[WORKFLOW|WORKFLOW]], que acompanha o harness instalado. *Leia antes de agir fora de uma task ou de interpretar um pedido como dispensa do fluxo.*
