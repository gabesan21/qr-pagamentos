---
task: F-20260926-login-visual-corrections
entry: 01-auth-composition
---

# Auth composition

The shared `AuthCard` no longer renders its compressed theme previews. The desktop form keeps a single identity in the leading panel, while mobile retains the compact form lockup. The language selector now uses its own native-control border and occupies a dedicated top row, preventing a collision with the heading.

## Evidence

- [[src/app/auth-card.tsx|AuthCard]] — *follow for the shared panel composition*.
- [[src/app/globals.css|global auth layout]] — *follow for the responsive identity and language-row rules*.


2026-09-28 integration: source commit `cebc70f6` contains this delivery and supersedes earlier pending-Git notes. Integrated into `develop`; temporary worktrees and branches retired with private recovery copies. Main unchanged; no remote push.
