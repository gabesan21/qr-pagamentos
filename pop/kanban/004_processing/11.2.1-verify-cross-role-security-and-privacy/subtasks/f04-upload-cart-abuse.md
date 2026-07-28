# F04 — Upload abuse and cart abuse

## Objetivo

Provar limites de tamanho, formato, ownership e rejeição de payloads anômalos em upload de mídia e checkout de carrinho.

## Escopo

- Revisar `src/media/`, `src/app/products/images/`, `src/app/storefront/logo/`.
- Revisar `src/checkout/storefront-cart-checkout.ts` e rota `POST /api/store/[slug]/cart/checkout`.
- Adicionar testes de arquivo não-imagem, oversized, referência de outro owner, quantidade inválida, custom-amount no cart.

## Critérios

- Uploads inválidos retornam 422 opaco.
- Carrinho rejeita referência inativa/de outro owner e quantidades fora do range.
- Custom-amount no cart retorna 400 opaco.

## Critérios de aceite

- Uploads inválidos retornam 422 opaco.
- Carrinho rejeita referência inativa/de outro owner e quantidades fora do range 1–9.999.
- Custom-amount no cart retorna 400 opaco.

## Specs

- [[pop/specs/storefront-and-customization|Storefront and customization]]
- [[pop/specs/product-scope|Product scope]]

## Não editar

Rotas/services de upload/cart, salvo para corrigir falha severity-1.
