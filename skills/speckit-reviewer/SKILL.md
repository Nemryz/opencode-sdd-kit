---
name: speckit-reviewer
description: Check cross-artifact consistency between spec, plan, and tasks with boundary audit and ownership classification
license: MIT
compatibility: opencode
metadata:
  phase: all
  workflow: sdd
---

## What I do

Review the consistency, completeness, and quality of specification artifacts (spec, plan, tasks) and ensure alignment with the constitution. Includes boundary audit, ownership classification, and the kiro-verify-completion protocol.

## When to use me

Use at any point in the workflow to validate work done so far:
- After spec is written (before planning)
- After plan is written (before task decomposition)
- After tasks are written (before implementation)
- During implementation to check progress
- After implementation to validate completeness

## How to use me

### Step 0: Phase Gate

Before starting, call `speckit-audit` to detect existing project issues. If the audit reports errors, note them as input to the review.

### Step 1: Load Context

1. Read all available artifacts (spec, plan, tasks, constitution)
2. Read `specs/NNN-feature-name/spec.json` — check `phase` and `approvals` to understand what has been completed
3. Read domain map from `.opencode/domain-map.md` (if exists)
4. Read steering context from `.opencode/steering/` (if exists)

### Step 2: Review Dimensions (expanded)

### Spec quality
- [ ] User stories are prioritized (P1/P2/P3)
- [ ] Acceptance criteria use Given/When/Then
- [ ] Edge cases are documented
- [ ] Success criteria are measurable
- [ ] No implementation details mix into requirements
- [ ] Ambiguous areas flagged per AGENTS.md Critical Rules are resolved
- [ ] Boundaries are explicitly documented

### Plan quality
- [ ] All spec requirements are addressed in the plan
- [ ] Technology choices have rationale with alternatives
- [ ] Simplicity Gate was applied
- [ ] Anti-Abstraction Gate was applied
- [ ] Integration-First approach is documented
- [ ] Risks are identified with mitigations

### Tasks quality
- [ ] Every user story has at least one task
- [ ] Task dependencies are correct and acyclic
- [ ] Parallel markers `[P]` are accurate
- [ ] `_Boundary:_` annotations exist on every `[P]` task
- [ ] `_Depends:_` annotations exist for non-obvious dependencies
- [ ] Test tasks exist for each story
- [ ] Phases are in correct order
- [ ] All tasks reference specific file paths
- [ ] Each task has observable done state

### Boundary audit (NEW)
- [ ] No `_Boundary:_` overlap between parallel tasks
- [ ] No task silently crosses into another component's boundary
- [ ] Integration work at seam boundaries is explicit

### Cross-artifact consistency
- [ ] Spec user stories match plan phases
- [ ] Plan architecture matches tasks structure
- [ ] No orphan requirements (spec says X, plan doesn't address it)
- [ ] No orphan tasks (task T-NNN doesn't map to any story)
- [ ] Domain terms from domain-map.md are used consistently
- [ ] spec.json phase matches actual file existence (all declared artifacts present)
- [ ] spec.json approvals match review outcome

### Step 3: Ownership Classification (NEW)

For each finding, classify the root cause:

- **LOCAL**: Defect belongs to the current feature/artifact
- **UPSTREAM**: Root cause is in a dependency or earlier spec
- **UNCLEAR**: Cannot determine from available evidence

If `UPSTREAM`, name the owning spec and explain which dependent specs need revalidation after fix.

### Step 4: kiro-verify-completion Protocol (NEW)

After implementation review, validate completeness:
1. All tasks marked `[x]` in tasks.md
2. Full test suite passes
3. Build succeeds
4. Lint passes
5. Smoke check passes (app starts or CLI `--help` works)
6. No residual TODOs, FIXMEs, or hardcoded secrets introduced

Return: `GO` | `NO-GO` | `MANUAL_VERIFY_REQUIRED`

## Report format

```
## Review Summary
Status: ✅ Pass | ⚠️ Warnings | ❌ Fail
Ownership: LOCAL | UPSTREAM | UNCLEAR

### Findings
1. [Severity: HIGH/MED/LOW] [Ownership: LOCAL/UPSTREAM] [Description]

### Recommendations
- [Action item 1]

### Completeness (kiro-verify)
- DECISION: GO | NO-GO | MANUAL_VERIFY_REQUIRED

### Artifacts checked
- [ ] spec.md
- [ ] plan.md
- [ ] tasks.md
- [ ] constitution.md
- [ ] domain-map.md
```

## Safety & Fallback

### Error: Artifact not found
- **Warning**: Report which artifact is missing
- **Recovery**: Continue review of available artifacts. Do not invent content.

### Error: Conflicting artifacts (spec says X, plan says Y)
- **Stop**: Cannot resolve contradiction
- **Recovery**: Flag HIGH severity. Suggest updating the earlier artifact first.

### Error: Ownership cannot be determined
- **Fallback**: Classify as UNCLEAR
- **Recovery**: Include specific evidence gaps in the report so humans can resolve

### Error: Verify protocol cannot run tests
- **Fallback**: If no test command can be found, return MANUAL_VERIFY_REQUIRED
- **Recovery**: Document exactly which verification step could not be automated

## Reference

- Skills: `speckit-spec-writer`, `speckit-plan-engineer`, `speckit-task-decomposer`, `speckit-implementer`
- Tools: `speckit-validate`, `speckit-scaffold`
- Steering context: `.opencode/steering/` (product.md, tech.md, structure.md)
- Constitution: `.opencode/spec-memory/constitution.md`

## Output location

The review report is returned inline to the calling agent (not written to disk). The agent may choose to persist it as `review-report.md` in the feature directory.
