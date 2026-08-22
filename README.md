# opencode SDD Kit

Spec-Driven Development workflow for opencode. A structured methodology that guides features from initial specification through final implementation using sequential artifacts and phase gates. Each phase produces a document, each document unlocks the next step, and no phase can be skipped without validation.

## Capabilities

Constitution. Project governing principles such as Simplicity, Anti-Abstraction, and Integration-First testing written into a single markdown file and enforced by the toolchain.

Specification. Feature specifications with prioritized user stories, Gherkin scenarios, acceptance criteria, edge cases, and measurable success metrics.

Planning. Technology stack decisions backed by documented rationale, alternative comparisons, risk analysis, component boundaries, and architecture descriptions.

Task Decomposition. Ordered tasks organized into phases with ASCII dependency maps, parallelization markers, boundary annotations, and explicit deliverable states.

Review. Cross-artifact consistency checks that compare spec, plan, and tasks against each other, producing severity-rated findings with ownership classification.

Implementation. Phase-by-phase execution with integrated testing, sub-agent dispatch for complex tasks, and three routing tiers (simple, standard, complex) based on complexity scoring.

Discovery. Automatic project context detection including package manager identification, framework recognition, config file scanning, and dependency analysis.

Express Mode. An operational shortcut that skips conversational proposals when speed is preferred, controlled by a configuration toggle.

Status and Cleanup. Workflow state tracking with automatic session repair when directories are moved, files are deleted, or spec.json phases fall out of sync with reality.

Resilience. Automatic backups with SHA-256 checksum verification, corruption detection with warning channels, and auto-restore from valid backups when state files become unreadable.

## Structure

```
~/.config/opencode/
  AGENTS.md              Workflow orchestration and agent definitions
  commands/              CLI command handlers (10 files)
  skills/                Skill instructions (6 skills plus shared rules)
  tools/                 TypeScript plugin tools (8 files)
  templates/             Artifact templates for spec, plan, tasks, constitution
  docs/                  Reference documentation
```

Eight tools live in the tools directory, each one a self-contained TypeScript file registered as an opencode plugin.

| Tool | Purpose |
|------|---------|
| speckit-scaffold | Creates feature directories and artifact files |
| speckit-validate | Validates required SDD artifacts exist |
| speckit-audit | Comprehensive project audit with auto-fix |
| speckit-clean | Scans and repairs inconsistencies |
| speckit-status | Shows workflow state across all features |
| speckit-config | Reads and writes SDD configuration |
| speckit-complexity | Assesses task complexity for routing |
| speckit-selfheal | Health scan with categorized findings |

Six skill files in the skills directory guide the agents through each phase. Shared rules for design principles, spec writing, and task generation reside in skills/rules/.

## Installation

Install opencode by following the instructions at opencode.ai.

Clone this repository into your opencode configuration directory.

```
git clone https://github.com/Nemryz/opencode-sdd-kit.git ~/.config/opencode
cd ~/.config/opencode && npm install
```

Alternative installation scripts are provided for each platform.

Windows PowerShell.

```
irm https://raw.githubusercontent.com/Nemryz/opencode-sdd-kit/main/install.ps1 | iex
```

Linux or macOS.

```
curl -fsSL https://raw.githubusercontent.com/Nemryz/opencode-sdd-kit/main/install.sh | bash
```

Restart opencode for the changes to take effect. Run /status to verify that everything was installed correctly.

## Usage

```
/status                         Show current workflow state
/spec <description>             Create a feature specification
/plan <tech stack>              Create an implementation plan
/tasks                          Break the plan into actionable tasks
/review                         Check cross-artifact consistency
/impl [task-id]                 Execute implementation tasks
/steering [description]         Create or update steering context
/audit [--fix]                  Run comprehensive project audit
/clean [--fix]                  Scan and repair inconsistencies
/config key=value               Read or update configuration
```

### Workflow Walkthrough

A typical session moves through the phases in order, each one producing a new artifact and updating the feature spec.json phase.

```
> /status
No features yet. Run /spec <description> to create the first feature.

> /spec create a task management system with users and projects
Agent creates specs/001-task-management/spec.md.
spec.md created. Next: /plan <tech stack>

> /plan Node.js + PostgreSQL + React
Agent creates specs/001-task-management/plan.md.
plan.md created. Next: /tasks

> /tasks
Agent creates specs/001-task-management/tasks.md.
tasks.md created. Ready: /impl or /review

> /review
Agent checks spec, plan, and tasks for consistency.
Review complete, 0 issues found. Ready for /impl
```

### Resilience

Every write operation creates a backup of the previous state. Backups include SHA-256 checksums for integrity verification. When a state file becomes corrupted, the system automatically attempts to restore from the most recent valid backup. If restoration fails, corruption warnings appear in audit and status output so you can investigate manually.

### Express Mode

Express Mode skips the conversational proposal step in spec writing and plan engineering. Enable it with.

```
/config expressMode=true
```

When active, skills proceed directly to artifact generation without asking for confirmation first.

### Complexity Routing

The implementer evaluates each task and routes it through one of three tiers. Simple tasks go directly to implementation. Standard tasks follow the TDD cycle. Complex tasks dispatch sub-agents for parallel work. The complexity score considers file count, dependency changes, boundary annotations, and ambiguity markers.

## Configuration

Copy opencode.jsonc.example to opencode.jsonc and set your preferred model and permissions. Use /config within opencode to manage SDD-specific settings like default tech stack, express mode, and auto versioning.

## Test Suite

The project includes 732 automated tests distributed across 28 test files. Coverage spans unit tests, integration tests, content assertions for skill files, phase gate verification for all commands, concurrent lock safety, edge case handling, corruption recovery, and full end-to-end lifecycle validation. Tests run with vitest via npm test.

Feature specs in the specs directory are intentionally tracked by git to enable full versioning of the specification, plan, and tasks alongside the code.

## Contributing

Issues and pull requests are welcome at the GitHub repository.

## License

MIT
