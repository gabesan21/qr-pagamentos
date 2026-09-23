---
author: agent
created: 2026-09-07
---

# 2026-09-07 — Template convergence decisions

Recorded from the user's command on 2026-09-07 ("faça tudo o que precisa fazer em yolo mode, deixe o sistema funcional para mim") after the [[researches/template-fidelity-convergence/template-fidelity-audit|template fidelity audit]]. The command approves Epoch 14 in yolo and delegates the open decisions to the agent's recommendations:

- **Epoch order:** Epoch 14 runs before Epoch 13; 13's release evidence must certify the converged frontend.
- **Interaction model:** template-faithful client URL state (filters, page size, period), instant theme/locale switching and toasts sit on top of server-rendered data and native POST mutations. Server components keep owning authorization, data and redaction.
- **Theme persistence:** per-user theme uses a cookie read by the root layout (`data-theme` on `<html>`); no schema change inside UI tasks. Storefront/checkout keep `data-theme-preview`.
- **Checkout width:** V2 returns to the template's 560px single column; the 1280px two-column sanction in DESIGN.md is superseded in Phase 14.6.
- **Verification route:** evidence runners require Docker and stay user-exclusive; agent gates are `pnpm check` and component tests; rendered screenshots are a human checklist item on the final PR.
- **Functional first:** Phase 14.1 repairs the five blocking defects before any visual convergence, instead of a separate `M-8` modification.
- **Scope boundary (user command 2026-09-08):** the yolo run stops when Epoch 14 closes — no epoch starts after it in this run. Delivery at the end: the `develop` -> `main` PR plus a basic report of what was done and how the user tests it (the consolidated human checklist and the Docker-only evidence runners).
