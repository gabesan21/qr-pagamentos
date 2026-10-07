---
task: F-20261007-standalone-payment-completion
entry: 01-signed-webhook
date: 2026-10-07
---
# Signed webhook identity

The authenticated body id/event identifies deliveries without duplicate headers; any present duplicate must match. HMAC, owner-bound authoritative GET, deduplication and reconciliation fences remain mandatory. The reported nanosecond-timestamp envelope returned 400 before this repair when metadata headers were absent; that reproduces a compatibility defect, not proof of production header absence.

## Evidence
- [[pop/specs/nautt-finance-integration|Nautt contract]] — Follow for intake/security boundaries.
- [[src/integrations/nautt/webhook-intake.test.ts|Intake regressions]] — Follow for exact-envelope, signature, contradiction and authoritative-state scenarios.
