# Suggested research — QR Pagamentos

Project: [[PROJECT|QR Pagamentos]] · Roadmap: [[ROADMAP|Roadmap]]

## nautt-production-webhook-hmac-contract

- **Status:** pending
- **Feeds:** Epoch 2 | [[specs/nautt-finance-integration|Nautt Finance integration]] | task [[2.3.1-verify-and-handle-nautt-webhooks]] pause condition
- **Suggested prompt:**

> QR Pagamentos is a self-hosted payment application that has already registered one central Nautt Finance webhook per owner and stores each one-time webhook verification secret encrypted. Before implementing any order-state-changing receiver, establish whether Nautt's **production `webhook_dispatcher`** implements a reproducible raw-body HMAC contract. Obtain primary evidence from the exact production dispatcher revision or an authoritative provider-supplied fixture; do not infer behavior from generic webhook conventions. Report: (1) the exact HTTP signature, delivery, and event header names and whether header values are case/whitespace normalized; (2) the signature grammar, including prefix, hexadecimal casing, number of accepted values, malformed/duplicate-header behavior, and whether multiple secrets or algorithms are supported; (3) the exact signed byte sequence, proving whether it is the request body bytes as transmitted before UTF-8 decoding, JSON parsing, decompression, or reserialization; (4) the exact HMAC algorithm and secret-byte encoding; (5) at least one sanitized canonical fixture containing secret bytes, raw body bytes (base64 plus readable form), emitted signature, delivery UUID, and event so an independent Node `createHmac("sha256", secret).update(rawBytes).digest("hex")` check can reproduce it; (6) dispatcher timeout, success-status acceptance, retry count/delays, and delivery UUID stability across retries; and (7) the production source revision/date and direct primary citations for every claim. Explicitly identify any difference between production and staging. Conclude with PASS only if the fixture reproduces exactly and all security-relevant grammar is evidenced; otherwise conclude FAIL/UNKNOWN and recommend retaining polling without an order-state-changing callback. Return a concise Markdown evidence report plus the fixture as machine-readable JSON, with all live secrets removed.

## How to use

1. Run the prompt with access to Nautt's authoritative production dispatcher source or provider-supplied fixture.
2. Deposit the raw result in `pop/researches/nautt-production-webhook-hmac-contract/raw/`.
3. Ingest the research, reconcile the synthesis/spec/roadmap, then unblock and re-plan task 2.3.1 only if the result is PASS.
