---
task: F-20261007-standardize-dashboard-badges
project: qr-pagamentos
started: 2026-10-07
finished: 2026-10-07
commit: working-tree
pr:
authorization: F-20261007-standardize-dashboard-badges: triagem de fix direto (regra 13, autorizada pelo usuario)
---

# F-20261007-standardize-dashboard-badges — Padronização de badges de estado da dashboard

> **Ledger** da alteração direta autorizada pelo usuário para padronizar badges de pedidos na dashboard e superfícies equivalentes.

- **Entrega:** Adoção das badges compactas em uma linha da tabela de pedidos (`src/app/orders/order-badges.tsx`) no dashboard do lojista, tabelas administrativas e detalhes de pedidos, mantendo acessibilidade e rótulos contextuais.
- **Verificação:** `pnpm check` (typecheck, lint de tokens e ESLint, 273 suites de teste passando, next build) e teste de fumaça de renderização com ViewPort narrow/desktop.
- **Impacto em contratos:** specs: atualizada `pop/specs/application-frontend-system.md` · DOX/DESIGN: atualizado `DESIGN.md`.

## Entradas

- [[F-20261007-standardize-dashboard-badges.01-compact-badges-adoption]] — Substituição de badges prolixas de estado por CompactProviderStateBadge e ajuste de grid responsivo nas barras de distribuição.

## Links

- **Origem:** [[pop/specs/application-frontend-system.md|Application frontend system]] — *siga para o contrato de apresentação*.
