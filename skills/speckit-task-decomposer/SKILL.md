---
name: speckit-task-decomposer
description: Break implementation plans into actionable, ordered tasks with dependency tracking
license: MIT
compatibility: opencode
metadata:
  phase: 3
  workflow: sdd
  shared-rules: tasks-generation.md
---

## What I do

Break down an implementation plan into specific, actionable tasks organized by user story with clear dependencies, parallelization markers, boundary annotations, and file paths.

## When to use me

Use after the plan is complete and approved. The spec and plan must both exist before tasks can be generated.

## How to use me

### Step 0: Phase Gate

Before starting, read `specs/NNN-feature-name/spec.json`. Check that:
- `approvals.plan.approved === true` — the plan must be approved before task decomposition
- `phase` is `"plan"` or `"tasks"` — otherwise tasks have already been generated

If the gate fails, stop and tell the user what needs to happen first.

### Step 1: Load Context

Read all necessary artifacts:
1. `spec.md`, `plan.md`, and optional docs (`research.md`, `data-model.md`, `contracts/`)
2. Steering context from `.opencode/steering/` (if exists) — `product.md`, `tech.md`, `structure.md`
3. Shared rules from `skills/rules/tasks-generation.md`
4. Any existing `tasks.md` for merge mode

### Step 2: Conversational Proposal (NEW)

Propose the task structure before writing:

```
## Proposed Tasks: <feature-name>

### Phases
1. Setup — <infrastructure needed>
2. Foundational — <core models>
3. P1: <Story 1> — <N tasks>
4. P2: <Story 2> — <M tasks>
5. Polish — <remaining work>

### Boundary Map
- Component A: T-001, T-002
- Component B: T-003, T-004

### Confirmation
Does this breakdown look right? I'll generate the full task list after confirmation.
```

Wait for user confirmation before writing.

### Step 3: Generate Tasks

1. Call `speckit-scaffold` with `template: "tasks"`
2. Decompose each user story into concrete implementation tasks
3. Apply atomicity rules from `skills/rules/tasks-generation.md`
4. Mark parallelizable tasks with `[P]`
5. Add `_Boundary: ComponentName_` annotation to every `[P]` task
6. Add `_Depends: T-NNN_` for non-obvious cross-task dependencies
7. Organize into phases: Setup → Foundational → P1 → P2 → P3 → Polish
8. Include test tasks (tests are written BEFORE implementation)
9. Verify each task has a clear file path or deliverable with observable done state

### Step 4: Update spec.json

After writing tasks.md, update `specs/NNN-feature-name/spec.json`:
- Set `approvals.tasks.generated = true`
- Set `phase = "tasks"`
- Set `updated_at` to current UTC ISO-8601

### Step 5: Task-Graph Sanity Review (NEW)

Before finalizing, run a lightweight review:

1. Every user story has at least one task
2. Every task has a verifiable deliverable
3. No task is too large (split if > 1 day of work)
4. Dependency graph is acyclic
5. `[P]` tasks have no hidden inter-dependencies
6. Boundary annotations don't overlap

If issues found, repair once and re-check. If still failing, report the gap.

## Task format

```
### T-NNN [P] <Task Name>
- **Story**: <story-name>
- **File**: <deliverable file path>
- **Deliverable**: <observable done state>
- **Dependencies**: <T-NNN or "none">
- **Boundary**: <component-name>
```

- `[P]` = can run in parallel with siblings
- `T-NNN` = task ID (stable, never renumbered)
- `_Boundary:_` = which component this task belongs to
- `_Depends:_` = explicit cross-task dependency

## Phase structure

### Phase 1: Setup
Shared infrastructure, dependencies, tooling, CI, database schema

### Phase 2: Foundational
Core models, services, data access — blocking prerequisites

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

## Safety & Fallback

### Error: Spec or plan missing
- **Stop**: Both spec and plan must exist
- **Recovery**: "Complete spec and plan phases first before task decomposition"

### Error: Task too large (> 1 day)
- **Stop**: Do not write oversized tasks
- **Recovery**: Split into smaller tasks, check atomicity again

### Error: Circular dependency detected
- **Stop**: Dependency graph must be acyclic
- **Recovery**: Re-map dependencies, surface implicit prerequisites

### Error: Boundary overlap between tasks
- **Warning**: Two tasks claim the same boundary
- **Recovery**: Clarify ownership with user before proceeding

## Quality checklist

- [ ] Every user story has at least one implementation task
- [ ] Tests are in separate tasks, ordered before implementation
- [ ] Dependencies between tasks are clearly mapped
- [ ] Parallelizable tasks are marked with `[P]`
- [ ] Each `[P]` task has `_Boundary:_` annotation
- [ ] Each non-obvious dependency has `_Depends:_` annotation
- [ ] Each task has a file path or clear deliverable
- [ ] No task is too large (split if > 1 day of work)
- [ ] Setup phase exists for infrastructure
- [ ] Task-graph sanity review passed

## Reference

Tool: `speckit-scaffold` (call with `template: "tasks"`)
Shared rules: `skills/rules/tasks-generation.md`
Plan: `specs/NNN-feature-name/plan.md`
Spec: `specs/NNN-feature-name/spec.md`

## Output location

```
specs/NNN-feature-name/
└── tasks.md
```
