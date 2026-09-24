# Suggested research — QR Pagamentos

Project: [[PROJECT|QR Pagamentos]] · Roadmap: [[ROADMAP|Roadmap]]

## nautt-production-webhook-hmac-contract

- **Status:** standing — the production HMAC contract is still unproven; task 13.1.1 shipped the reversal against the documented 2026-07-17 dispatcher contract without waiting on this research (see [[open_questions/2026-07-25-pre-production-gate-restore-webhook-hmac]], answered). A PASS confirms the shipped contract; a FAIL or UNKNOWN opens a modification against `webhook-signature.ts`, never a re-suspension of verification.
- **Feeds:** Epoch 13 (pre-production hardening) | [[specs/nautt-finance-integration|Nautt Finance integration]] | tasks 13.1.1/13.1.2 reversal fork
- **Suggested prompt:**

> QR Pagamentos is a self-hosted payment application that has already registered one central Nautt Finance webhook per owner and stores each one-time webhook verification secret encrypted. Before implementing any order-state-changing receiver, establish whether Nautt's **production `webhook_dispatcher`** implements a reproducible raw-body HMAC contract. Obtain primary evidence from the exact production dispatcher revision or an authoritative provider-supplied fixture; do not infer behavior from generic webhook conventions. Report: (1) the exact HTTP signature, delivery, and event header names and whether header values are case/whitespace normalized; (2) the signature grammar, including prefix, hexadecimal casing, number of accepted values, malformed/duplicate-header behavior, and whether multiple secrets or algorithms are supported; (3) the exact signed byte sequence, proving whether it is the request body bytes as transmitted before UTF-8 decoding, JSON parsing, decompression, or reserialization; (4) the exact HMAC algorithm and secret-byte encoding; (5) at least one sanitized canonical fixture containing secret bytes, raw body bytes (base64 plus readable form), emitted signature, delivery UUID, and event so an independent Node `createHmac("sha256", secret).update(rawBytes).digest("hex")` check can reproduce it; (6) dispatcher timeout, success-status acceptance, retry count/delays, and delivery UUID stability across retries; and (7) the production source revision/date and direct primary citations for every claim. Explicitly identify any difference between production and staging. Conclude with PASS only if the fixture reproduces exactly and all security-relevant grammar is evidenced; otherwise conclude FAIL/UNKNOWN and recommend retaining polling without an order-state-changing callback. Return a concise Markdown evidence report plus the fixture as machine-readable JSON, with all live secrets removed.

## nautt-exchange-currencies-contract

- **Status:** proposed 2026-09-22
- **Feeds:** Epoch 13 (pair validation) | [[specs/nautt-finance-integration|Nautt Finance integration]] | [[researches/pix-checkout-review/2026-09-22-review-findings|review findings]] gap L1
- **Suggested prompt:**

> QR Pagamentos creates Nautt Finance onramp orders from an administrator-registered `currency_uuid`/`exchange_currency_uuid` pair and expects `payment_data.pix_qrcode` or `payment_data.qrcode` in the response. From Nautt's official documentation of `GET /api/v2/exchange-currencies` and related endpoints, report with direct citations: (1) the exact response schema, including how a currency lists its payment methods and their `exchange_currency_uuid` values; (2) which `deposit_fields` each method requires and how they are declared; (3) how to determine, before quoting, that a given pair produces a PIX (`payment_method: "pix"`) onramp order in BRL; (4) the rule that selects `qrcode` versus `pix_qrcode`/`pix_qrcode_url` by provider; (5) every documented 400/404/422 `code` these endpoints and `POST /orders/onramp` return. Return a concise Markdown report plus the raw endpoint documentation verbatim for ingestion.

## How to use

1. Run the prompt with access to Nautt's authoritative production dispatcher source or provider-supplied fixture.
2. Deposit the raw result in `pop/researches/nautt-production-webhook-hmac-contract/raw/`.
3. Ingest the research and reconcile the synthesis/spec. A PASS closes this research as confirmed; a FAIL or UNKNOWN is proposed as a modification against `webhook-signature.ts`, never a re-suspension of the restored HMAC verification.
