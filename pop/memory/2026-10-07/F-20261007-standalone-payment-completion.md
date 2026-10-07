---
task: F-20261007-standalone-payment-completion
project: qr-pagamentos
started: 2026-10-07
finished: 2026-10-07
commit: 503c3d98
authorization: direct-fix triage, rule 13; user payment bug report
branch: main and develop
---
# Payment completion repair

Signed-body webhook identity needs no duplicate headers. Both checkout pollers stop after terminal/error/404. Specs, Nautt DOX and DESIGN synced; checkout DOX unchanged. No new route, provider polling or retry.

Checks: typecheck/lint/build passed; 584 targeted and 2505 full-suite tests (four workers). Runtime smoke used fixtures; production/Docker untouched. Original production headers unobserved; no failed-delivery recovery. See verification entry for counts, pins and initial timeouts.

## Entries
- [[F-20261007-standalone-payment-completion.01-signed-webhook]] — Follow for signed-envelope compatibility and security.
- [[F-20261007-standalone-payment-completion.02-polling]] — Follow for completion and stop semantics.
- [[F-20261007-standalone-payment-completion.03-verification]] — Follow for exercised checks and limits.
- [[F-20261007-standalone-payment-completion.04-delivery]] — Follow for authorized merge and push.
