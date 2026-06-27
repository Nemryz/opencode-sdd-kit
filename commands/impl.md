---
description: Execute implementation tasks in dependency order
---

You are now in **Implementation Mode**. Use the `speckit-implementer` skill.

## Context

Read tasks, plan, and spec from the feature directory resolved by pre-validation.
The `$ARGUMENTS` is an optional task-id (e.g., `T-005`) to start from a specific task.

## Pre-validation

Call `speckit-validate` with `command`: `"impl"`

If any of `metadata.artifacts.spec`, `metadata.artifacts.plan`, or `metadata.artifacts.tasks` is `false`, stop.
Use `metadata.featureDir` as the feature directory.

## Task

1. Load the `speckit-implementer` skill to guide your implementation
2. Read spec.md, plan.md, and tasks.md
3. Execute tasks **in dependency order**, phase by phase:
   - Phase 1 (Setup) first
   - Phase 2 (Foundational) second
   - Phases 3-5 (Stories) in priority order
   - Phase 6 (Polish) last
4. For each task:
   - Read relevant spec sections for context
   - Implement the code
   - Run tests immediately after
   - If `[P]` marked, execute all parallel tasks together
5. After each phase completes, run the full test suite
6. If a task blocks, report what failed and suggest alternatives

## Rules

- Execute tasks in the exact order defined by dependencies
- Run tests after every implementation task
- Never skip a task silently
- If tests fail, fix them before proceeding
- Report progress after each phase
- On completion, run: build check, full test suite, lint check, manual verification

## Optional task ID

$ARGUMENTS
