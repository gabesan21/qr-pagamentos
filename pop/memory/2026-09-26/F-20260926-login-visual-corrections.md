---
task: F-20260926-login-visual-corrections
project: qr-pagamentos
started: 2026-09-26
finished: 2026-09-26
commit: uncommitted (coordinated delivery)
pr:
authorization: direct-fix triage under WORKFLOW rule 13
---

# F-20260926 — Login visual corrections

- **Delivery:** refined the shared authentication composition and `/login` hierarchy without changing authentication behavior.
- **Verification:** coordinator visually validated desktop 955px and mobile 375px; `localhost:3001` hydrated with password-toggle and required-field feedback. Under Node 26.4.0, `pnpm typecheck` and `pnpm build` passed; `pnpm lint` passed with 54 pre-existing warnings; 21 targeted tests passed. The initial full suite failed only on the retired language-position CSS assertion, which was corrected. The limited-worker rerun produced 2,318 passes and 30 skips; its sole unrelated failure was `scripts/verify-design-system-evidence.test.ts:82`, caused by leftover `/tmp/design-system-evidence-rwHUAd` evidence.
- **Operational delivery:** deployed the uncommitted local image to the existing `qr-pagamentos` app only at `127.0.0.1:3000`. The app was healthy, `/api/health` and `/login` returned HTTP 200, the database container and data/media volumes were unchanged, and the prior image remained pinned for rollback. The temporary `127.0.0.1:3001` preview was stopped after verification.
- **Impact on contracts:** specs: updated [[application-frontend-system]] for auth identity composition · DOX: reviewed [[src/brand/AGENTS|brand contract]], no update required.

## Entries

- [[F-20260926-login-visual-corrections.01-auth-composition]] — shared auth layout and language-control correction.
- [[F-20260926-login-visual-corrections.02-login-hierarchy]] — login heading, recovery action, and responsive evidence correction.

## Links

- **Source:** [[../WORKFLOW|workflow]] — *follow for the direct-fix record requirements*.
- **Evidence:** [[../specs/application-frontend-system|application frontend system]] — *follow for the changed auth composition contract*.
