# Nautt Finance documentation intake

Place the original Nautt Finance documentation and examples in `raw/` without rewriting them. Preserve filenames when possible and never add real API keys, webhook secrets, customer data, or production payloads.

After the source files are present, run the PoP `ingest-research` workflow before planning Epoch 2. The resulting synthesis must resolve or retain the open questions in [[categories/applications/qr-pagamentos/specs/nautt-finance-integration|Nautt Finance integration]].

Required source coverage:

- API environments, base URLs, authentication, limits, and errors.
- Order creation and query endpoints with request/response examples.
- Supported fiat currencies, QR methods, amount precision, and order states.
- Webhook registration, authentication/signature, events, retries, and ordering.
- Idempotency, polling guidance, settlement, fees, and fiat-to-USDT fields.
