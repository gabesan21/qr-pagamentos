---
parent: F-20261007-standardize-dashboard-badges
date: 2026-10-07
---

# Adoção de badges compactas e alinhamento responsivo da dashboard

Substituição dos mapas prolixos de rótulos do checkout usados nas badges da dashboard e detalhes de pedidos pelo módulo canônico `src/app/orders/order-badges.tsx` (`CompactProviderStateBadge`, `CompactSourceBadge` e `CompactOutcomeBadge`).

O texto visível agora permanece resumido em uma linha única (ex: "Confirmado", "Aguardando", "Sem pagamento"), enquanto os leitores de tela mantêm a descrição contextual completa em spans acessíveis.

Nas barras de distribuição por estado e origem do painel de lojista (`src/app/(merchant)/dashboard.tsx`), a linha foi reestruturada para grid responsivo (`col-span-2` para badge e contagem; barra em linha cheia abaixo de 640px), evitando compressão ou quebra de texto em telas estreitas.

Evidência em [[pop/specs/application-frontend-system.md#30FA]] e `src/app/(merchant)/dashboard.tsx`.
