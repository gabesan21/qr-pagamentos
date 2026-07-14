# Spec - Nautt Finance integration

- **Project:** [[categories/applications/qr-pagamentos/PROJECT|QR Pagamentos]]
- **Epoch/Phase:** [[categories/applications/qr-pagamentos/roadmap/2-nautt-finance-integration|Epoch 2]]
- **Status:** rascunho
- **Created:** 2026-07-13

## What it covers

This spec defines the allowed boundary between QR Pagamentos and Nautt Finance. Endpoint contracts and provider-specific states remain open until the user-supplied documentation in `researches/nautt-finance/raw/` is ingested.

## Requirements

- The integration uses Nautt Finance only to open orders, query orders for polling, and receive provider webhooks.
- The integration never creates or uses Nautt-hosted payment links.
- Each user supplies an individual Nautt API key, and the system associates every provider operation with that owner.
- API keys are encrypted at rest, available only to server-side integration code, redactable in logs, and replaceable without exposing the previous value.
- Saving a valid API key automatically registers the system's central webhook URL with Nautt when the provider contract permits it.
- Order creation is idempotent from the application's perspective and records the provider identifier without trusting client-supplied ownership.
- Polling reconciles non-final orders without overwriting a final state with an older provider response.
- Webhooks are authenticated using the provider-supported mechanism before changing order state.
- Webhook handling is idempotent, records enough evidence for audit, and acknowledges retries according to the provider contract.
- Fiat amounts, currencies, provider fees, conversion results, and USDT settlement data use exact decimal representations.
- Provider failures produce bounded retries and observable error states without leaking credentials or raw sensitive payloads.

## Out of scope

- Product, link, checkout, and storefront ownership remains entirely inside QR Pagamentos.
- Inventing undocumented Nautt endpoints, signatures, statuses, or retry guarantees is forbidden.
- Other payment providers are outside the MVP.

## Open

- Whether the admin-configured webhook URL is the central Nautt callback or a downstream forwarding destination.
- Authentication headers, environments, base URLs, rate limits, and timeout guidance.
- Exact order creation and query schemas, supported currencies/methods, statuses, and terminal-state rules.
- Webhook registration endpoint, signature/authentication scheme, event schema, retry policy, and ordering guarantees.
- Idempotency support supplied by Nautt and the client-generated key format.
- Fiat-to-USDT settlement fields and reconciliation guarantees.

## Related specs

- [[categories/applications/qr-pagamentos/specs/product-scope|Product scope]] - follow when provider constraints affect user-visible payment behavior.
- [[categories/applications/qr-pagamentos/researches/nautt-finance/README|Nautt documentation intake]] - follow before planning or implementing any provider operation.
