# Modifications — QR Pagamentos

Project: [[PROJECT|QR Pagamentos]] · Roadmap: [[ROADMAP|Roadmap]]

| # | Modification | Description (≤1 line) | Status |
|---|--------------|-----------------------|--------|
| M-1 | `M-1.1-safe-docker-update-script` | Add a guarded production update command that preserves PostgreSQL data and the existing Nautt encryption key. · size: S · yolo: yes | completed |
| M-2 | [[M-2.1-self-updating-safe-migrations|Self-updating safe migrations]] | Make update pull the latest tracked revision, remove backup/release inputs, always run migrations, and prohibit destructive migrations. · size: M · yolo: yes | in progress |

**Modification status:** open | in progress | completed
