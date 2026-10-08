---
task: D-20261008-nautt-production-signature
entry: 01-intake
---

# Owner-first authentication

Ended the 2026-10-07 bypass. Persisted `data.uuid` ownership resolution is unchanged; every known-order path authenticates exact raw bytes before claims, reconciliation or duplicate settlement repair. Missing/malformed/mismatched signatures return redacted 401; operational faults return 503. Unknown UUIDs remain 204 without secret access. Body notification ID, not the attempt header, remains the dedupe key.

## Evidence

- [[src/integrations/nautt/webhook-intake.ts|Intake]] — follow for the authentication boundary and unchanged recovery branches.
