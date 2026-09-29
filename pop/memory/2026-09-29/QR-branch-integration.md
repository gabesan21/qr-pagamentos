# QR Pagamentos integration — 2026-09-29

The user explicitly authorized merging all project worktrees into develop, merging develop into main, synchronizing both local branches with origin, and retiring the completed worktrees.

- Currency repair source `0b481d97`, evidence `e3ef942e`.
- Standalone PIX flow source `c0655877`, evidence `5759a5a6`.
- Live BRL mask source `dc9c9dea`, final evidence in this integration commit.

All three task branches form one linear ancestry, with no unique work outside the hotfix tip. The two older worktrees are clean and already ancestors of develop; the final hotfix is integrated by fast-forward. The existing main is an ancestor as well. No force push is needed. Historical per-task notes saying no main merge/push describe their original delivery and are superseded by this explicit integration authorization.

Before retiring worktrees, verify both remote heads match the final local tip and preserve a private Git bundle. Keep only main and develop locally. Docker uses the verified live-mask image with Compose bound to the permanent checkout, and database/mount/environment/port preservation passed. No additional runtime rebuild is needed for documentation-only integration changes.
