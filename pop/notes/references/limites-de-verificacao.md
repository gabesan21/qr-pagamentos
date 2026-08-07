---
author: agent
created: 2026-08-03
---

# Verification limits — what the agent cannot verify here

Consulted by the planner (002) when assigning `verify: agent | user` to each criterion, and by the executor/gate when classifying an `ambiente` failure (sections 002 and 005_closing of [[WORKFLOW|WORKFLOW]]). Any verification that depends on an item below is born `verify: user` and goes to the delivery's human verification checklist — it never produces a return.

Blockers observed in this project (evidence: epoch 12 rounds, 2026-08-02/03):

- **`spawnSync git EPERM` in the sandbox** — verifier tests that spawn `git` as a subprocess fail on permissions, not on a product defect (seen in 12.2.4, C08: 4 blocked tests).
- **Non-deterministic screenshots** — toast/animation races produce false pixel diffs between identical runs (seen in 12.2.4: the `en/midnight-clearing/375` repeat diverged by 23,808 pixels because of a retained toast). Pixel-level visual comparison without freezing animations/toasts is flaky by construction.
- **The full capture matrix (themes × widths × locales) is expensive evidence** — regenerating everything per round costs ~700s; a re-entry regenerates only the delta's slice and reuses the rest by stamp (the WORKFLOW's "expensive evidence is reused" rule).

When a new blocker of the same kind appears, add a line here (with the task and evidence) — this is what keeps the next plan from demanding impossible verification.
