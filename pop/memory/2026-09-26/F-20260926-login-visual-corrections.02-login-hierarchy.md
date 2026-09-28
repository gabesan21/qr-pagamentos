---
task: F-20260926-login-visual-corrections
entry: 02-login-hierarchy
---

# Login hierarchy

The credentials and MFA headings now use the defined page-heading scale, and supporting copy uses the contrast-safe secondary text role. The submit and recovery area no longer adds a footer container, while the recovery route remains available without its obsolete explanatory note. Responsive evidence now measures the intentional mobile-to-desktop identity handoff.

## Evidence

- [[src/app/login/login-form.tsx|login form]] — *follow for the preserved recovery action and hierarchy*.
- [[tests/login.evidence.spec.ts|login evidence]] — *follow for the responsive brand assertions*.


2026-09-28 integration: source commit `cebc70f6` contains this delivery and supersedes earlier pending-Git notes. Integrated into `develop`; temporary worktrees and branches retired with private recovery copies. Main unchanged; no remote push.
