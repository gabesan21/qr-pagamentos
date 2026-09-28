# Modifications — QR Pagamentos

Project: [[PROJECT|QR Pagamentos]] · Roadmap: [[ROADMAP|Roadmap]]

| # | Modification | Description (≤1 line) | Status |
|---|--------------|-----------------------|--------|
| M-1 | `M-1.1-safe-docker-update-script` | Add a guarded production update command that preserves PostgreSQL data and the existing Nautt encryption key. · size: S · yolo: yes | completed |
| M-2 | `M-2.1-self-updating-safe-migrations` | Make update pull the latest tracked revision, remove backup/release inputs, always run migrations, and prohibit destructive migrations. · size: M · yolo: yes | completed |
| M-3 | Explicit kanban waiver | `M-3.1-explicit-kanban-waiver-qr` propagated strict precedence between human commands and the kanban. · size: S | completed |
| M-4 | Test baseline determinism | `M-4.1-repair-test-baseline-determinism` repaired the three carried test failures and excluded task worktrees from `pnpm test`; `M-4.2-exclude-worktrees-from-tooling` extended the exclusion to typecheck; `M-4.3-repair-epoch1-source-check` repaired the stale home-page assertion. · size: S · yolo: yes | completed |
| M-5 | Beta unverified webhook intake | `M-5.1-beta-unverified-webhook-intake` holds Nautt HMAC verification for the closed beta: bodies are accepted unverified until the pre-production human command. · size: S · yolo: yes | completed |
| M-6 | Admin authorization lock raw void | `M-6.1-fix-admin-authorization-lock-raw-void` repairs the `$queryRaw` advisory-lock call that makes every `withAuthorizationLock` mutation fail at runtime with Prisma P2010 (defect found by 10.2.1 evidence). · size: S · yolo: yes | completed |
| M-7 | Root DOX contract hygiene | `M-7.1-shrink-root-agents-contract` shrinks the root `AGENTS.md` to the DOX ~60-line subtree ceiling, moves operational detail to child contracts/specs, and adds `prisma/AGENTS.md` to the index. · size: S | completed |

| M-8 | [[M-8.1-admin-directory-filters]] | Compact administrative directory filters and improve layout across Orders, Payment links and Users. · size: M | completed; integrated into develop |

| M-9 | [[M-9.1-theme-control-density]] | Centralize compact control density and enforce theme-backed styling across shared components. · size: M | completed; integrated into develop |

**Modification status:** open | in progress | completed

| M-10 | [[M-10.1-payment-method-currency-settings]] | Consolidate currency and payment method settings with manual provider identifiers. · size: M | completed; integrated into develop |

| H-10 | [[H-10.1-settings-heading-spacing]] | Remove touching Settings heading divider and restore standard spacing. | completed; integrated into develop |

| M-11 | [[M-11.1-sidebar-account-locale-branding]] | Shared footer account menu, accessible locale flags and neutral provider copy. | completed; integrated into develop |

| M-12 | [[M-12.1-merchant-directory-parity]] | Compact merchant Orders, Payment links and Catalog with plain copy and matching loading states. | completed; integrated into develop |

| H-12 | [[H-12.1-orders-filter-row]] | Keep Orders additional source, money, and payment-link filters on one desktop row and shorten the all-states copy. | completed; integrated into develop |

| M-13 | [[M-13.1-provider-key-replacement]] | Validate and replace a merchant Nautt API key without registering or resetting a webhook. | completed; integrated into develop |

| H-13 | [[H-13.1-merchant-settings-heading-spacing]] | Align merchant Settings heading with administrator spacing. | completed; integrated into develop |
| M-14 | [[M-14.1-standalone-storefront]] | Compact value-free storefront without empty cart or duplicate copy. | completed; integrated into develop |
