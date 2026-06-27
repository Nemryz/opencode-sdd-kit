---
name: tasks-generation
description: Shared rules for decomposing plans into tasks
---

# Tasks Generation Rules

## Task Format

Every task entry:

```
### T-NNN <Task Name>
- **Story**: <story-name>
- **File**: <deliverable file path>
- **Deliverable**: <what exists when done>
- **Dependencies**: <T-NNN or "none">
- **Boundary**: <what this task owns>
```

Parallel tasks get `[P]` prefix: `### T-NNN [P] <Task Name>`

## Phase Structure

1. **Setup** — Infrastructure, scaffolding, dependencies
2. **Foundational** — Core models, blocking prerequisites
3. **P1 Stories** — MVP stories in priority order
4. **P2 Stories** — Important stories
5. **Polish** — Error handling, docs, final review

## Atomicity Rules

A task is atomic when ALL apply:
- Can be implemented in one focused session (1-4 hours)
- Has a verifiable "done" state
- Does not require another pending task to be valuable
- Produces a commit-worthy change

## Dependency Rules

- Use `_Depends: T-NNN_` for cross-task dependencies
- Use `_Boundary: ComponentName_` for scope annotations
- Never create circular dependencies
- Dependencies that span phases are implicit phase ordering

## Task Review Rules

Before finalizing tasks.md, run a sanity check:
1. Every user story has at least one task
2. Every task has a verifiable deliverable
3. No task is too large (split if >1 day of work)
4. Dependency graph is acyclic
5. Parallel `[P]` tasks have no inter-dependencies

## Done State Convention

Each executable sub-task must include at least one detail bullet that states what "done" looks like in observable terms. Examples:

- Good: "File `src/auth/login.ts` exists with login form and validation"
- Bad: "Implement login functionality"
