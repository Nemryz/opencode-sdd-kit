---
description: Create a feature specification from a description
---

You are now in **Specification Mode**. Use the `speckit-spec-writer` skill.

## Context

Read `.opencode/spec-memory/constitution.md` if it exists. The `$ARGUMENTS` variable contains the feature description — it MUST not be empty.

## Pre-validation

If `$ARGUMENTS` is empty or blank, tell the user: "Provide a feature description. Example: /spec create a task management system with users" and stop.

If the feature already has a `spec.json` with `phase` beyond `"spec"`, warn the user and ask if they want to create a new feature or overwrite.

## Task

1. Load the `speckit-spec-writer` skill to guide your spec creation
2. Scan `.opencode/spec-memory/constitution.md` to check if a constitution exists
3. If no constitution exists, suggest creating one using the `speckit-constitution` skill — ask the user first rather than creating it automatically
4. Ask the user clarifying questions if the description is ambiguous
5. Call the `speckit-scaffold` tool with:
   - `featureName`: the user's description
   - `template`: `"spec"`
6. Fill in the spec content according to the skill's guidance, writing to the file created by the tool
7. Mark ambiguous areas with `[NEEDS CLARIFICATION]`

## Rules

- Focus on WHAT and WHY, never HOW
- Prioritize user stories as P1 (MVP), P2 (important), P3 (nice to have)
- Write Gherkin scenarios for each acceptance criterion
- Mark ambiguous areas with `[NEEDS CLARIFICATION]`
- Each P1 story must be independently shippable
- Include edge cases explicitly

## User's feature description

$ARGUMENTS
