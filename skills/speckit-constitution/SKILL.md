---
name: speckit-constitution
description: Create or update project governing principles and development guidelines
license: MIT
compatibility: opencode
metadata:
  phase: 0
  workflow: sdd
---

## What I do

Create a project constitution — the foundational governing principles that guide all technical decisions, implementation choices, and code quality standards throughout the project.

## When to use me

Use this skill FIRST, before any specification or planning. Every project needs a constitution before any code is written. If the project already has a constitution, I review and refine it.

## How to use me

### Step 0: Phase Gate

Before starting, call `speckit-audit` to detect existing project issues. If the audit reports errors, inform the user and resolve them before creating a constitution.

### Step 1: Load Context

Read the project's AGENTS.md and existing context.

1. Read domain map from `.opencode/domain-map.md` (if exists) for domain-specific terminology and constraints
2. Read steering context: `product.md`, `tech.md`, `structure.md` in `.opencode/steering/` (if exists)
3. Scan `specs/*/spec.json` to understand current project state and phase
4. Ask clarifying questions about project preferences
5. Create or update `.opencode/spec-memory/constitution.md`
6. Validate each article against the project's real needs

## Constitution template

Load the default articles from `~/.config/opencode/templates/constitution-template.md`.
Use `speckit-scaffold` with `template: "constitution"` to scaffold a new constitution.

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

## Quality checklist

- [ ] All 6 articles are present (I-VI)
- [ ] Each article has a clear principle statement
- [ ] Each article has "Why" rationale
- [ ] Project-specific notes are filled (not placeholder text)
- [ ] Steering context was loaded (or gracefully skipped)
- [ ] Constitution is consistent with existing spec.json states

## Reference

Template: `~/.config/opencode/templates/constitution-template.md`
Tool: `speckit-scaffold` (call with `template: "constitution"`)
Steering context: `.opencode/steering/` (product.md, tech.md, structure.md)

## Output location

`.opencode/spec-memory/constitution.md`
