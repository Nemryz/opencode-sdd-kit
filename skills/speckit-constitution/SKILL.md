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

1. Read the project's AGENTS.md and existing context
2. Read domain map from `.opencode/domain-map.md` (if exists) for domain-specific terminology and constraints
3. Read steering context: `product.md`, `tech.md`, `structure.md` in `.opencode/steering/` (if exists)
4. Optionally scan `specs/*/spec.json` to understand current project state and phase
5. Ask clarifying questions about project preferences
6. Create or update `.opencode/spec-memory/constitution.md`
7. Validate each article against the project's real needs

## Constitution template

Load the default articles from `~/.config/opencode/templates/constitution-template.md`.
Use `speckit-scaffold` with `template: "constitution"` to scaffold a new constitution.

## Output format

Write the constitution to `.opencode/spec-memory/constitution.md` with all articles, including project-specific notes under each one. Use checkboxes for items that need project-specific decisions.
