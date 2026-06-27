---
name: design-principles
description: Shared design principles for architecture decisions
---

# Design Principles

## 1. Boundaries Over Hierarchies

Clarity on what a component owns and what it doesn't is more valuable than org-chart-style layering.

- Every module declares its public API and its dependencies
- Integration points are first-class citizens
- Document what a component does NOT do

## 2. Decisions Come With Alternatives

When documenting a decision, name alternatives considered.

```
### AD-N — <Title>
- **Context**: <what forced this decision>
- **Decision**: <what was chosen>
- **Alternatives**: <1-3 concrete alternatives, not strawmen>
- **Consequences**: <what this enables or constrains>
```

## 3. Describe, Don't Prescribe at Excessive Detail

Architecture docs state structure and intent. File-level or function-level detail belongs in code, not in docs.

- Component descriptions: 2-3 sentences
- Module descriptions: 1-2 sentences
- Reference existing docs instead of duplicating

## 4. Flows Over Static Diagrams

Document how data and control move through the system, not just component hierarchy.

- Primary flows: numbered steps, narrative
- Error flows: what happens when things go wrong
- Each flow traces from entry point to completion

## 5. Simplicity Gate Application

Before adding any component, ask:
- Is this solving a current problem or a hypothetical future one?
- What's the simplest thing that works?
- Can we remove this component without breaking anything?
