---
name: speckit-plan-engineer
description: Create technical implementation plans with architecture decisions and risk analysis
license: MIT
compatibility: opencode
metadata:
  phase: 2
  workflow: sdd
  shared-rules: design-principles.md
---

## What I do

Transform a functional specification into a concrete technical implementation plan. I map requirements to technology decisions, define architecture, and identify risks.

## When to use me

Use after the spec is complete and approved. The user provides their tech stack preferences and I produce the full technical plan.

## How to use me

### Step 1: Load Context

Read all necessary context:
1. Spec from `specs/NNN-feature-name/spec.md`
2. Constitution from `.opencode/spec-memory/constitution.md`
3. Domain map from `.opencode/domain-map.md` (if exists)
4. Steering documents: `tech.md`, `structure.md` in `.opencode/` (if exists)
5. Shared rules from `skills/rules/design-principles.md`
6. Existing plans in `specs/` for reference

### Step 2: Sub-Agent Research (NEW for complex decisions)

For uncertain technology choices (unfamiliar framework, library evaluation, architecture pattern), dispatch sub-agents in parallel:

**Sub-agent 1 — Dependencies**: Research compatibility, latest versions, known issues
**Sub-agent 2 — Alternatives**: Compare 2-3 alternatives with pros/cons
**Sub-agent 3 — Codebase patterns**: Analyze existing codebase for conventions

Each sub-agent returns a structured findings summary (under 100 lines). Synthesize in main context after all return.

For simple or obvious decisions, skip sub-agent dispatch entirely.

### Step 3: Conversational Proposal (NEW)

Propose the architecture approach before writing:

```
## Proposed Architecture: <feature-name>

### Tech Stack
- <technology> — <why this choice>

### Key Decisions
1. <Decision 1> — <alternative considered, why chosen>

### Risks
- <Risk 1> — <mitigation>

### Confirmation
Does this approach look right? I'll generate the full plan after confirmation.
```

Wait for user confirmation before proceeding.

### Step 4: Generate Plan

1. Call `speckit-scaffold` with `template: "plan"`
2. Apply Constitution Gates BEFORE any planning:
   - **Simplicity Gate**: Is this the simplest solution? No future-proofing.
   - **Anti-Abstraction Gate**: Use frameworks directly, don't wrap them.
   - **Integration-First Gate**: Plan for real integration testing.
3. Document ALL technology choices WITH rationale, including alternatives considered
4. Apply design principles from `skills/rules/design-principles.md`
5. Create `research.md` for uncertain technology choices
6. Create `data-model.md` if entities are involved
7. Create `contracts/` for API definitions if applicable
8. Mark the plan as IMMUTABLE once written (do not modify after approval)

## Safety & Fallback

### Error: Spec not found
- **Stop**: Cannot plan without a spec
- **Recovery**: "No spec found at `specs/NNN-feature-name/spec.md`. Complete the spec phase first."

### Error: Sub-agent dispatch fails
- **Fallback**: Execute research sequentially in main context
- **Recovery**: Report the failure but continue with inline research

### Error: Technology choice has no clear winner
- **Stop**: Do not pick arbitrarily
- **Recovery**: Present 2-3 options with trade-offs to user, let them decide

### Error: Steering context inconsistent with spec
- **Stop**: Contradiction between spec requirements and existing tech constraints
- **Recovery**: Flag the inconsistency to user, ask which takes priority

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

- [ ] Every technology choice has documented rationale with alternatives
- [ ] Constitution gates have been checked and passed
- [ ] Architecture descriptions are clear (components, flows, boundaries)
- [ ] Data model is defined (if applicable)
- [ ] API contracts are defined (if applicable)
- [ ] Risks are identified with mitigations
- [ ] Sub-agent research was used for uncertain choices (or skipped with reason)
- [ ] Conversational proposal was made (or skipped in auto mode)
- [ ] Plan is marked as immutable after approval

## Reference

Tool: `speckit-scaffold` (call with `template: "plan"`)
Shared rules: `skills/rules/design-principles.md`
Spec: `specs/NNN-feature-name/spec.md`
Constitution: `.opencode/spec-memory/constitution.md`
Domain map: `.opencode/domain-map.md`

## Output location

```
specs/NNN-feature-name/
├── plan.md
├── research.md     (optional)
├── data-model.md   (optional)
└── contracts/      (optional)
```
