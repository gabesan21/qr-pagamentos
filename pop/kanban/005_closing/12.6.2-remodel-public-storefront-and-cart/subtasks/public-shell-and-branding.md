# public-shell-and-branding

## O quê / Por quê
Recompor o shell público de `/store/[slug]` com o design system da Epoch 12: tema via `data-theme-preview`, accent como custom property, logo `/media/[identifier]` com fallback `BrandIdentity`, tipografia e espaçamento do template. Garante que a primeira impressão do comprador siga a identidade da marca e a direção "professional settlement console".

## Contratos
- Tema resolvido do owner com fallback `DEFAULT_STOREFRONT_THEME_ID`; nunca branch por theme ID.
- Accent persistido `#RRGGBB` aplicado via `--storefront-accent`, validado ou omitido.
- Logo é `ACTIVE` media identifier público; fallback é `BrandIdentity variant="merchant-fallback"`.
- Redaction: não expor slug interno, toggles, currency code bruto, owner id ou policy.
- Largura pública respeita `--layout-max`/`--checkout-max` conforme direção do template.

## Superfície de mudança
- `src/app/store/[slug]/page.tsx`: header, logo, título, introdução, scopo de tema/accent.
- `src/app/globals.css`: classes `.storefront-shell`, `.storefront-rail`, `.storefront-heading`, `.storefront-logo`.
- `src/i18n/dictionaries/storefront/*`: copy de alt do logo e fallback de nome.
- Testes `page.test.tsx`: asserts de tema, accent, logo, fallback e redaction.
