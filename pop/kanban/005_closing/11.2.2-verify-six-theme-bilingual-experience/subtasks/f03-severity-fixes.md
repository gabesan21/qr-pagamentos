# F03 — Severity-2+ fixes

## Objetivo
Corrigir regressões de tema, locale, responsividade, acessibilidade ou motion encontradas em F02.

## Escopo
- Tema: fallbacks, `data-theme-preview`, `--storefront-accent`, contrast AA.
- Locale: traduções ausentes, `lang`, direção.
- Responsivo: overflow <768, touch targets <44px.
- Acessibilidade: axe serious/critical, foco visível, labels.
- Motion: `prefers-reduced-motion` quando aplicável.

## Ação
Triar findings; corrigir severity-2+; severity-3/4 documentados se aceitos.

## Critério
Re-run dos runners afetados PASS; `.verify.md` lista findings e resolução.
