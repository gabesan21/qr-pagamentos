---
name: ui-review
description: Revisão de UI com evidência - heurísticas Nielsen como pass/fail com severidade 1-4, WCAG 2.2 AA em duas camadas e loop de verificação visual screenshot→vision iterando até severidade <2. Use ao verificar ou revisar UI em tasks de frontend (005) e em gates de plano ou PR. Só projetos frontend.
---

# ui-review

**Princípio: revisão de UI produz evidência — screenshot, medida, critério ferido — não vibe check.** "Parece bom" não é veredito; "o botão primário tem 32px de altura, abaixo dos 44px mínimos" é. Quem escreve a UI usa a skill irmã `ui-change`; esta revisa contra o contrato dela (`DESIGN.md`, tokens, estados).

**Parametrização:** rode os comandos declarados na seção **"Verificação do projeto"** do AGENTS.md do projeto (Playwright, axe-core, Lighthouse, lint de tokens). Esta skill descreve o loop de verificação — **nunca instala ferramenta**.

## Roteiro de leitura

1. Leia primeiro o **contrato**: `DESIGN.md`, tokens e inventário de componentes; só então a mudança, na ordem em que o usuário a experimenta.
2. Verifique nesta ordem: camada automática (2a) → heurísticas (1) → semântica (2b) → loop visual (3) → decisão.

## 1. Heurísticas Nielsen como pass/fail

**Gatilho:** toda revisão de UI — versão rápida do processo; auditoria completa das 10 heurísticas é a `nielsen-heuristics-audit`.

Cada heurística vira pergunta com método de verificação, por exemplo: toda ação tem feedback visual em <200ms (screenshot antes/depois)? Há voltar/desfazer em cada passo? Componentes iguais são idênticos (compare com o inventário)? Validação inline antes do submit? Há mais de 1 botão primário no mesmo contexto? A mensagem de erro explica o problema e sugere ação?

**Severidade de cada achado (escala 1-4):** 1 cosmético (não impede tarefa) · 2 leve (workaround existe) · 3 major (impede tarefa) · 4 catastrófico (impossibilita uso).

**Saída verificável:** lista pass/fail com severidade e evidência (tela, elemento, medida) por achado.

## 2. WCAG 2.2 AA em duas camadas

**Gatilho:** toda revisão; auditoria completa POUR é a `wcag-accessibility-audit`.

- **(a) Automatizável (~30% dos problemas, falha o build):** axe-core/Lighthouse do projeto — alt text, contraste ≥4.5:1 (≥3:1 não-texto), foco visível, alvos ≥24×24px, labels associados, ARIA em componente custom. Violação aqui é sempre bloqueante.
- **(b) Semântica (~70%, prompts do revisor):** a ordem de tab segue o layout visual? O foco fica obscurecido por sticky header/modal? Loading/sucesso/erro anunciados via aria-live? Algum campo repete informação já fornecida? Zoom 200% quebra o layout?

**Saída verificável:** relatório com critério WCAG citado por falha + fix proposto.

## 3. Loop de verificação visual

**Gatilho:** mudança visual implementada — o loop roda **antes** de devolver ao humano.

1. Screenshot headless (ferramenta do projeto, ex.: Playwright) nos **3 viewports: 375, 768 e 1440px**.
2. Examine cada screenshot com a própria vision: elementos sobrepostos, conteúdo faltante, alinhamento incorreto, hierarquia confusa — compare com `DESIGN.md` e baseline aprovada.
3. Liste cada problema com severidade 1-4 e correção específica; aplique; novo screenshot.
4. Itere **até nenhum problema de severidade ≥2 permanecer** — diff específico por item, nunca "parece bom".

**Saída verificável:** screenshots finais dos 3 viewports + registro das iterações e do que mudou em cada uma.

## Limites conhecidos (declare no relatório)

- **Pixel diff gera 15-30% de falso positivo** (anti-aliasing, fontes, browser) — prefira a crítica semântica via vision ao diff de pixel; se usar diff, fixe browser e fontes.
- **Vision falha em texto <12px** em screenshot 1x — aumente o zoom/escala para conferir microtexto e não dê pass em legibilidade sem isso.
- Cobertura real por dimensão: contraste 95%+, semântica ARIA ~70%, **hierarquia visual ~30%**, legibilidade ~20% — julgamento estético final continua humano; não reporte o loop como garantia total.

## Decisão

| Severidade | Quando | Efeito |
|------------|--------|--------|
| **bloqueante** | Achado severidade ≥3, violação WCAG automatizável, estado obrigatório ausente, hex cru fora de tokens | Impede aprovação até resolver |
| **sugestão** | Severidade 2 com workaround, melhoria de hierarquia/consistência justificada | Autor decide; registrar a razão |
| **nit** | Severidade 1, preferência estética | Nunca segura a mudança |

- **Aprove** quando a mudança melhora a saúde visual e de acessibilidade, mesmo imperfeita; adiamento vira follow-up rastreável.
- **Devolva** (no PoP: 005 → 004/002) apenas por item bloqueante, citando heurística/critério e a evidência.

## Skills vendorizadas de apoio

Referencie pelo **nome da pasta** em `.agents/skills/` — leia, não copie:

- `nielsen-heuristics-audit` — auditoria completa das 10 heurísticas, quando a seção 1 não basta.
- `wcag-accessibility-audit` — auditoria WCAG 2.1/2.2 pelos princípios POUR, para a11y profunda.
- `skill-a11y-audit` — auditoria de acessibilidade com scripts próprios, quando o projeto permite rodá-los.
- `ui-design-review` — avaliação visual/estética (tipografia, cor, espaçamento, hierarquia) em profundidade.
- `web-design-guidelines` — checagem do código de UI contra as Web Interface Guidelines.
- `cognitive-walkthrough` — simular a cognição de usuário novato numa tarefa crítica específica.
- `don-norman-principles-audit` — auditoria dedicada pelos 7 princípios de Don Norman.
- `ux-audit-rethink` — auditoria UX holística com propostas de redesign, quando o problema é estrutural.

## O que esta revisão não é

- Não verifica motion/timing, touch real em dispositivo, contexto cultural/RTL nem performance perceptual (jank) — lacunas declaradas da pesquisa.
- `npx ai-visual-review` é pseudocódigo da pesquisa, sem fonte — não é dependência nem exemplo executável.
- Não instala ferramentas nem audita o repositório inteiro: o escopo é a mudança e o que ela toca.
- Não duplica as skills vendorizadas — aponta para elas pelo nome da pasta, com gatilho.
