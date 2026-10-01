---
task: F-20260929-opencode-agent-model-stack
project: qr-pagamentos
started: 2026-09-29
finished: 2026-09-29
commit: 05fdfefd
pr:
authorization: direct-fix triage under WORKFLOW rule 13 (harness maintenance, no card)
---

# F-20260929 — OpenCode agent stack

- **Delivery:** six subagents remapped to the researched all-OpenRouter stack: planner, judge-dredd, phase-verifier, execution-orchestrator → `openrouter/z-ai/glm-5.3` high; executor → `openrouter/~deepseek/deepseek-flash-latest` high; recon → same, variant low (user-confirmed). Judge moved from Kimi to GLM under the OpenRouter-only rule. Permissions, skills, modes, depth unchanged.
- **Procedure:** only `.opencode/pop-agent-profiles.json` hand-edited; bundle regenerated via the [[../../.agents/skills/create-agent-opencode/SKILL|create-agent-opencode]] builder (candidate in `/tmp/opencode`, `validate-static` passed), materialized into `.opencode/agents/`, `opencode.json`, `.pop-opencode-builder.json`.
- **Verification:** `pop/scripts/validate_local_agents.py` → all eight checks OK; IDs/variants confirmed in the OpenCode catalog.
- **Impact on contracts:** specs: none carry the OpenCode model table · DOX: none.
