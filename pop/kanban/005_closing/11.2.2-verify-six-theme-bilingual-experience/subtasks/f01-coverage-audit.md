# F01 — Coverage audit

## Objetivo
Mapear evidence runners existentes contra os requisitos do card.

## Requisitos do card
- admin/merchant shells
- dashboards (merchant, admin)
- tables (orders, links, users, catalog)
- forms (settings, profile, categories, products)
- media states (logo fallback, staged logo, product image)
- storefront, cart, checkout
- mobile widths (≤375, 768)
- keyboard use
- reduced motion
- WCAG 2.2 AA (axe serious/critical)

## Ação
Listar `scripts/run-*-evidence.mjs` e `tests/*.evidence.spec.ts`; preencher matriz requisito×runner com tema, locale, largura, keyboard, motion, axe. Identificar lacunas.

## Critério
Arquivo de cobertura ou `.verify.md` contém a matriz; nenhuma lacuna sem justificativa documentada.
