---
name: speckit-plan-engineer
description: Create technical implementation plans with architecture decisions and risk analysis
license: MIT
compatibility: opencode
metadata:
  phase: 2
  workflow: sdd
---

## What I do

Transform a functional specification into a concrete technical implementation plan. I map requirements to technology decisions, define architecture, and identify risks.

## When to use me

Use after the spec is complete and approved. The user provides their tech stack preferences and I produce the full technical plan.

## How to use me

1. Read the spec from `specs/NNN-feature-name/spec.md`
2. Read the constitution from `.opencode/spec-memory/constitution.md`
3. Ask the user for their tech stack preferences if not provided
4. Apply the Constitution Gates before ANY planning:
   - **Simplicity Gate**: Is this the simplest solution? No future-proofing.
   - **Anti-Abstraction Gate**: Use frameworks directly, don't wrap them.
   - **Integration-First Gate**: Plan for real integration testing.
5. Document all technology choices WITH rationale
6. Create research.md for any uncertain technology choices
7. Create data-model.md if entities are involved
8. Create contracts/ for API definitions if applicable

## Constitution gates

### Simplicity Gate
- Max 3 top-level projects
- No generic abstractions "for future use"
- If in doubt, pick the simplest option

### Anti-Abstraction Gate
- Use framework APIs directly
- Do not create repository patterns, service locators, or wrappers unless the framework requires them
- Direct ORM usage, not custom data layers

### Integration-First Testing
- Plan tests against real instances (testcontainers, local dev)
- Document how to run integration tests

## Quality checklist

- [ ] Every technology choice has documented rationale
- [ ] Constitution gates have been checked and passed
- [ ] Architecture diagrams or descriptions are clear
- [ ] Data model is defined (if applicable)
- [ ] API contracts are defined (if applicable)
- [ ] Risks are identified with mitigations
- [ ] Research is done on uncertain technology choices

## Reference

Tool: `speckit-scaffold` (call with `template: "plan"`)
Spec: `specs/NNN-feature-name/spec.md`
Constitution: `.opencode/spec-memory/constitution.md`

## Output location

```
specs/NNN-feature-name/
├── plan.md
├── research.md     (optional)
├── data-model.md   (optional)
└── contracts/      (optional)
```
