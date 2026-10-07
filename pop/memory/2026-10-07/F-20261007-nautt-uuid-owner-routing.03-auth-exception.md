---
task: F-20261007-nautt-uuid-owner-routing
entry: 03-auth-exception
---
# User-authorized temporary production HMAC bypass

User ordered signature checks commented and main pushed for production testing. Intake is unauthenticated: callers knowing an order UUID can trigger GET work with distinct delivery IDs while actionable. Notification status never directly mutates payment state. Restore HMAC after UUID resolves the owner, using only that owner's active secret and exact raw bytes; never restore signature-based ownership. Wire the owner-secret dependency/import when restoring the commented gate.

## Evidence
- [[src/integrations/nautt/webhook-intake.ts]] — Follow for the commented gate.
- [[pop/specs/nautt-finance-integration|Nautt integration]] — Follow for the agreed exception.
