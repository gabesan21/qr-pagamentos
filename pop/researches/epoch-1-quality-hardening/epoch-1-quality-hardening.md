# Epoch 1 quality-hardening recon

- **Date:** 2026-07-16
- **Feeds:** [[roadmap/1-administrative-foundation|Epoch 1 Phase 1.4]] and [[specs/administrative-foundation|Administrative foundation spec]].
- **Method:** read-only inspection of the current `develop` application, tests, design contract, dependencies, and DOX contracts; no web research and no behavior changes.

## Established evidence

- `src/app/login/submit/route.ts` calls the database-backed session and locale-preference services without a runtime failure boundary. Existing mocked service tests cannot reproduce a PostgreSQL/Compose exception, so the reported 500 must be reproduced and diagnosed from sanitized real-runtime evidence rather than guessed from source.
- `src/app/login/page.tsx` is a bare one-line form that does not consume the existing `Field`, `Panel`, or `ActionButton` primitives and does not present a designed pending/disabled experience.
- The repository has no `components.json` and no direct shadcn/Radix component dependencies. Transitive Radix entries in the lockfile do not constitute an initialized or maintained shadcn layer.
- `src/app/admin/page.tsx` combines authorization, data orchestration, notices, account creation, account mutation, payment settings, language preference, and logout composition in one page and repeatedly bypasses the shared field primitive.
- The current warning presentation can place the warning foreground token directly on the page even though the contrast test validates it against a warning background. Browser-backed visual/accessibility verification must cover the rendered pairing in both themes.
- Administrative markup uses field-group classes that are not defined in the current stylesheet, and `Panel` derives DOM identifiers from translated titles; both are concrete anti-drift/robustness checks for the component rebuild.
- `DESIGN.md` currently requires a system font stack and bans remote fonts. Improved typography must remain deterministic and self-hosted/offline-safe for production builds.
- Phase 1.3 recorded a no-browser fallback for visual verification. Phase 1.4 must establish real browser evidence at representative responsive widths and block explicitly if that capability is unavailable.

## Planning boundaries

- Preserve username/password-only authentication, generic invalid-credential responses, session-cookie security, deny-by-default authorization, final-active-administrator protection, and the closed `pt-BR`/`en` locale set.
- Refine the named visual direction deliberately; do not add presentation needs belonging to catalog, checkout, storefront, or later epochs.
- Treat shadcn as a maintained source-backed component foundation integrated with the semantic token contract, not as copied page markup or an excuse for parallel component variants.
- The final task is an independent convergence gate: confirmed findings are remediated, not merely listed, and browser/a11y evidence is mandatory.

## Unresolved

- **RECON NEEDED:** exact exception behind the reported `/login/submit` 500. Task 1.4.1 must reproduce it through the self-hosted runtime with a seeded administrator and capture sanitized application/database evidence before changing code.
