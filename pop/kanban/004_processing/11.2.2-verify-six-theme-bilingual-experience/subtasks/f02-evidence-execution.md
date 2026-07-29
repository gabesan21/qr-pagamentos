# F02 — Evidence execution

## Objetivo
Rodar localmente os evidence runners prioritários identificados em F01.

## Prioridade
1. `design-system:evidence` — base visual e todos os temas.
2. `admin:evidence`, `app-shell:evidence` — admin shell.
3. `merchant-dashboard:evidence`, `profile:evidence`, `orders:evidence`, `links:evidence`, `catalog:evidence`, `store-settings:evidence` — merchant surfaces.
4. `storefront:evidence`, `standalone-payment:evidence`, `checkout:evidence` — público.
5. `admin-dashboard:evidence`, `admin-orders:evidence`, `admin-users:evidence`, `admin-payment-links:evidence`, `admin-settings:evidence` — admin global.

## Ação
Executar cada runner com `pnpm <nome>:evidence` e depois `pnpm <nome>:evidence:verify` (quando existir). Coletar manifests e reviews.

## Critério
Runners prioritários PASS; falhas documentadas para triagem em F03.
