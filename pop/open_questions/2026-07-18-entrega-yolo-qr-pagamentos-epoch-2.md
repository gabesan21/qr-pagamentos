---
status: aberta
origem: projeto
created: 2026-07-18
---

# Open the Epoch 2 `develop` → `main` pull request?

Epoch 2 is complete on `develop`: per-user encrypted Nautt credentials and balance onboarding; exact-decimal pricing and durable owner-bound orders; safe polling and versioned reconciliation; the real sessionless HMAC webhook receiver; and fenced failed-delivery recovery. No Nautt-hosted payment link was introduced. Task 2.3.2 deliberately keeps the undocumented delivery-history HTTP wire decoder behind an injected normalized port rather than inventing a provider response contract.

## How to test

```bash
git checkout develop
pnpm check
pnpm db:test
```

The following critical tasks were independently verified by the yolo critic and deserve extra attention during human testing:

- `2.1.1-secure-per-user-nautt-credentials`
- `2.1.2-onboard-nautt-key-and-wallet-balance`
- `2.1.3-register-owner-webhooks`
- `2.2.1-build-nautt-pricing-and-order-adapter`
- `2.2.2-model-provider-orders-and-safe-polling`
- `2.3.1-verify-and-handle-nautt-webhooks`
- `2.3.2-recover-nautt-webhook-deliveries`

Decision requested: after human testing, should the project open a pull request from `develop` to `main`?

## Response (user)

