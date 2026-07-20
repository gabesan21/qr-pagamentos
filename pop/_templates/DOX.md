# Processo DOX — contexto hierárquico de agentes no código

> Padrão do PoP para projetos de **aplicação** (programação). Modelo **autocontido**, inspirado no framework aberto DOX (agent0ai/dox, MIT) — o PoP não depende do repositório original. Copie esta seção inteira para o AGENTS.md do projeto de aplicação (ele pode exceder as ~150 linhas para comportá-la); os contratos-filhos vivem junto do código.

## O que é

Uma árvore de arquivos `AGENTS.md` dentro do código: o da raiz do código é o **trilho DOX** — regras do projeto inteiro + índice de alto nível; cada diretório relevante tem o seu, com regras locais e índice do próprio subtree. Cada `AGENTS.md` é um **contrato de trabalho vinculante para o seu subtree**: nenhuma edição às cegas, nenhuma documentação defasada.

## Regras

1. **Antes de editar:** leia o AGENTS.md raiz do código, identifique **todos** os caminhos afetados e **caminhe a árvore** até cada local de edição, lendo todo AGENTS.md aplicável no caminho. A caminhada pode ser delegada a um subagente que devolve **só as regras aplicáveis** aos caminhos da task — o executor recebe o extrato, não a árvore.
2. **Entendimento local:** qualquer ponto do código deve ser compreensível lendo apenas o AGENTS.md mais próximo + todos os pais acima dele. Se não for, falta contrato — crie/complete o local antes de editar.
3. **Conflitos:** o documento mais próximo manda nos detalhes locais; um filho **nunca enfraquece** diretiva do pai.
4. **Concisão operacional:** regras amplas nos níveis altos, detalhe concreto nos filhos. Só o que muda decisões de edição — nada de prosa. **Polaridade:** prefira constraints negativas ("nunca X neste subtree") e condicionais ("se Y, então Z"); evite diretriz positiva genérica ("siga o estilo") — guardrails rendem +13,8pp de acerto, guidance genérica −6,4pp. Teto: **~60 linhas** por contrato de subtree; estourou, o detalhe desce para um filho. Exceção: diretório de árvore grande (muitas subpastas) pode exceder para comportar o índice do subtree — a exceção cobre o índice, não prosa.
5. **Revisão obrigatória:** toda mudança relevante exige revisar os AGENTS.md afetados — atualize quando mudarem propósito, escopo, responsabilidade, estrutura, fluxos, entradas, saídas ou padrões de qualidade.
6. **Fechamento (closeout):** ao concluir o trabalho, re-cheque os caminhos alterados, atualize o documento dono e os pais afetados, refresque os índices, remova conteúdo obsoleto e rode as verificações pertinentes.
7. **Contratos relacionados:** seção opcional em cada contrato com links relativos markdown (`../services/payments/AGENTS.md`) para contratos de outros subtrees dos quais decisões locais dependem — cada link com **gatilho** de 1 linha (*quando segui-lo*). Máx. **~3 laterais (ideal 0-2)** e **<7 referências totais** por contrato (laterais + skills + índice de filhos); só dependência que muda decisão de edição (não todo import); link sem gatilho não vale. Precisou de mais? Sinal de acoplamento ou de roteamento que pertence ao índice do pai. A caminhada vira: vertical até o local de edição + laterais cujo gatilho casa com a task. O closeout (regra 6) atualiza também os laterais dos contratos tocados. **Elo contrato→spec:** quando o harness do PoP mora no mesmo repositório (`included` ou repo de `full-multi-repo`), o contrato pode linkar a **spec do tema** por caminho relativo markdown (`pop/specs/<spec>.md`), com gatilho e contando no teto de referências; no type `default` a ponte contrato↔spec é o card/plano da task — o vault não resolve de dentro do repo (a direção spec→contrato existe sempre, no template de spec).
8. **Skills do subtree:** o contrato pode linkar skills do projeto (`pop/skills/`) **específicas daquela pasta** — procedimento que muda como se edita o subtree (ex.: `migrations/` linka a skill de migration com gatilho "siga antes de criar/alterar qualquer migration"). Sempre link com gatilho, nunca cópia do conteúdo (cópia = drift). Skill de **workflow** (advance-task etc.) nunca entra em contrato — dona dela é a tabela "Skills por etapa" do card: o card responde "como trabalho esta task"; o contrato responde "o que vale ao editar esta pasta, seja qual for a task". Os links de skill contam no teto de referências da regra 7.
9. **Citações verificáveis:** contrato que cita arquivo ou trecho concreto do código pode fixar a citação com a anotação `<!-- pop-hash: <caminho-relativo> sha256=<hash do arquivo citado> -->` (comentário HTML, invisível; caminho relativo à pasta do contrato; hash via `sha256sum <arquivo>`). O `pop_validate` recomputa **fail-closed** — arquivo citado sumiu ou mudou → violação — onde o vault alcança o arquivo (repos embutidos de `full-multi-repo` e clones presentes na raiz da pasta do projeto). Ao revisar a citação, atualize o hash: a mensagem de violação imprime o novo.

## Inicialização

Código sem árvore DOX → varredura recursiva e construção da árvore: AGENTS.md raiz com o índice geral e contratos-filhos **só onde há gatilho objetivo** — não crie AGENTS.md vazio "por via das dúvidas". Em projeto importado (`import-project`), a inicialização é task da Epoch 1 (Organização).

- **Gatilhos de contrato-filho:** ≥2 convenções não óbvias; erro prévio de edição às cegas; stack diferente do resto do repo; ownership diferente (outro time/dono); regras de segurança/permissão distintas; código legado.
- **Árvore nasce enxuta:** contratos iniciais de **20–30 linhas**, crescendo até o teto de ~60 conforme necessidade real; raiz passou de ~150 linhas → desça detalhe para um filho. Escala de referência: **5–15 contratos** bastam para a maioria dos repos.
- **Curadoria humana obrigatória:** a árvore inicial passa pelo gate 003 da task que a cria — contrato LLM-gerado sem curadoria **piora** o resultado (−3% de sucesso, +23% de custo).

## No fluxo do PoP

- **002 (brief):** o planejador identifica os contratos aplicáveis às áreas prováveis e os linka; caminhada ampla só ocorre se uma decisão depender dela.
- **004:** cada frente caminha a árvore até seu local antes da primeira edição. Um extrato pode ser reutilizado se base/hash não mudou; contratos alterados entram na mesma entrega.
- **005:** o revisor confere se mudanças de propósito, estrutura, fluxos ou regras atualizaram os contratos; alteração sem impacto documental não exige reescrita.
- **Type `default` com repo externo que deve ficar limpo de arquivos de IA:** decida com o usuário na entrevista — commitar a árvore DOX no repo (padrão do PoP) ou manter apenas o contrato raiz no AGENTS.md do projeto, dentro do PoP.
