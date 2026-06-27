---
name: speckit-reviewer
description: Check cross-artifact consistency between spec, plan, and tasks
license: MIT
compatibility: opencode
metadata:
  phase: all
  workflow: sdd
---

## What I do

Review the consistency, completeness, and quality of specification artifacts (spec, plan, tasks) and ensure alignment with the constitution.

## When to use me

Use at any point in the workflow to validate work done so far. Particularly useful:
- After spec is written (before planning)
- After plan is written (before task decomposition)
- After tasks are written (before implementation)
- During implementation to check progress

## How to use me

1. Read all available artifacts (spec, plan, tasks, constitution)
2. Compare them for consistency
3. Check each artifact against its quality criteria
4. Report findings: what's good, what's missing, what's inconsistent

## Review dimensions

### Spec quality
- [ ] User stories are prioritized (P1/P2/P3)
- [ ] Acceptance criteria use Given/When/Then
- [ ] Edge cases are documented
- [ ] Success criteria are measurable
- [ ] No implementation details mix into requirements
- [ ] Ambiguous areas flagged per AGENTS.md Critical Rules are resolved

### Plan quality
- [ ] All spec requirements are addressed in the plan
- [ ] Technology choices have rationale
- [ ] Simplicity Gate was applied
- [ ] Anti-Abstraction Gate was applied
- [ ] Integration-First approach is documented
- [ ] Risks are identified

### Tasks quality
- [ ] Every user story has at least one task
- [ ] Task dependencies are correct
- [ ] Parallel markers `[P]` are accurate
- [ ] Test tasks exist for each story
- [ ] Phases are in correct order
- [ ] All tasks reference specific file paths

### Cross-artifact consistency
- [ ] Spec user stories match plan phases
- [ ] Plan architecture matches tasks structure
- [ ] No orphan requirements (spec says X, plan doesn't address it)
- [ ] No orphan tasks (task T-NNN doesn't map to any story)

## Report format

```
## Review Summary
Status: ✅ Pass | ⚠️ Warnings | ❌ Fail

### Findings
1. [Severity: HIGH/MED/LOW] [Description]
2. ...

### Recommendations
- [Action item 1]
- [Action item 2]

### Artifacts checked
- [ ] spec.md
- [ ] plan.md
- [ ] tasks.md
- [ ] constitution.md
```
