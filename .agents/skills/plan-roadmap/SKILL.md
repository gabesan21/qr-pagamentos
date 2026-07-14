---
name: plan-roadmap
description: Entrevista guiada para montar ou evoluir o roadmap de um projeto (epochs, phases, tasks candidatas). Use ao criar um projeto novo, quando o usuário quiser planejar/reestruturar o roadmap, ou quando uma epoch conclui.
---

# plan-roadmap

Constrói o roadmap **junto com o usuário**, por entrevista — nunca invente o caminho sozinho. Funciona para qualquer tipo de projeto (programação, escrita, negócio, pesquisa...).

**Delegue a subagentes:** o recon de epoch do passo 4 (paralelos, um por frente); a entrevista e a materialização ficam com o principal.

## Modo de condução

- Pergunte em blocos curtos (2–3 perguntas por vez), reflita o que entendeu antes de avançar.
- **Proponha, não interrogue:** a partir do objetivo, sugira você as epochs e deixe o usuário reagir — reagir a uma proposta é mais fácil que responder pergunta aberta.
- "Não sei" é resposta válida → vira item em "Ideias futuras" ou pergunta aberta numa spec.

## Procedimento

1. **Destino:** pergunte qual é o marco final e qual seria a primeira entrega que já teria valor sozinha.
2. **Brainstorm de epochs:** proponha de 3 a 7 epochs (capítulos do projeto), uma linha cada, na ordem que faz sentido. Peça reação: cortar, juntar, reordenar, renomear.
3. **Corte:** o que não entra agora vai para "Ideias futuras" no ROADMAP.md — melhor lista curta de epochs firmes que lista longa de desejos.
4. **Recon da epoch:** antes de detalhar, levante o que embasa o capítulo **no vault e nos repos do projeto** — subagentes só para frentes acima do piso da regra 18 (0 é válido) — e consolide em `pop/researches/<assunto>/`. O que o recon não resolver vira **RECON NEEDED** no arquivo da epoch, com o check exato que resolve (pesquisa, experimento ou task). Conhecimento novo (decisão técnica, mercado, stack) **não se pesquisa na web no fluxo**: proponha o prompt no **`RESEARCHES.md`** do projeto (`_templates/RESEARCHES.md`) para o **usuário** rodar e ingerir (`ingest-research`) antes do planejamento que depende dele.
5. **Elaboração progressiva:** detalhe em phases **apenas a primeira epoch** (ou a atual). Epochs futuras ficam com uma linha só — serão detalhadas quando chegar a vez delas. Registre no arquivo da epoch os **forks** conhecidos ("se a pesquisa X concluir Y, a phase Z muda assim") e a **condição de abandono/pausa**, se houver (a `weekly-review` audita). Pergunte se alguma epoch/phase roda em **yolo** (seção Yolo mode do [[WORKFLOW|WORKFLOW]]) e registre o bullet `**Yolo:** sim` (ou marcadores por task) — escopo yolo exige tasks de entregável **objetivamente verificável**, o que afeta a granularidade das candidatas.
6. **Tasks candidatas:** para a primeira phase, proponha 2–5 tasks de uma linha, cada uma com o **effort sugerido** ` · size: S|M|L` na célula Descrição (convenção do [[_templates/EPOCH|template]]) — o `new-task` estampa no card e o humano corrige em 001. Não crie as pastas no kanban — isso é a skill `new-task`.
7. **Specs:** anote os temas que surgiram na conversa e merecem especificação; ofereça criar os rascunhos com a skill `write-spec`.
8. **Materialize:** `pop/ROADMAP.md` (só epochs) e `pop/roadmap/<n>-<slug>.md` da epoch detalhada (meta-projeto da raiz do vault e projetos ainda não migrados: harness na raiz, sem `pop/`), pelos templates `_templates/ROADMAP.md` e `_templates/EPOCH.md`. Confirme o resultado com o usuário.

## Cuidados

- Descrições **sempre de uma linha** — detalhe vai para spec.
- O wargame completo (movimentos, contra-jogadas) é do plano de task (002) — no roadmap entram só recon, RECON NEEDED, forks e condição de abandono.
- Aplicações: os **idiomas suportados (i18n)** declarados no AGENTS.md do projeto entram no planejamento — nenhuma epoch/phase de UI ou conteúdo ignora i18n.
- Não detalhe epochs futuras "para adiantar": roadmap é elaborado progressivamente; revisite esta skill a cada epoch concluída.
- IDs seguem a hierarquia (`1`, `1.1`, `1.1.1-<slug>`); links de arquivos fixos com caminho completo + alias.
