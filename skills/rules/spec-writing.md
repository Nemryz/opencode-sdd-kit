---
name: spec-writing
description: Shared conventions for writing feature specifications
---

# Spec Writing Rules

## Structure

Every spec.md MUST follow this section order:

1. **P1 — MVP** (shippable stories, ordered by dependency)
2. **P2 — Important** (high value, not critical)
3. **P3 — Nice to have** (future)

Each user story follows this template:

```
### Story N: <Short Name>
**As a** <role>, **I want** <capability>, **so that** <value>.

**Acceptance:**
- Given <context>
- When <action>
- Then <observable outcome>
```

### Acceptance Criteria Rules

- Every `Given`/`When`/`Then` must be independently testable
- Use concrete values, not vague terms ("fast" → "under 200ms p95")
- Edge cases get their own scenario block
- Non-functional requirements (performance, security) get explicit criteria

## Boundary Convention

Include a boundary section per story when relevant:

```
**Boundary:** This story owns <X>, does NOT own <Y>.
**Depends on:** <story-ID or "none">
```

## Success Criteria Rules

- Measurable: numeric thresholds or observable behavior
- Not subjective: avoid "intuitive", "clean", "efficient"
- One criterion per bullet
