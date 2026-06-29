---
name: speckit-spec-writer
description: Define what to build with user stories, acceptance criteria, and success metrics
license: MIT
compatibility: opencode
metadata:
  phase: 1
  workflow: sdd
  shared-rules: spec-writing.md
---

## What I do

Translate user requirements into structured feature specifications. I focus on the WHAT and WHY, never the HOW. I produce a spec document ready for planning and implementation.

## When to use me

Use after the constitution is created. Use whenever you need to define a new feature or capability before any technical decisions are made.

## How to use me

### Step 0: Phase Gate

Before starting, call `speckit-audit` to detect existing project issues. If the audit reports errors, inform the user and resolve them first.

Then read `spec.json` (if it exists). If `phase` indicates this feature already has a spec, propose overwriting or creating a new feature instead of proceeding silently.

### Step 1: Load Context

Read all available project context:
1. Constitution from `.opencode/spec-memory/constitution.md`
2. Domain map from `.opencode/domain-map.md` (if exists)
3. Steering documents: `product.md`, `tech.md`, `structure.md` in `.opencode/steering/` (if exists)
4. Shared rules from `skills/rules/spec-writing.md`
5. Existing specs in `specs/` for context

If no steering documents exist, skip gracefully — do not fail.

### Step 2: Conversational Proposal (NEW)

Before writing any files, propose the spec structure to the user:

```
## Proposed Structure: <feature-name>

### Stories
1. <Story 1> — <1-line summary> [P1]
2. <Story 2> — <1-line summary> [P2]

### Boundaries
- **Owns**: <what this feature covers>
- **Does NOT own**: <explicit exclusions>

### Confirmation
Does this structure look right? I'll generate the full spec after confirmation.
```

Wait for user confirmation before proceeding to Step 3.

### Step 3: Generate Spec

1. Derive feature name from description (kebab-case, 2-4 words)
2. Call `speckit-scaffold` with `template: "spec"` to scaffold, then write content
3. Follow rules from `skills/rules/spec-writing.md`
4. Mark ambiguous areas with `[NEEDS CLARIFICATION]` per AGENTS.md Critical Rules
5. Prioritize user stories: P1 (MVP), P2 (important), P3 (nice to have)
6. Write Gherkin scenarios for each acceptance criterion
7. Document boundary candidates explicitly
8. Define measurable success criteria
9. Identify edge cases in a dedicated section

### Step 4: Update spec.json

After writing the spec, update the feature's `spec.json`:
- Set `approvals.spec.generated = true`
- Set `updated_at` to current UTC ISO-8601
- Keep `phase` as `"spec"` (scaffold already sets this)

The spec.json is at `specs/NNN-feature-name/spec.json`. Read it first, modify fields, then write back.

## Safety & Fallback

### Error: No constitution exists
- **Stop**: Cannot write spec without governing principles
- **Recovery**: Suggest running `/spec` with `template: "constitution"` first, or ask user to create one

### Error: Ambiguous feature boundaries
- **Stop**: If the feature scope is unclear after conversation
- **Recovery**: Propose 2-3 boundary options and ask user to pick. Do not guess.

### Error: Template file missing
- **Stop**: If `speckit-scaffold` fails
- **Recovery**: Use inline Markdown structure as fallback, report the missing template path

## Quality checklist

- [ ] All user stories have clear acceptance criteria
- [ ] Every scenario has Given/When/Then format
- [ ] Edge cases are documented
- [ ] Success criteria are measurable, not subjective
- [ ] Requirements are technology-agnostic
- [ ] Ambiguous areas are flagged per AGENTS.md Critical Rules
- [ ] Each P1 story is independently shippable
- [ ] Boundaries are explicitly documented
- [ ] Steering context was loaded (or gracefully skipped)
- [ ] Conversational proposal was made (or skipped if in auto mode)

## Reference

Tool: `speckit-scaffold` (call with `template: "spec"`)
Shared rules: `skills/rules/spec-writing.md`
Constitution: `.opencode/spec-memory/constitution.md`
Domain map: `.opencode/domain-map.md`

## Output location

```
specs/NNN-feature-name/
└── spec.md
```

Where `NNN` is the next sequential number and `feature-name` is a short kebab-case slug derived from the feature description.
