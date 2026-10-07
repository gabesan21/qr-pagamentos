---
task: F-20261007-nautt-uuid-owner-routing
entry: 01-ownership
---
# Persisted UUID selects the owner

The globally unique providerOrderUuid resolves the trusted owner via findUnique. No signature scan or notification owner field selects a merchant. Unknown UUID returns 204 before claims or provider work. Existing durable replay, leases and authoritative GET reconciliation remain. Source commit b654d2a5 was pushed to main; develop was not changed.

## Evidence
- [[src/integrations/nautt/provider-order-store.ts]] — Follow for the Prisma owner resolver.
- [[src/integrations/nautt/webhook-runtime.ts]] — Follow for production wiring.
- [[src/integrations/nautt/webhook-intake.ts]] — Follow for UUID routing and reconciliation.
