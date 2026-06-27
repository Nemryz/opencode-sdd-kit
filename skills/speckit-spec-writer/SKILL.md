---
name: speckit-spec-writer
description: Define what to build with user stories, acceptance criteria, and success metrics
license: MIT
compatibility: opencode
metadata:
  phase: 1
  workflow: sdd
---

## What I do

Translate user requirements into structured feature specifications. I focus on the WHAT and WHY, never the HOW. I produce a spec document ready for planning and implementation.

## When to use me

Use after the constitution is created. Use whenever you need to define a new feature or capability before any technical decisions are made.

## How to use me

1. Read the existing constitution from `.opencode/spec-memory/constitution.md`
2. Understand the user's request — focus on intent, not technology
3. Call the `speckit-scaffold` tool with `template: "spec"` to scaffold the spec file, then fill in the content
4. Follow the `[NEEDS CLARIFICATION]` rule from AGENTS.md Critical Rules
5. Prioritize user stories as P1 (MVP), P2 (important), P3 (nice to have)
6. Write Gherkin scenarios for each acceptance criterion
7. Identify edge cases explicitly
8. Define measurable success criteria

## Quality checklist

- [ ] All user stories have clear acceptance criteria
- [ ] Every scenario has Given/When/Then format
- [ ] Edge cases are documented
- [ ] Success criteria are measurable, not subjective
- [ ] Requirements are technology-agnostic
- [ ] Ambiguous areas are flagged per AGENTS.md Critical Rules
- [ ] Each P1 story is independently shippable

## Reference

Tool: `speckit-scaffold` (call with `template: "spec"`)
Constitution: `.opencode/spec-memory/constitution.md`

## Output location

```
specs/NNN-feature-name/
└── spec.md
```

Where `NNN` is the next sequential number and `feature-name` is a short kebab-case slug derived from the feature description.
