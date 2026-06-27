---
name: speckit-implementer
description: Execute implementation tasks in dependency order, building and testing each phase
license: MIT
compatibility: opencode
metadata:
  phase: 4
  workflow: sdd
---

## What I do

Execute implementation tasks sequentially, respecting dependencies and parallelization markers. Build, test, and verify each phase before moving to the next.

## When to use me

Use when spec, plan, and tasks are all complete and approved. I implement the feature following the task list exactly.

## How to use me

1. Read all task documentation
2. Execute tasks in dependency order
3. Respect `[P]` markers — execute parallel tasks together
4. For each task:
   - Read any relevant spec sections
   - Implement the code
   - Run tests (if test task exists, run it)
   - Verify the task deliverable
5. After each phase, run the full test suite
6. If a task fails, stop and report the issue
7. After all tasks complete, run a final verification

## Execution rules

### Task order
Follow the 6-phase structure defined in `speckit-task-decomposer`: Setup → Foundational → P1 → P2 → P3 → Polish.

Within a phase, respect the dependency DAG. Run `[P]` tasks concurrently.

### Test discipline
- Tests must be run after each implementation task
- If tests fail, fix before proceeding
- If no test task exists for a story, flag this as a risk

### Error handling
- If a task cannot be completed, report what was done and what blocked it
- Suggest alternative approaches for blocked tasks
- Never skip a task silently

## Quality checklist

- [ ] Pre-validated by command layer before skill invocation
- [ ] Tasks executed in correct dependency order
- [ ] Tests pass after each phase
- [ ] Parallel tasks executed together
- [ ] Blocked tasks reported with alternatives
- [ ] Final verification run on completion
- [ ] No task skipped silently

## Reference

Tasks: `specs/NNN-feature-name/tasks.md`
Plan: `specs/NNN-feature-name/plan.md`
Spec: `specs/NNN-feature-name/spec.md`
Constitution: `.opencode/spec-memory/constitution.md`

## Verification

After completion, run:
1. Build check
2. Full test suite
3. Lint check
4. Manual verification of the feature behavior
