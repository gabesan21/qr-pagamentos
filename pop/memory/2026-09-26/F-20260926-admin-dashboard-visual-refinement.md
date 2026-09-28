---
task: F-20260926-admin-dashboard-visual-refinement
project: qr-pagamentos
started: 2026-09-26
finished: 2026-09-26
commit: uncommitted (coordinated delivery)
authorization: direct-fix triage under WORKFLOW rule 13
---

# F-20260926 — Admin dashboard visual refinement

- **Delivery:** `/admin` now separates platform totals from selected-period performance, makes account labels explicit, restores the defined stat number role, aligns dashboard cards, adds space below the workspace heading, localizes every displayed integer count, and describes the available platform accounts, orders, and sales in present-tense header copy.
- **Accuracy:** order-source bars use exact count-coordinate SVG segments; provider-confirmed and locally finalized sales and every currency pair remain separate. Exact pt-BR money uses Brazilian separators except USD and USDT, which retain US separators.
- **Scope:** ranking empty states alone use the compact shared composition. The dashboard remains read-only with the same metrics, period control, accessibility semantics, and bilingual content.
- **Verification:** 27 focused page and component tests passed under pinned Node 26.4.0 and pnpm 11.3.0, including pt-BR/en counts and exact-string BRL/USD/USDT display coverage. Typecheck passed; targeted lint reported zero errors and the pre-existing product-fallback `<img>` warning.
- **Operational delivery:** the final copy-only uncommitted local `/admin` candidate was promoted only to the existing app at `127.0.0.1:3000`. The app is healthy, `/api/health` returned the exact healthy result, and `/login` returned HTTP 200. The database container's recorded prefix and PostgreSQL/media volume identities are unchanged; the previous image remains pinned for rollback. A prior verification predicate guessed a full database-container ID rather than using the recorded prefix; read-only checks proved the container and volumes stable. No migration, seed, or secret mutation occurred.
- **IAB validation:** coordinator checked the authenticated dashboard at desktop and mobile widths; the `30d` and `7d` period controls passed before the final localized header-copy correction.

## Entries

- [[F-20260926-admin-dashboard-visual-refinement.01-dashboard-composition]] — layout, exact source chart, and localized dashboard copy.

## Links

- [[../specs/administrative-foundation|Administrative foundation]]
- [[../specs/application-frontend-system|Application frontend system]]
