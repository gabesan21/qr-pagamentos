---
task: F-20261007-standalone-payment-completion
entry: 02-polling
date: 2026-10-07
---
# Capability polling shutdown

Standalone and link checkout already observed persisted state every five seconds. Both now stop their controllers after a terminal response, 404 or failed read; visibility changes cannot restart stopped work. Pending reads remain visibility-aware; there is no provider polling, retry or second checkout dispatch.

## Evidence
- [[pop/specs/checkout-and-order-lifecycle|Checkout contract]] — Follow for capability authorization and observation semantics.
