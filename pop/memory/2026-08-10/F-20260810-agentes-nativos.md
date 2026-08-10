---
task: F-20260810-agentes-nativos
project: applications/qr-pagamentos
started: 2026-08-10
finished: 2026-08-10
status: concluída
commit: pending
pr:
authorization: F-20260810-agentes-nativos — direct harness maintenance requested by the human
---

# F-20260810 — Native agents

- **Delivery:** six specialists materialized for the four supported local runtimes; the main agent remains defined by `AGENTS.md`.
- **Verification:** harness current at `41702b19076c`; `validate_local_agents.py` passed generic, Claude Code, Kimi Code, Codex, OpenCode, harness, corpus, and local-only.

## Links

- **Sources:** [[.agents/agents/pop-planner|planner]], [[.agents/agents/pop-recon|recon]], [[.agents/agents/pop-execution-orchestrator|coordinator]], [[.agents/agents/pop-executor|executor]], [[.agents/agents/pop-judge-dredd|judge]], and [[.agents/agents/pop-phase-verifier|verifier]] — *follow to inspect all six contracts*.
- **Runtimes:** [[.claude/agents/pop-planner|Claude]], [[.kimi-code/agents/pop-planner|Kimi]], [[.codex/agents/pop-planner|Codex]], and [[.opencode/agents/pop-planner|OpenCode]] — *follow to inspect the four local projections*.
