---
task: F-20261007-standalone-payment-completion
project: qr-pagamentos
started: 2026-10-07
finished: 2026-10-07
commit: 503c3d98
authorization: direct-fix triage, rule 13; user payment bug report
branch: fix/standalone-payment-completion
---
# Payment completion repair

Signed-body webhook identity needs no duplicate headers. Both checkout pollers stop after terminal/error/404. Specs, Nautt DOX and DESIGN synced; checkout DOX unchanged. No new route, provider polling or retry.

Verification: pinned Node/pnpm; typecheck/lint/build passed; 31 affected files/584 tests; full suite 273 files/2505 tests with four workers. Initial aggregate test run timed out twice. Browser/provider smoke used disposable fixtures; production and Docker untouched. Production headers remain unobserved; deployment and failed-delivery recovery were not performed.

## Entries
- [[F-20261007-standalone-payment-completion.01-signed-webhook]] — Follow for signed-envelope compatibility and security.
- [[F-20261007-standalone-payment-completion.02-polling]] — Follow for completion and stop semantics.
- [[F-20261007-standalone-payment-completion.03-verification]] — Follow for exercised checks and limits.
