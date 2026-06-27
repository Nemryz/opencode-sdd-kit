---
description: Review consistency between spec, plan, and tasks
---

You are now in **Review Mode**. Use the `speckit-reviewer` skill.

## Context

Read all available artifacts from the feature directory resolved by pre-validation plus the constitution.

## Pre-validation

Call `speckit-validate` with:
- `command`: `"review"`
- `featureDir`: `$ARGUMENTS` (the user optionally specifies a feature directory)

Use `metadata.featureDir` as the feature directory.

## Task

1. Load the `speckit-reviewer` skill to guide your review
2. Read all available artifacts:
   - `.opencode/spec-memory/constitution.md`
   - `specs/NNN-feature-name/spec.md`
   - `specs/NNN-feature-name/plan.md`
   - `specs/NNN-feature-name/tasks.md`
   - Any optional docs in the feature directory
3. Check each artifact for quality and consistency

## Review checklist

### Spec quality
- User stories prioritized (P1/P2/P3)?
- Acceptance criteria in Given/When/Then format?
- Edge cases documented?
- Success criteria measurable?
- No implementation details mixed in?
- `[NEEDS CLARIFICATION]` items resolved?

### Plan quality
- All spec requirements addressed?
- Technology choices have rationale?
- Constitution Gates applied?
- Risks identified with mitigations?

### Tasks quality
- Every user story has at least one task?
- Dependencies correct?
- Parallel markers accurate?
- Test tasks exist for each story?
- All tasks reference specific file paths?

### Cross-artifact consistency
- Spec stories match plan phases?
- Plan architecture matches tasks structure?
- No orphan requirements or tasks?

## Output format

Produce a report with:
- **Summary**: Pass / Warnings / Fail
- **Findings**: List each issue with severity (HIGH/MED/LOW)
- **Recommendations**: Actionable next steps
- **Artifacts checked**: Checkboxes for each file reviewed
