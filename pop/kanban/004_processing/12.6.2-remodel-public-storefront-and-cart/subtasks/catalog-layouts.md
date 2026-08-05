# catalog-layouts

## O quê / Por quê
Reapresentar o catálogo agrupado nos layouts persistidos `boxed` e `table`, com imagem do produto, preço, stepper de quantidade e o item de valor livre posicionado primeiro. O catálogo é a única superfície de navegação da página; o layout deve ser fiel ao template sem reintroduzir a lista `products` legada.

## Contratos
- Grupos por categoria ativa, grupo "uncategorized" por último; categorias vazias omitidas.
- Cada produto expõe apenas `reference`, título, descrição, preço, currency code de exibição, image identifier e `available`.
- Layout `boxed`: cards com imagem opcional, preço e stepper.
- Layout `table`: tabela nativa com colunas produto/preço/quantidade.
- Valor livre renderiza primeiro quando `standalonePayments` é true; link de pagamento leva a `/store/[slug]/pay?amount=<draft>` apenas como prefill.

## Superfície de mudança
- `src/app/store/[slug]/storefront-experience.tsx`: seção de produtos, componentes `Card`/`Table`, imagem, stepper.
- `src/app/globals.css`: `.storefront-products`, `.storefront-group`, `.storefront-product-image`, `.storefront-stepper`.
- Dicionários: rótulos de preço, quantidade, grupo, valor livre.
- Testes: cobertura de boxed/table, imagem, standalone off, posição do valor livre.
