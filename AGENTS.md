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

### Optional: Clarify Phase
If the spec contains `[NEEDS CLARIFICATION]` markers, insert a dedicated **Clarify** step between /spec and /plan. The agent stops, presents each ambiguity to the user, and resolves all markers before proceeding to planning. This prevents cascading bad assumptions.

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

### `/steering [description]`
Create or update steering context documents. Loads `speckit-scaffold` tool with `template: "steering"`.
Creates `product.md`, `tech.md`, `structure.md` in `.opencode/steering/`.
All SDD skills load steering context automatically if it exists.

### `/spec <description>`
Create a feature specification. Loads `speckit-spec-writer` skill.
Scaffolds `specs/NNN-slug/spec.md` via `speckit-scaffold` tool.
If no constitution exists, suggest creating one. If no steering context exists, suggest `/steering`.
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

### `/clean`
Scan all features for inconsistencies. Uses `speckit-clean` tool.
Use `--fix` to auto-repair phase mismatches and stale session references.
Without `--fix`, runs as read-only report.

### `/audit [--fix]`
Run a comprehensive project audit for phase consistency and artifact health. Uses `speckit-audit` tool.
Reports error, warning, and info findings with severity ratings.
Use `--fix` to auto-repair phase mismatches in spec.json.

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

### Agent Model Tiers (Recommended)

For better cost/quality ratio, assign different models to different agents in your opencode.json:

| Agent | Model | Why |
|-------|-------|-----|
| `build` | Fast model (e.g., gpt-4o-mini, claude-haiku) | Rapid iteration, code generation |
| `plan` | Heavy reasoner (e.g., gpt-4o, claude-sonnet) | Architecture decisions, risk analysis |
| `spec` | Heavy reasoner (e.g., gpt-4o, claude-sonnet) | Requirements analysis, writing artifacts |

Example opencode.json config:
```
{
  "agents": {
    "build": { "model": "fast-model" },
    "plan":  { "model": "heavy-reasoner" },
    "spec":  { "model": "heavy-reasoner" }
  }
}
```

---

## Artifact Locations

```
Constitution:    .opencode/spec-memory/constitution.md
Feature state:   .opencode/spec-memory/session.json
Domain map:      .opencode/domain-map.md           — Glossary of domain terms (optional)
Steering:
  product.md     .opencode/steering/product.md     — Product context (optional)
  tech.md        .opencode/steering/tech.md        — Tech stack & ADRs (optional)
  structure.md   .opencode/steering/structure.md   — Code conventions (optional)
Shared types:    .opencode/artifacts.schema.json   — JSON Schema for all artifacts (optional)

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
| `speckit-scaffold` | Create `specs/NNN-name/`, constitution, or steering with template | `featureName`, `template` (spec/plan/tasks/constitution/steering), `overwrite` (bool) |
| `speckit-validate` | Check artifact existence and phase | `featureDir` (optional), `command` (optional) |
| `speckit-audit` | Run comprehensive project audit | `fix` (bool, optional) |
| `speckit-clean` | Scan all features and report inconsistencies | `fix` (bool, optional) |
| `speckit-config` | Read or update SDD configuration | `key`, `value`, `defaultTechStack` (all optional) |
| `speckit-status` | Report full workflow state | none |
| `speckit-complexity` | Assess task complexity for routing | `taskDescription`, `filesAffected`, `hasNewDependencies`, `hasBoundaryAnnotations`, `hasNeedsClarification`, `useProjectContext` |

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
       Checks steering context — if missing, suggests /steering first.
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
6. All artifacts are written in English by default.
7. The `[NEEDS CLARIFICATION]` marker means stop and ask the user before proceeding.

---

## Custom Tool Error Handling

Custom tools (`speckit-scaffold`, `speckit-validate`, `speckit-audit`, `speckit-clean`, `speckit-config`, `speckit-status`, `speckit-complexity`) are TypeScript files compiled at runtime by opencode. If a tool has compilation errors, opencode may fail to start or crash on each prompt.

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

---

## Known Regression History

### R-1: TEMPLATES_DIR using os.homedir() instead of module-relative path

**Introduced in:** `5cd31f2` (scaffold robustness fix)
**Fixed in:** `797f1af`

The template directory was resolved as `os.homedir() + "/.config/opencode/templates"`, which only works when the kit is cloned at `~/.config/opencode/`. On CI, other dev machines, or any clone outside the config directory, `readTemplate()` would always return `null`.

**Root cause:** The original code used a relative path (`path.resolve(__dirname, "..", "templates")`) which was incorrectly replaced with an absolute os.homedir() path.

**Fix:** Resolve relative to `import.meta.dirname` first, with os.homedir() as fallback.

**Test coverage:** `scaffold.test.ts` verifies real template content (Article I, Article II) loads from the correct path.

### R-2: isValidProjectRoot deadlock — constitution cannot bootstrap a new project

**Introduced in:** `060e469` (scaffold race condition fix)
**Fixed in:** current

`isValidProjectRoot` requires `.opencode/spec-memory/` to exist, but the only code path that creates that directory is constitution scaffolding — which also calls `isValidProjectRoot` and rejects the operation on a fresh directory.

**Root cause:** The project root validation was changed from a blacklist ("deny if inside ~/.config/opencode") to a whitelist ("must have .opencode/spec-memory/"), without exempting the bootstrap command.

**Fix:** Exempt `template: "constitution"` from the `isValidProjectRoot` check in `speckit-scaffold.ts`.

**Test coverage:** `cold-start.test.ts` (11 tests) verifies the full bootstrap sequence from an empty directory with no pre-created spec-memory.

### R-3: Test helpers must not hide production preconditions

**First identified in:** R-2 investigation

The `createTempWorktree()` helper in `tools/test/helpers/setup.ts` pre-creates `.opencode/spec-memory/`, which means no test exercises the real cold-start path. This hid the R-2 deadlock through 493 tests.

**Prevention guideline:** When adding a new test helper, verify it does not silently satisfy a precondition that production code must satisfy on its own. Add at least one test that starts from a truly empty directory without the helper.

### R-4: Approval auto-fix substring collision — message.includes instead of explicit artifact field

**Introduced in:** `babb4ac` (audit auto-fix extension to ready-violation and approval categories)
**Fixed in:** `4101e4d`

The approval auto-fix loop used `finding.message.includes("spec"/"plan"/"tasks")` to decide which approval field to flip. Since `finding.message` includes the feature directory name (e.g., `"001-tasks-view: spec.md exists but spec approval not marked generated"`), a feature named "tasks view" would cause `includes("tasks")` to match on **all** approval findings for that feature, not just the tasks one.

**Root cause:** No explicit discriminator field on the `AuditFinding` interface; the fix logic relied on substring matching against a human-readable message that contained unrelated data (the directory name).

**Fix:** Added `artifact?: "spec" | "plan" | "tasks"` to `AuditFinding`, set at creation time in `auditFeature()`, and switched the fix loop from `finding.message.includes("spec")` to `finding.artifact === "spec"`.

**Test coverage:** `audit.test.ts` (29 tests) includes a regression test that creates feature `001-tasks-view` with only `spec.md` and verifies `--fix` does not overcorrect `approvals.tasks.generated`.

---

## Test Patterns

### Cold start bootstrap

Every new project follows the same entry path: `mkdir` → `git clone` → `opencode` → constitution → spec → plan → tasks. The `cold-start.test.ts` suite replicates this exact sequence starting from a raw `mkdtemp()` with no pre-created state. When adding new preconditions that require `.opencode/` subdirectories, add a corresponding cold-start test variant.

### Fallback template placeholders

Every scaffold fallback text MUST include its corresponding placeholder variable (`[PROJECT NAME]`, `[FEATURE NAME]`) so that `replace()` calls in production code produce the correct output. Files that reference the project name (`constitution`, `steering`, `domain-map`) use `[PROJECT NAME]`. Files that reference a feature (`data-model`, `research`) use `[FEATURE NAME]`. The `scaffold-fallback.test.ts` suite verifies each fallback contains the right placeholder.

### High risk boundary tests

High risk categories (C-1 through C-7 in `high-risk.test.ts`) cover cross-tool resilience: no worktree, corrupt JSON, invalid project root, ghost spec.json without its directory, concurrent scaffold calls, stale locks, and truncated session.json. These tests exercise every tool against the same failure scenario in a single describe block, so a single change to `isValidProjectRoot`, `readSpecJson`, or `readSession` is caught regardless of which tool calls it.

### Integration first, not unit first

Tests should hit real dependencies (filesystem, JSON files, directories). Mocks and pure-unit tests are reserved for pure functions like `slugify`, `parseNNN`, and `detectPhase`. Anything that reads or writes state must go through the real filesystem in a temp directory. This aligns with the Integration-First testing gate in the constitution.

### Zod schema validation for all JSON state files

Every `read*` function that parses a JSON file from disk MUST validate via Zod `safeParse` and return a safe fallback on failure. The pattern is:

1. Define an exported Zod schema object (e.g. `SessionStateSchema`, `SpecJsonSchema`, `ConfigSchema`)
2. Call `schema.safeParse(merged)` where `merged = { ...DEFAULT, ...parsed }`
3. On `result.success`, return **`result.data`** (NOT `merged`) to ensure Zod-stripped clean output
4. On failure, `console.warn` the ZodError and return the default object

This was regressed in `readConfig` (returned `merged` instead of `result.data`) and fixed in commit `5ad4beb`.

### CI must use `npm ci`, not `npm install`

All CI workflows MUST use `npm ci` instead of `npm install --ignore-scripts`. The `npm ci` command is stricter — it installs exactly from `package-lock.json` and fails if the lockfile is out of sync with `package.json`. This guarantees reproducible builds across platforms and avoids CI-only failures.

### Display-only phases must not be persisted to session.json

Tools that compute transient display values (e.g. `validateTool` returning `"empty"`, `statusTool` returning `"none"` or `"unknown"`) MUST NOT write those values to `s.phase` in session.json. The `SessionStateSchema.phase` enum only allows `"init"`, `"spec"`, `"plan"`, `"tasks"`, `"ready"`, `"impl"`, `"complete"`. Persisting a display value causes subsequent `readSession` to fail validation and return `DEFAULT_SESSION`, silently destroying the user's session state.

Fix: guard with `if (phase !== "empty")` (validate) or `if (phase !== "none" && phase !== "unknown")` (status).

### Flaky parallel filesystem tests

Tests using `Promise.all` with concurrent filesystem operations (directory creation, file locking) are inherently flaky across platforms. The C-5 test was changed from `Promise.all` to sequential calls after macOS CI failures. For parallel contention tests, use `Promise.allSettled` with tolerant assertions (e.g., `expect(successCount).toBeGreaterThanOrEqual(1)`) rather than strict `expect(r1.title).not.toBe("Error")`.

### Explicit discriminator fields on fixable findings

When a fix loop needs to distinguish between multiple sub-items (e.g., spec/plan/tasks approvals), add an explicit discriminator field to the finding interface (e.g., `artifact?: "spec" | "plan" | "tasks"`) rather than string-sniffing on the human-readable message. String matching on `finding.message.includes("spec")` is fragile because the message includes the feature directory name, which may contain the same substrings. Set the discriminator at creation time and switch on it in the fix loop.

**Reproduced in:** `speckit-audit.ts` approval auto-fix (commit `4101e4d`): `finding.artifact === "spec"` replaced `finding.message.includes("spec")`.

**Test pattern:** Create a feature whose name contains a phase word (e.g., "tasks view" → `001-tasks-view`), set only `spec.md`, unmark approvals, run `--fix`, and assert that only `approvals.spec.generated` flips to `true` while `approvals.tasks.generated` stays `false`.
