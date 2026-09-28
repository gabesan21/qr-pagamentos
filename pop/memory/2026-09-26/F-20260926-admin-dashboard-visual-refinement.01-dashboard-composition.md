---
task: F-20260926-admin-dashboard-visual-refinement
entry: 01-dashboard-composition
---

# Dashboard composition

The administrator dashboard groups fixed platform totals separately from the selected-period orders, sales, and funnel. The local page wrapper restores space below the workspace-heading rule, row cards stretch to the same height, and leaderboard empty states use the compact empty-state size.

Order-source segments now use count coordinates in an accessible SVG. Three equal sources fill the whole chart exactly, avoiding the previous rounded-width overflow while preserving the no-inline-style policy.

## Evidence

- [[src/app/admin/dashboard.tsx|dashboard composition]]
- [[src/app/admin/page.test.tsx|dashboard tests]]


2026-09-28 integration: source commit `cebc70f6` contains this delivery and supersedes earlier pending-Git notes. Integrated into `develop`; temporary worktrees and branches retired with private recovery copies. Main unchanged; no remote push.
