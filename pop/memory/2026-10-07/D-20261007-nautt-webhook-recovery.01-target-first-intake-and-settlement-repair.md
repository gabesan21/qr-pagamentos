---
task: D-20261007-nautt-webhook-recovery
entry: 01-target-first-intake-and-settlement-repair
---

# Target-first intake and recovery

Replaced rigid webhook parsing and delivery store limits with target-first routing on `data.uuid`, optional delivery evidence tracking, historical rejection reclaim, and local settlement repair for final provider orders.

## Evidência

- [[src/integrations/nautt/webhook-envelope.ts]] — *routing por data.uuid*.
- [[src/integrations/nautt/webhook-delivery-store.ts]] — *reclaim de REJECTED*.
- [[src/integrations/nautt/provider-order-store.ts]] — *findWebhookOrder*.
- [[src/integrations/nautt/owner-pricing-orders.ts]] — *repairWebhookSettlement*.
- [[src/integrations/nautt/webhook-intake.ts]] — *intake target-first*.
