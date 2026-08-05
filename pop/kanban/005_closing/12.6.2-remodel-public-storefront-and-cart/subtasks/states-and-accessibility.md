# states-and-accessibility

## O quê / Por quê
Padronizar loading, empty, error e unavailable com os componentes e copy do design system, garantindo os 6 estados obrigatórios, foco visível, targets acessíveis e sem vazamento de causa. A vitrine pública não pode confundir o comprador com estados genéricos ou indisponíveis sem retry.

## Contratos
- `loading.tsx`: skeleton geometry-preserving com `aria-busy="true"`.
- Empty: catálogo vazio e standalone off; copy + CTA implícito (voltar/verificar).
- Unavailable: um único estado opaco para slug inválido/desabilitado.
- Error: boundary opaco com retry; nunca echo de digest/exception.
- Todos os controtes ≥44×44, focus ring visível, labels associadas, sem estado apenas por cor.

## Superfície de mudança
- `src/app/store/[slug]/loading.tsx`
- `src/app/store/[slug]/error.tsx`
- `src/app/store/[slug]/page.tsx`: ramo empty/unavailable.
- `src/app/globals.css`: skeletons e estados de feedback.
- Dicionários: copy de empty, unavailable, error, retry.
- Testes `page.test.tsx`: asserts de estados e acessibilidade.
