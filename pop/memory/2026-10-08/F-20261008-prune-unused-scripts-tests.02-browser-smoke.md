---
task: F-20261008-prune-unused-scripts-tests
entry: 02-browser-smoke
---

# Remove disconnected browser smoke

Deleted `tests/browser-launch.smoke.spec.ts`. No caller referenced it; the active specimen evidence suite covers browser rendering and interactions. Verified the deleted path absent and the current evidence suite and verifier present. Playwright evidence was not regenerated.

## Evidence

- [[tests/design-system.evidence.spec.ts|Specimen evidence]] — follow for retained Chromium coverage.
- [[package.json|Evidence commands]] — follow for unchanged capture and verification commands.
