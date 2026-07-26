# Modifications — QR Pagamentos

Project: [[PROJECT|QR Pagamentos]] · Roadmap: [[ROADMAP|Roadmap]]

| # | Modification | Description (≤1 line) | Status |
|---|--------------|-----------------------|--------|
| M-1 | `M-1.1-safe-docker-update-script` | Add a guarded production update command that preserves PostgreSQL data and the existing Nautt encryption key. · size: S · yolo: yes | completed |
| M-2 | `M-2.1-self-updating-safe-migrations` | Make update pull the latest tracked revision, remove backup/release inputs, always run migrations, and prohibit destructive migrations. · size: M · yolo: yes | completed |
| M-3 | Explicit kanban waiver | `M-3.1-explicit-kanban-waiver-qr` propagated strict precedence between human commands and the kanban. · size: S | completed |
| M-4 | Test baseline determinism | `M-4.1-repair-test-baseline-determinism` repaired the three carried test failures and excluded task worktrees from `pnpm test`; `M-4.2-exclude-worktrees-from-tooling` extended the exclusion to typecheck; `M-4.3-repair-epoch1-source-check` repaired the stale home-page assertion. · size: S · yolo: yes | completed |
| M-5 | Beta unverified webhook intake | `M-5.1-beta-unverified-webhook-intake` holds Nautt HMAC verification for the closed beta: bodies are accepted unverified until the pre-production human command. · size: S · yolo: yes | completed |
| M-6 | Admin authorization lock raw void | `M-6.1-fix-admin-authorization-lock-raw-void` repairs the `$queryRaw` advisory-lock call that makes every `withAuthorizationLock` mutation fail at runtime with Prisma P2010 (defect found by 10.2.1 evidence). · size: S · yolo: yes | in progress |

**Modification status:** open | in progress | completed
