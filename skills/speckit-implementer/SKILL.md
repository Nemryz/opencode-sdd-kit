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

Execute implementation tasks sequentially, respecting dependencies and parallelization markers. Build, test, and verify each phase before moving to the next. Optionally dispatch sub-agents for TDD cycles with independent review.

## When to use me

Use when spec, plan, and tasks are all complete and approved. I implement the feature following the task list exactly.

## How to use me

### Step 1: Load Context

Read all task documentation:
1. `tasks.md`, `plan.md`, `spec.md` from `specs/NNN-feature-name/`
2. Constitution from `.opencode/spec-memory/constitution.md`
3. Domain map from `.opencode/domain-map.md` (if exists)

### Step 2: Preflight Checks

- Validate tasks are approved (check phase status)
- Run `git status --porcelain` to note pre-existing uncommitted changes
- Discover validation commands: check `package.json`, `Makefile`, `README*`, CI configs

### Step 3: Execute Tasks

Execute tasks in dependency order. For each task:

**Per-task flow (TDD cycle):**
1. **RED**: Read relevant spec sections. Write test for the next small piece. Test should fail.
2. **GREEN**: Implement simplest solution to make test pass.
3. **REFACTOR**: Improve code structure. All tests must still pass.
4. **VERIFY**: Run full test suite. Confirm no regressions.

**Sub-agent dispatch (optional, for complex tasks):**
If a task is complex, dispatch sub-agents:
1. **Implementer sub-agent**: Writes code following TDD
2. **Reviewer sub-agent**: Reviews code against spec, returns APPROVED/REJECTED
3. **Debugger sub-agent** (on rejection): Investigates root cause in fresh context

Max 2 debug rounds per task. If still blocked after 2 rounds, mark `_Blocked:_` with reason.

**Commit discipline:**
- Stage only files changed for this task (never `git add -A` or `git add .`)
- Commit format: `feat(<feature>): <task description>`

### Step 4: Run Tests After Each Phase

After all tasks in a phase complete, run:
1. Build check
2. Full test suite
3. Lint check

If tests fail, fix before proceeding to the next phase.

### Step 5: Final Verification

After all phases complete:
1. Run full test suite (final)
2. Build check
3. Lint check
4. Manual verification of feature behavior

## Execution rules

### Task order
Follow the 6-phase structure: Setup → Foundational → P1 → P2 → P3 → Polish.
Within a phase, respect the dependency DAG. Run `[P]` tasks concurrently.

### Test discipline
- Tests MUST be run after each implementation task
- If tests fail, fix before proceeding
- If no test task exists for a story, flag this as a risk

### Error handling
- If a task cannot be completed, report what was done and what blocked it
- Suggest alternative approaches for blocked tasks
- Never skip a task silently

## Safety & Fallback

### Error: Task blocked after 2 debug rounds
- **Stop**: Mark task as `_Blocked: <reason>_` in tasks.md
- **Recovery**: Report to user with root cause analysis. Human intervention required.

### Error: Tests fail after implementation
- **Stop**: Do not proceed to next task
- **Recovery**: Fix test or implementation. Re-run until green.

### Error: Sub-agent dispatch unavailable
- **Fallback**: Execute TDD sequentially in main context
- **Recovery**: Report that sub-agent dispatch is unavailable, proceed with inline implementation

### Error: Pre-existing uncommitted changes detected
- **Warning**: Do not commit unowned changes
- **Recovery**: Stash or note pre-existing changes. Only stage files for current task.

## Quality checklist

- [ ] Pre-validated by command layer before skill invocation
- [ ] Tasks executed in correct dependency order
- [ ] Tests pass after each phase
- [ ] Parallel tasks executed together
- [ ] Blocked tasks reported with alternatives
- [ ] Final verification run on completion
- [ ] No task skipped silently
- [ ] TDD cycle followed (RED → GREEN → REFACTOR)
- [ ] Selective git commit (no `git add .`)
- [ ] Debug rounds capped at 2 per task

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
