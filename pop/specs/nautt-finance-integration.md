# Spec - Nautt Finance integration

- **Project:** [[PROJECT|QR Pagamentos]]
- **Epoch/Phase:** [[roadmap/2-nautt-finance-integration|Epoch 2]]
- **Status:** rascunho
- **Created:** 2026-07-13

## What it covers

This spec defines the allowed boundary between QR Pagamentos and Nautt Finance based on the ingested source in `researches/nautt-finance/raw/`; undocumented provider behavior remains open.

## Requirements

- The integration uses Nautt Finance only to obtain onramp quotes, open and query orders, register and receive provider webhooks, and read the authenticated user's main-wallet balance.
- The integration never creates or uses Nautt-hosted payment links.
- Each user supplies an individual Nautt API key, and the system associates every provider operation with that owner.
- API keys are encrypted at rest, available only to server-side integration code, redactable in logs, and replaceable without exposing the previous value.
- Saving a valid API key automatically registers the system's central webhook URL with Nautt when the provider contract permits it.
- After a successful API key save, the same settings screen queries `GET /users/wallets/main/balances` and displays `token_symbol`, `token_name`, `network_name`, and the decimal `balance` returned by Nautt.
- The displayed balance is never interpreted as raw wei and is scoped to the API key owner's main wallet.
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
- Whether a balance timeout or missing main wallet blocks API key persistence, only suppresses the balance panel, or offers an explicit retry.
- Authentication headers, environments, base URLs, rate limits, and timeout guidance.
- Exact order creation and query schemas, supported currencies/methods, statuses, and terminal-state rules.
- Webhook registration endpoint, signature/authentication scheme, event schema, retry policy, and ordering guarantees.
- Idempotency support supplied by Nautt and the client-generated key format.
- Fiat-to-USDT settlement fields and reconciliation guarantees.

## Related specs

- [[specs/product-scope|Product scope]] - follow when provider constraints affect user-visible payment behavior.
- [[researches/nautt-finance/nautt-finance|Nautt Finance API synthesis]] - follow before planning API-key onboarding, balance, pricing, orders, or webhooks.
