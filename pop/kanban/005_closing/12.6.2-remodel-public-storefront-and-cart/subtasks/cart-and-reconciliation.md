# cart-and-reconciliation

## O quê / Por quê
Reapresentar o carrinho browser-local com os estados vazio, populado, recuperado e checkout, mantendo a reconciliação contra o snapshot do servidor, aritmética exata BigInt por currency e o controle de checkout apenas para produtos. O carrinho continua sem sessão e sem servidor.

## Contratos
- Storage key `qr-pagamentos:storefront-cart:v1:<slug>`; envelope versionado.
- Hidratação descarta referências ausentes/unavailable, clampa quantidade, deduplica, mantém valor livre só se standalone ativo.
- Totais por currency code, nunca somados entre moedas; moeda nula renderiza sem label.
- Checkout só envia `{ reference, quantity }` de produtos; valor livre impede o botão de checkout.
- Sucesso limpa apenas a chave desta loja e redireciona para `/pay/[identifier]`.

## Superfície de mudança
- `src/storefront/cart.ts`: mantém lógica; verificar integridade com novos componentes.
- `src/app/store/[slug]/storefront-experience.tsx`: seção do carrinho, line items, totais, botão checkout.
- `src/app/globals.css`: `.storefront-cart`, `.storefront-cart__line`, `.storefront-cart__totals`.
- Testes `storefront-experience.test.tsx`: carrinho populado, totais, checkout escondido com custom amount.
