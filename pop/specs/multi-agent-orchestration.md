# Spec — Multi-agent orchestration

- **Project:** [[PROJECT|QR Pagamentos]]
- **Status:** implemented
- **Created:** 2026-07-20
- **Updated:** 2026-07-20

## Contract

Planning, execution, and review use separate contexts. The kanban persists a concise execution brief; detailed reasoning, worker prompts, and discarded attempts remain ephemeral.

## Expected behavior

- Stage 002 always uses a planner separate from execution.
- Stage 004 chooses one executor, sequential specialists, parallel waves, or a hybrid according to skills, dependencies, and write sets.
- Parallel fronts use isolated branches/worktrees; only the execution orchestrator integrates them.
- Stage 005 uses exactly one fresh-context independent reviewer per round for behavior and code quality.
- In yolo, the same reviewer role judges 003 and 005 in separate sessions; the orchestrator performs Git integration in 006.

## Invariants

- Every front declares `owns`, `may_read`, `must_not_edit`, `depends_on`, expected input, skill, and completion criteria.
- Parallelism requires logical and write independence.
- Missing or incompatible dependencies are reported as `BLOCKED`; consumers never implement them opportunistically.
- The planner never executes its own brief, the reviewer is never an executor, and specialists never integrate another specialist's branch.
- Plans, subtasks, and specs contain no chain-of-thought, speculative code, or contingent micro-edits.

## Interfaces and failure handling

- [[pop/_templates/TASK-PLAN|TASK-PLAN]] — *follow for the planner-to-execution brief contract*.
- [[pop/_templates/SUBTASKS|SUBTASKS]] — *use only when a front benefits from persistent ownership tracking*.
- [[pop/_templates/TASK-VERIFY|TASK-VERIFY]] — *follow for the combined behavior and quality review*.
- [[pop/scripts/pop_check_scope.py|pop_check_scope]] — *run with `--allow <owns> --deny <must_not_edit>` before integrating a front*.
- Overlapping write sets must be serialized or reassigned before workers start.
- A diff outside `owns` is rejected even when the change is otherwise correct.
- Integration conflicts set `blocked: true`; workers do not resolve another branch's conflict.

## Conformance

- [x] Planner, execution, and review contexts are separate.
- [x] Briefs describe decisions and contracts without duplicating implementation.
- [x] Ownership can be checked against committed, local, and untracked changes.
- [x] One reviewer compares objective/specs with diff, tests, and quality.

## Related

- [[WORKFLOW|WORKFLOW]] — *follow to operate the state machine and gates*.
- [[pop/notes/decisions/2026-07-20-multi-agent-workflow|2026-07-20 decision]] — *follow for the local adoption rationale*.
