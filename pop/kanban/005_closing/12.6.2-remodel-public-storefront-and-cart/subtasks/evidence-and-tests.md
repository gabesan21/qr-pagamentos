# evidence-and-tests

## O quê / Por quê
Atualizar a suite de testes e as evidências de parity para refletir a remodelação visual, garantindo que nenhum contrato de redaction, exact money ou comportamento de carrinho seja perdido durante a mudança de apresentação.

## Contratos
- Testes unitários passam antes e depois; novos asserts cobrem estados e componentes remodelados.
- Parity checker continua mapeando `/store/[slug]` como `authorized-extrapolation` owner `12.6.2`.
- Inventory checker não ganha componentes duplicados; novos usam primitivos existentes.
- Evidência visual segue o evidence protocol: viewports, locales, temas, estados.

## Superfície de mudança
- `src/app/store/[slug]/page.test.tsx`
- `src/app/store/[slug]/storefront-experience.test.tsx`
- `src/storefront/cart.test.ts` e `public-storefront.test.ts` se afetados.
- Scripts de parity/inventory mantidos intactos; rodar `pnpm check` e suites relevantes.
