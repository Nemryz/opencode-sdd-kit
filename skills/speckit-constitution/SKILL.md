---
name: speckit-constitution
description: Create or update project governing principles and development guidelines
license: MIT
compatibility: opencode
metadata:
  phase: 0
  workflow: sdd
  shared-rules: design-principles.md
---

## What I do

Create a project constitution — the foundational governing principles that guide all technical decisions, implementation choices, and code quality standards throughout the project.

## When to use me

Use this skill FIRST, before any specification or planning. Every project needs a constitution before any code is written. If the project already has a constitution, I review and refine it.

## How to use me

### Step 0: Phase Gate

Before starting, call `speckit-audit` to detect existing project issues. If the audit reports errors, inform the user and resolve them before creating a constitution.

Then read the existing constitution (if any) from `.opencode/spec-memory/constitution.md`. If it exists, skip to the conversational proposal with suggested refinements instead of creating from scratch.

### Step 1: Load Context

Read the project's AGENTS.md and existing context.

1. Read domain map from `.opencode/domain-map.md` (if exists) for domain-specific terminology and constraints
2. Read steering context: `product.md`, `tech.md`, `structure.md` in `.opencode/steering/` (if exists)
3. Scan `specs/*/spec.json` to understand current project state and phase
4. Load shared rules from `skills/rules/design-principles.md` to align constitution with project standards
5. Ask clarifying questions about project preferences
6. Create or update `.opencode/spec-memory/constitution.md`
7. Validate each article against the project's real needs

### Step 2: Conversational Proposal (NEW)

Before creating or updating the constitution, propose the structure to the user:

```
## Proposed Constitution: <project-name>

### Articles
I. Purpose and Scope — <domain and boundaries>
II. Technology Principles — <stack preferences>
III. Architecture Guidelines — <structure rules>
IV. Code Quality Standards — <conventions>
V. Process and Workflow — <how work happens>
VI. Learning and Adaptation — <evolution rules>

### Boundary Map
- `_Boundary: Constitution_` → defines governing principles, not implementation details
- `_Boundary: Steering_` → captures project context separate from principles
- `_Boundary: Specs_` → feature specifications governed by constitution

### Confirmation
Does this article structure look right for your project? I will create the constitution after confirmation.
```

Wait for user confirmation before proceeding to writing.

### Step 3: Write Constitution

1. Load the default articles from `~/.config/opencode/templates/constitution-template.md`
2. Call `speckit-scaffold` with `template: "constitution"` to scaffold the file
3. Fill in each article with project-specific content
4. Add `_Boundary:_` annotations to relevant articles
5. Update spec.json to mark constitution as generated

**Sub-agent dispatch (optional, for complex projects):**
If the project context is large or ambiguous, dispatch sub-agents:
1. **`@explore` sub-agent**: Researches codebase patterns, team conventions, existing configs
2. **`@spec-writing` sub-agent** (future): Verifies constitution aligns with spec-writing rules from `skills/rules/spec-writing.md`

## Constitution template

The default template contains 6 articles. Customize each for the project.

## Output format

Write the constitution to `.opencode/spec-memory/constitution.md` with all articles, including project-specific notes under each one. Use checkboxes for items that need project-specific decisions.

## Safety & Fallback

### Error: No project context available
- **Stop**: Cannot write meaningful constitution without project context
- **Recovery**: Ask the user for project name, domain, and team composition

### Error: Template file missing
- **Stop**: If `speckit-scaffold` fails to load constitution template
- **Recovery**: Use inline article structure as fallback, report the missing template path

### Error: Conflicting steering context
- **Warning**: Steering documents contradict each other (e.g., tech.md says React, structure.md says Vue)
- **Recovery**: Flag contradictions to user, ask for resolution before proceeding

### Error: Boundary overlap between constitution and steering
- **Stop**: `_Boundary: Constitution_` overlaps with `_Boundary: Steering_` content
- **Recovery**: Clarify that constitution holds principles, steering holds project context

## Quality checklist

- [ ] Conversational proposal made (or skipped in auto mode)
- [ ] Shared rules loaded from `skills/rules/`
- [ ] All 6 articles are present (I-VI)
- [ ] Each article has a clear principle statement
- [ ] Each article has "Why" rationale
- [ ] Project-specific notes are filled (not placeholder text)
- [ ] Boundary annotations (`_Boundary:_`) used for constitution scope
- [ ] `@mention` syntax used for sub-agent dispatch when applicable
- [ ] Steering context was loaded (or gracefully skipped)
- [ ] Constitution is consistent with existing spec.json states

## Reference

Template: `~/.config/opencode/templates/constitution-template.md`
Tool: `speckit-scaffold` (call with `template: "constitution"`)
Shared rules: `skills/rules/design-principles.md`
Steering context: `.opencode/steering/` (product.md, tech.md, structure.md)
Sub-agents: `@explore`

## Output location

`.opencode/spec-memory/constitution.md`
