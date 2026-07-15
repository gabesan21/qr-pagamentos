---
name: ui-change
description: Processo de design e implementação de UI - tone único decisivo, design tokens como contrato lintável, DESIGN.md como memória persistente, estados obrigatórios por componente e inventário anti-drift. Use ao projetar ou implementar UI (telas, componentes, estilos), ao planejar (002) e ao executar (004). Só projetos frontend.
---

# ui-change

**Princípio: UI boa nasce de contrato visual executável, não do gosto do agente.** Agentes são cegos ao render, não têm memória de design e convergem para o médio estatístico (Inter, gradiente roxo, três cards). O antídoto não é "promptar melhor": é arquitetar o contexto — tone decidido, tokens como contrato, `DESIGN.md` persistente. Esta skill acompanha quem **escreve** UI; a verificação usa a irmã `ui-review`.

**Parametrização:** lint, framework, build e ferramentas de screenshot são os declarados na seção **"Verificação do projeto"** do AGENTS.md do projeto. Esta skill descreve o processo — **nunca instala ferramenta**.

## 1. Tone: uma direção estética decisiva

**Gatilho:** projeto ou tela nova sem direção visual declarada no `DESIGN.md`.

1. Escolha **UMA** direção nomeável (editorial, brutalista, industrial, art déco...) — nunca "moderno e limpo".
2. Colete referência visual real e **extraia a linguagem** em regras reutilizáveis (escala tipográfica com saltos de 3x+, ritmo de espaçamento, cor dominante + accent em <10% da área) — não copie pixels.
3. Registre no `DESIGN.md` a direção, a referência e as **fontes banidas** (o padrão genérico a evitar).

**Saída verificável:** seção Tone do `DESIGN.md` com uma única direção nomeada e a referência extraída.

## 2. Design tokens como contrato

**Gatilho:** qualquer valor visual (cor, espaçamento, raio, sombra, tipo) prestes a entrar no código.

1. Todo valor entra por **nome semântico**, nunca cru: `color.feedback.error`, não `#DC2626` — o nome carrega a intenção.
2. Estrutura mínima: `color` (text/surface/action/feedback), `spacing` (escala), `radius`, `shadow`, `type` (scale/weight/lineHeight).
3. Torne o contrato **executável por lint**: regra que rejeita hex literal (`#RRGGBB`) e valores crus fora de `tokens/` — o comando é o do AGENTS.md do projeto.
4. Tema (dark mode, variante de marca) muda tokens, nunca componentes.

**Saída verificável:** tokens definidos + lint anti-hex passando com 0 valores crus fora de `tokens/`.

## 3. DESIGN.md como memória persistente

**Gatilho:** início de qualquer sessão de UI — `DESIGN.md` ausente ou desatualizado bloqueia o resto.

1. O `DESIGN.md` na raiz do frontend é o contrato que sobrevive entre sessões: tone, tipografia, cores por token, ritmo de espaçamento, estados e regras de composição.
2. Todo componente declara os **6 estados obrigatórios**: default, loading (skeleton/spinner), empty (mensagem + CTA), error (mensagem descritiva + retry), hover/focus (visível, outline ≥2px) e disabled (visualmente distinto).
3. Regras de composição são numéricas e verificáveis: **máx. 1 botão primário por seção**, label acima do input, max-width de texto 65ch.
4. Decisão visual nova tomada na task → atualiza o `DESIGN.md` na mesma task.

**Saída verificável:** `DESIGN.md` existente e fiel ao código no fim da mudança.

## 4. Inventário anti-drift de componentes

**Gatilho:** **antes** de criar qualquer componente novo.

1. Inventarie os primitivos existentes (botões, inputs, cards, modais, tabelas) com caminho de import e props principais.
2. Construa a tela usando **apenas** esses componentes onde existirem; sinalize o que for genuinamente novo.
3. Nunca crie um segundo estilo de botão — drift de componente é bug, não variação.

**Saída verificável:** inventário listado na task + justificativa de 1 linha para cada componente criado.

## 5. Implementação screen-by-screen com leis numéricas

**Gatilho:** ao codificar cada tela, uma por vez, contra o contrato das seções 1-4.

1. Leis de UX com número, não vibe: alvos de ação **≥44×44px** (Fitts); menu com **>7 itens** exige agrupamento ou busca (Hick); relacionados a **≤16px**, não-relacionados a **≥32px** (proximidade); grupos de até 7±2 itens (Miller); form multi-etapa com indicador de progresso.
2. Os 6 estados do `DESIGN.md` implementados e visualmente distintos em cada componente da tela.
3. **WCAG 2.2 AA é porta de entrada de design**, não etapa final: contraste ≥4.5:1, foco visível, labels associados e navegação por teclado entram junto com o layout — a verificação em duas camadas é da `ui-review`.

**Saída verificável:** tela com estados completos e leis atendidas, pronta para o loop visual da `ui-review`.

## Skills vendorizadas de apoio

Referencie pelo **nome da pasta** em `.agents/skills/` — leia, não copie:

- `frontend-design` — direção visual distintiva e fuga do padrão genérico, ao definir o tone.
- `taste-skill` — inferir direção de design do brief, em landing page, portfólio ou redesign.
- `impeccable` — desenhar, criticar e polir interfaces com detectores de anti-pattern, durante a implementação.
- `design-tokens` — validar e estruturar tokens na spec DTCG, ao montar o contrato da seção 2.
- `color-expert` — paletas, contraste e percepção de cor, ao escolher os valores dos tokens.
- `shadcn` — adicionar e compor componentes shadcn/ui, quando o projeto os usa.
- `react-best-practices` — performance React/Next.js, ao implementar em projetos React.
- `web-design-guidelines` — conferir o código de UI contra guidelines, ao fechar cada tela.

## O que esta skill não é

- Não cobre motion/timing, touch real em dispositivo, contexto cultural/RTL nem performance perceptual — lacunas declaradas da pesquisa, fora do alcance verificável atual.
- Não instala Playwright, axe-core ou lint — ferramentas são parametrizadas no AGENTS.md do projeto.
- Não é a revisão: Nielsen, WCAG em duas camadas e o loop screenshot→vision são da irmã `ui-review`.
- Não substitui as skills vendorizadas — referencia pelo nome da pasta, nunca duplica o conteúdo delas.
