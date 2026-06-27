# SDD Workflow — Spec-Driven Development

## Language

All artifacts (specs, plans, tasks, comments) are generated in English by default.
Commands, skill instructions, and system logic remain in English.
To change the output language, edit this section and update the prompt instructions accordingly.

---

## Workflow — Strict Order

You MUST follow this order. Never skip a phase.

1. **Constitution** — Project governing principles. Suggested by `/spec` if missing.
2. **Specification** (`/spec <desc>`) — Define WHAT and WHY. No implementation details.
3. **Planning** (`/plan <stack>`) — Map requirements to technology. Apply Constitution Gates.
4. **Tasks** (`/tasks`) — Break plan into actionable tasks with dependencies.
5. **Review** (`/review`) — Check cross-artifact consistency before implementation.
6. **Implementation** (`/impl`) — Execute tasks in dependency order.

Support: `/status` — show concise current phase and next step.

---

## Quality Gates — Non-Negotiable

### Simplicity Gate
Maximum 3 top-level projects. No future-proofing abstractions.
If in doubt, pick the simplest option. Build what is needed now, not what might be needed later.

### Anti-Abstraction Gate
Use frameworks directly. No repository patterns, service locators, or wrappers unless the framework explicitly requires them. Direct ORM usage. Direct framework API calls.

### Integration-First Testing
Test against real dependencies (database, API, filesystem). Use testcontainers or equivalent. No mocking of external services. Every user story requires at minimum one integration test covering the happy path.

---

## Commands

### `/spec <description>`
Create a feature specification. Loads `speckit-spec-writer` skill.
Scaffolds `specs/NNN-slug/spec.md` via `speckit-scaffold` tool.
If no constitution exists, suggest creating one.
Focus on WHAT and WHY. Write Gherkin scenarios. Prioritize P1 (MVP) / P2 (important) / P3 (nice to have).
Mark ambiguous areas with `[NEEDS CLARIFICATION]`.

### `/plan <tech stack>`
Create an implementation plan. Loads `speckit-plan-engineer` skill.
Pre-validates: spec must exist.
Creates `specs/NNN-slug/plan.md` plus optional `research.md`, `data-model.md`, `contracts/`.
Apply ALL Constitution Gates before writing. Document rationale for every technology choice.

### `/tasks`
Break plan into tasks. Loads `speckit-task-decomposer` skill.
Pre-validates: spec and plan must exist.
Creates `specs/NNN-slug/tasks.md` with phases, `[P]` parallel markers, and ASCII dependency map.

### `/impl [task-id]`
Execute implementation. Loads `speckit-implementer` skill.
Pre-validates: spec, plan, and tasks must exist.
Executes in dependency order. Run tests after each phase.
If task-id is specified, start from that task.

### `/review`
Review cross-artifact consistency. Loads `speckit-reviewer` skill.
Checks spec quality, plan quality, tasks quality, and cross-references.
Produces a report with severity ratings (HIGH / MED / LOW).

### `/status`
Show workflow state. Uses `speckit-status` tool.
Reports current phase and next step.

### `/clean [--dry-run]`
Scan all features for inconsistencies. Uses `speckit-clean` tool.
Auto-fixes session.json when features are renamed or deleted.
Use `--dry-run` for report only, without fixes.

### `/config [key=key value=val|defaultTechStack=stack]`
Read or update SDD configuration. Uses `speckit-config` tool.
Examples: `/config defaultTechStack=Node.js+PostgreSQL` or `/config key=language value=python`

---

## Agent Roles — Tab-Switchable

### `build` (default) — Tab 1
Full access. Implements code, runs commands, edits files.
Use for: implementation, testing, debugging, refactoring.

### `plan` (built-in) — Tab 2
Read-only. All edits and bash commands require approval.
Use for: architecture review, planning sessions, code analysis without changes.

### `spec` (custom) — Tab 3
Read + skill access. Bash denied. Edit requires approval.
Use for: requirements analysis, specification writing, artifact review.
The `spec` agent has these skills available: `speckit-constitution`, `speckit-spec-writer`, `speckit-plan-engineer`, `speckit-task-decomposer`, `speckit-reviewer`.
It can invoke subagents `@speckit-reviewer` and `@explore`.

Switch with Tab. If you are in the wrong agent for the task, tell the user.

---

## Artifact Locations

```
Constitution:    .opencode/spec-memory/constitution.md
Feature state:   .opencode/spec-memory/session.json

specs/
└── NNN-feature-name/
    ├── spec.md          — Feature specification (required)
    ├── plan.md          — Implementation plan (required)
    ├── tasks.md         — Task breakdown (required)
    ├── research.md      — Technology research (optional)
    ├── data-model.md    — Schema / entities (optional)
    └── contracts/       — API contracts (optional)
```

Templates:  `~/.config/opencode/templates/`
Skills:     `~/.config/opencode/skills/`
Tools:      `~/.config/opencode/tools/`

---

## Available Skills — Load on Demand

| Skill | Phase | Action |
|-------|-------|--------|
| `speckit-constitution` | 0 | Create or update project governing principles |
| `speckit-spec-writer` | 1 | Translate requirements into structured specs |
| `speckit-plan-engineer` | 2 | Map specs to technology decisions |
| `speckit-task-decomposer` | 3 | Break plans into ordered tasks |
| `speckit-implementer` | 4 | Execute tasks in dependency order |
| `speckit-reviewer` | all | Validate cross-artifact consistency |

Call a skill with: `skill({ name: "speckit-spec-writer" })`

---

## Available Tools — Call via Function

| Tool | Purpose | Key Arguments |
|------|---------|---------------|
| `speckit-scaffold` | Create `specs/NNN-name/` or constitution with template | `featureName`, `template` (spec/plan/tasks/constitution), `overwrite` (bool) |
| `speckit-validate` | Check artifact existence and phase | `featureDir` (optional), `command` (optional) |
| `speckit-clean` | Scan all features and report inconsistencies | `fix` (bool, optional) |
| `speckit-config` | Read or update SDD configuration | `key`, `value`, `defaultTechStack` (all optional) |
| `speckit-status` | Report full workflow state | none |

---

## Constitution Template

The constitution template lives in `~/.config/opencode/templates/constitution-template.md`.
Use `speckit-scaffold` with `template: "constitution"` to create one.

---

## Example Walkthrough

```
User: /status
Agent: "No features yet. Run `/spec <description>` to create the first feature."

User: /spec create an invoicing system with users, clients, products, and invoices
Agent: Loads speckit-spec-writer skill. Determines next number (001).
       Creates specs/001-invoicing-system/spec.md via speckit-scaffold.
       "Spec created. Next: /plan <tech stack>"

User: /status
Agent: "spec ok | plan missing | tasks missing. Next: /plan Laravel + MySQL + Tailwind"

User: /plan Laravel + MySQL + Tailwind
Agent: Loads speckit-plan-engineer. Applies Constitution Gates.
       Creates specs/001-invoicing-system/plan.md.
       "Plan created. Next: /tasks"

User: /tasks
Agent: Loads speckit-task-decomposer.
       Creates specs/001-invoicing-system/tasks.md.
       "Tasks created. Ready for implementation: /impl or review with /review"

User: /impl
Agent: Loads speckit-implementer. Executes tasks phase by phase.
       Runs tests after each phase. Reports progress.
       "Implementation complete. Run /review to verify."
```

---

## Concise Output Rule (NON-NEGOTIABLE)

Every agent response and tool output MUST be 1-3 lines maximum. No status tables, no artifact listings, no checkmark trees, no verbose explanations.

**Exception**: `/review` outputs are exempt — they produce structured reports with findings, severity ratings, and recommendations that naturally exceed 3 lines.

### Format

```
[Result] [Next: /command]
```

Examples:
- `"spec.md created in specs/001-task-management/  Next: /plan <tech stack>"`
- `"spec ok | plan missing | tasks missing  Next: /plan <tech stack>"`
- `"Phase: plan | 1 feature(s) | Latest: 001-task-management  Next: /tasks"`

### How it works

- All detailed state is stored in `.opencode/spec-memory/session.json` (read/written by custom tools)
- Read session.json at the start of each interaction to recover context
- Do NOT dump session.json content to the chat
- If the user asks "what did we do so far?", read session.json.history and summarize in 1 line
- Tool results are already minimal; do not elaborate on them
- Never repeat what the tool just said in different words

## Critical Rules

1. NEVER start implementation without spec, plan, AND tasks.
2. If any required artifact is missing, tell the user what is needed and stop.
3. ALWAYS apply Constitution Gates before planning.
4. ALWAYS run tests after each implementation phase.
5. If the user asks for implementation while in the `spec` agent, suggest switching to `build`.
All artifacts are written in English by default.
7. The `[NEEDS CLARIFICATION]` marker means stop and ask the user before proceeding.

---

## Custom Tool Error Handling

Custom tools (`speckit-scaffold`, `speckit-validate`, `speckit-clean`, `speckit-config`, `speckit-status`) are TypeScript files compiled at runtime by opencode. If a tool has compilation errors, opencode may fail to start or crash on each prompt.

### If a tool crashes opencode

1. **Identify the broken file** — opencode will log which tool file failed to compile.
2. **Delete the broken tool file** from `~/.config/opencode/tools/`.
3. **Restart opencode** — it will work without the deleted tool.
4. **Report the issue** so the tool can be fixed:
   - Check the error for the specific line number and TypeScript error code.
   - Common causes: missing `node:` prefix in imports, unused variables, complex type inference.

### Authoring safe tools

- Every custom tool MUST wrap its `execute` body in a `try/catch` that returns a descriptive error string instead of crashing.
- Use `node:fs`, `node:path`, `node:os` import prefixes (`import fs from "node:fs/promises"`).
- Avoid complex type inference patterns (reduce with spread, conditional await chains).
- Prefer simple `for` loops over `.reduce()`, `.filter().map()` chains for type stability.
