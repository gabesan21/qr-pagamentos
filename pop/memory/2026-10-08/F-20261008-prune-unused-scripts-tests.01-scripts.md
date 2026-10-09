---
task: F-20261008-prune-unused-scripts-tests
entry: 01-scripts
---

# Remove obsolete developer utilities

Deleted `scripts/rebuild-app-container.sh`, `scripts/capture-design-system.mjs`, and `scripts/verify-admin-evidence.mjs`. Reference searches found no callers. Verified all three paths absent; retained managed update and current evidence tooling. No package commands or container assets changed.

## Evidence

- [[package.json|Package commands]] — follow for retained design-system and partitioned admin evidence entry points.
- [[install/update.sh|Managed update]] — follow for the unchanged operational update path.
