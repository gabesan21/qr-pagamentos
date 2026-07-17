# Roadmap - QR Pagamentos

Project brief: [[PROJECT|QR Pagamentos]]

| # | Epoch | Description | Status |
|---|-------|-------------|--------|
| 1 | [[roadmap/1-administrative-foundation|Administrative foundation]] | Establish the self-hosted runtime, identity, access control, global settings, and bilingual admin shell. | concluída |
| 2 | [[roadmap/2-nautt-finance-integration|Nautt Finance integration]] | Onboard per-user API keys, wallet balance, pricing, orders, polling, and central webhook intake. | em andamento |
| 3 | [[roadmap/3-catalog-and-payment-links|Catalog and payment links]] | Manage administrator-configured Nautt currency/payment-method UUID records, products, and active single-use or reusable payment links with one currency each. | pendente |
| 4 | [[roadmap/4-checkout-and-orders|Checkout and order lifecycle]] | Deliver public checkout, QR payment generation, status updates, and user/admin order views. | pendente |
| 5 | [[roadmap/5-storefront-and-production|Storefront and production]] | Add the optional public storefront, visual customization, hardening, observability, and production release. | pendente |

**Epoch/phase status:** pendente | em andamento | concluída

## Future ideas

- Additional payment providers remain outside the MVP until the Nautt-backed flow is stable in production.
- Email-based password reset and administrator TOTP MFA are deferred until after all currently planned epochs.
