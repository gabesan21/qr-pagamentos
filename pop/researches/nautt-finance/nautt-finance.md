# Nautt Finance API synthesis

- **Ingested:** 2026-07-13
- **Raw source:** `researches/nautt-finance/raw/`
- **Feeds:** [[specs/nautt-finance-integration|Nautt Finance integration]] - follow before planning provider operations.
- **Product boundary:** [[specs/product-scope|Product scope]] - follow when provider behavior affects checkout or administration.

## Direct answer: PIX QR Code

`POST /api/v2/orders/onramp` already returns the payment data needed by QR Pagamentos in its `201` response; the request does not send QR fields.

- `data.payment_data.pix_qrcode` is explicitly documented as the PIX copy-and-paste code (`raw/orders/create-onramp-order.md:130-146`).
- `data.payment_data.qrcode` also contains a textual BR Code value in the general PIX examples (`raw/orders/create-onramp-order.md:91-94`; `raw/orders/get-order.md:64-88`).
- `data.payment_data.pix_qrcode_url` is a URL to a rendered QR image, but it appears only in the BTG/`br-urban` variant; the docs do not guarantee it for every PIX order (`raw/orders/create-onramp-order.md:130-146`).
- The robust application contract is therefore: normalize `pix_qrcode ?? qrcode` as the copy-and-paste payload, treat `pix_qrcode_url` as optional, and render a QR image locally when only the textual payload is returned.
- The docs do not define when Nautt chooses `qrcode` versus `pix_qrcode`, so implementation must accept both without assuming one universal field.

## API-wide contract

- Production base URL: `https://api.nauttfinance.com/api/v2`; the guide names `https://api-stage.nauttfinance.com/api/v2` for sandbox (`raw/index.md:5-8`).
- Programmatic calls use `X-API-Key`; each user has at most one active key, and generating a replacement revokes the previous key (`raw/index.md:12-22`).
- `Accept-Language` supports `pt-BR`, `en`, and `es` for response messages (`raw/index.md:32-43`).
- Generic documented failures are `401`, `403`, `404`, and `429`; quantitative limits and `Retry-After` behavior are not documented (`raw/index.md:47-55`).

## Endpoint map

| Endpoint | Role in QR Pagamentos | Placement |
|----------|------------------------|-----------|
| `POST /pricing/panel/buy` | Creates the short-lived quote and `quote_uuid` required by onramp order creation. It receives the administrator-configured `currency_uuid` and `exchange_currency_uuid`. | Epoch 2 integration service; invoked server-side during Epoch 4 checkout. |
| `POST /orders/onramp` | Opens the fiat-to-USDT order and returns payment data, including PIX payload fields when applicable. | Epoch 2 provider adapter; consumed by Epoch 4 checkout. |
| `GET /orders/{uuid}` | Reads an owned order for polling, reconciliation, and user/admin order views. | Epoch 2 polling/reconciliation; consumed by Epoch 4 order views. |
| `POST /client-webhooks` | Registers the central HTTPS callback after a user saves a valid API key and returns a one-time webhook secret. | Epoch 2 credential onboarding and webhook intake. |
| `GET /users/wallets/main/balances` | Reads the API key owner's main-wallet primary-token balance for the credential settings screen. | Epoch 2 API-key onboarding and account status. |

## Pricing and administrative identifiers

- `POST /pricing/panel/buy` requires `currency_uuid`, `exchange_currency_uuid`, and exactly one of fiat `amount` or reverse `amount_usd` (`raw/pricing/calculate-buy-conversion-panel.md:9-18`).
- The response includes a `quote_uuid` valid for five minutes; order creation requires that quote (`raw/pricing/calculate-buy-conversion-panel.md:46-67`; `raw/orders/create-onramp-order.md:11-20`).
- By user decision, both UUIDs are stored in administrative configuration when the system is operating. Dynamic discovery is not required for the MVP.
- The quote must be obtained server-side immediately before order creation; expiration during checkout and quote replacement behavior remain undefined.
- Monetary response fields such as `final_amount`, `client_amount`, `profit`, `exchange_fee`, and `price` lack complete unit and semantic definitions.

## API key onboarding and wallet balance

- `GET /users/wallets/main/balances` authenticates with `X-API-Key`; omitting `user_uuid` selects the authenticated user (`raw/users/get-main-wallet-balance.md:1-28`).
- The response provides `token_symbol`, `token_name`, `network_name`, and `balance` for the main wallet's primary token (`raw/users/get-main-wallet-balance.md:31-44`).
- `balance` is already adjusted for token decimals and is never raw wei (`raw/users/get-main-wallet-balance.md:46-49`).
- By user decision, this balance belongs on the API-key settings screen after the key is successfully saved; failure behavior remains a product decision.

## Order lifecycle

- Creation accepts `quote_uuid`, provider-specific `deposit_fields`, optional description, `pos_uuid`, and additional information (`raw/orders/create-onramp-order.md:5-23`).
- The creation response is documented as the same order view returned by `GET`, aside from response code/message (`raw/orders/create-onramp-order.md:65-68`).
- Active states are `new`, `processing`, and `paid`; final states are `finished`, `rejected`, `canceled`, `refunded`, and `expired` (`raw/orders/get-order.md:303-306`).
- Orders normally expire 30 minutes after creation, but polling interval and transition rules are not documented (`raw/orders/create-onramp-order.md:65-68`).
- Provider idempotency headers or keys are not documented; local idempotency alone cannot resolve an unknown provider result after a timeout.

## Webhook registration and intake

- `POST /client-webhooks` requires an HTTPS `url`; optional `event_types` subscribes to selected events, while omitted/empty subscribes to all (`raw/webhook-registering.md:29-39`).
- The `201` response returns webhook UUID, URL, event types, active status, and a secret that is shown only once (`raw/webhook-registering.md:59-80`).
- Delivery posts contain a stable top-level delivery `id`, event, creation timestamp, order UUID/status, and attempt evidence; the handler must re-fetch `GET /orders/{uuid}` for the authoritative order object (`raw/webhook.md`).
- Delivery verification uses the encrypted one-time webhook secret: calculate `hex(HMAC-SHA256(secret, rawBody))`, compare it in constant time with `X-Nautt-Signature: sha256=<hex>`, and parse only after verification. `X-Nautt-Delivery` is the durable unique deduplication key and `X-Nautt-Event` identifies the event. This dispatcher contract was supplied from Nautt's `webhook_dispatcher` source on 2026-07-17.
- A receiver must return `2xx` within 15 seconds; Nautt retries failed deliveries five times at 10, 20, 40, 80, and 160 seconds. Delivery-history reads cover an order's deliveries and a specific delivery, including permanently failed attempts (`raw/webhook.md`).
- `order.failed` is an event type, not an order status. The documented order statuses remain `new`, `processing`, `paid`, `finished`, `rejected`, `canceled`, `refunded`, and `expired`; `paid`, `processing`, and `finished` are payment-confirmed for table/polling presentation.
- Webhook list/delete/recreate contracts remain absent, so key rotation and lost-secret recovery cannot yet be fully designed.

## Contradictions and inconsistencies

> Contradiz: [[specs/nautt-finance-integration|Nautt Finance integration]] - the current "only" boundary omits pricing, but pricing is a mandatory preparatory call because onramp creation requires its `quote_uuid`.

> Contradiz: [[notes/decisions/2026-07-13-project-foundation|Project foundation decisions]] - the original boundary lists order opening/query and webhooks only; the later UUID decision explicitly admits pricing as a required preparatory operation.

- The sandbox guide says `api-stage.nauttfinance.com`, while webhook examples use `stage.nauttfinance.com`; the correct host requires confirmation (`raw/index.md:5-8`; `raw/webhook-registering.md:107-124`).
- `order.failed` appears in registration documentation but not the delivered event table; it is an event type rather than an order status and requires no status mapping.
- The creation docs claim parity with the GET object, but one creation example omits the GET field described as always present.
- A card example uses status `New`, while the documented enum is lowercase `new`.

## Missing documentation before Epoch 2 implementation

- Webhook list/delete operations and behavior after API-key rotation.
- Provider idempotency for order creation and recovery after ambiguous timeouts.
- Rules selecting `qrcode`, `pix_qrcode`, and `pix_qrcode_url` by payment method/provider.
- Required `deposit_fields` and payer data for every configured method.
- Monetary-field semantics, precision/rounding, rate limits, timeouts, and recommended polling interval.

## Proposed knowledge updates

- Expand the integration spec boundary to include server-side pricing as an order prerequisite.
- Resolve documented authentication, URLs, statuses, quote lifetime, and QR fields in the spec while retaining unresolved webhook and idempotency gaps.
- Include main-wallet balance in Epoch 2 on the API-key settings screen, with explicit loading, unavailable, and retry behavior decided during phase planning.
- Treat payment-link endpoints listed by Nautt as forbidden and unused; QR Pagamentos continues to own links and checkout.
