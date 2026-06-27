---
name: speckit-task-decomposer
description: Break implementation plans into actionable, ordered tasks with dependency tracking
license: MIT
compatibility: opencode
metadata:
  phase: 3
  workflow: sdd
---

## What I do

Break down an implementation plan into specific, actionable tasks organized by user story with clear dependencies, parallelization markers, and file paths.

## When to use me

Use after the plan is complete. The spec and plan must both exist before tasks can be generated.

## How to use me

1. Read spec.md, plan.md, and any optional docs (research.md, data-model.md, contracts/)
2. Decompose each user story into concrete implementation tasks
3. Mark parallelizable tasks with `[P]`
4. Organize into phases: Setup → Foundational → P1 → P2 → P3 → Polish
5. Map dependencies between tasks
6. Include test tasks (tests are written BEFORE implementation)
7. Verify each task has a clear file path or deliverable

## Task format

```
[P] T-NNN [Story] Description — file path / deliverable
```

- `[P]` = can run in parallel with siblings
- `T-NNN` = task ID
- `[Story]` = which user story this belongs to
- Description = what to do
- File path = where the change goes

## Phase structure

### Phase 1: Setup
Shared infrastructure, dependencies, tooling, CI, database schema

### Phase 2: Foundational
Core models, services, data access — blocking prerequisites. CRITICAL.

### Phase 3: User Story 1 (P1 — MVP)
The minimal shippable feature. Tests + implementation + verification.

### Phase 4: User Story 2 (P2)
Second priority story. Tests + implementation.

### Phase 5: User Story 3 (P3)
Third priority story. Tests + implementation.

### Phase 6: Polish
Error handling, edge cases, performance, docs, final review.

## Dependency map

Include an ASCII dependency graph showing task relationships:

```
T-001
  └── T-002
         └── T-003 ─── T-004 [P]
                             └── T-005
```

## Quality checklist

- [ ] Every user story has at least one implementation task
- [ ] Tests are in separate tasks, ordered before implementation
- [ ] Dependencies between tasks are clearly mapped
- [ ] Parallelizable tasks are marked with [P]
- [ ] Each task has a file path or clear deliverable
- [ ] No task is too large (split if > 1 day of work)
- [ ] Setup phase exists for infrastructure

## Reference

Tool: `speckit-scaffold` (call with `template: "tasks"`)
Plan: `specs/NNN-feature-name/plan.md`
Spec: `specs/NNN-feature-name/spec.md`

## Output location

```
specs/NNN-feature-name/
└── tasks.md
```
