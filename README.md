# opencode SDD Kit

[![CI](https://github.com/Nemryz/opencode-sdd-kit/actions/workflows/test.yml/badge.svg)](https://github.com/Nemryz/opencode-sdd-kit/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](#license)
[![Tests](https://img.shields.io/badge/tests-1290-brightgreen.svg)]()
[![Mutation Testing](https://img.shields.io/badge/mutation-80%25-brightgreen.svg)]()
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)]()

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

Mutation Testing. Continuous quality assurance through Stryker mutation testing, ensuring test suites catch real code changes and maintain high mutation scores across all tools.

## Architecture

The system follows a plugin-based architecture where each tool operates as a self-contained TypeScript module registered through the opencode plugin interface. Tools communicate via shared state files (session.json, spec.json, config.json) and coordinate through the orchestration layer defined in AGENTS.md.

```
+-------------------------------------------------------------+
|                    opencode Runtime                         |
+-------------------------------------------------------------+
|  AGENTS.md (Workflow Orchestration)                         |
+-------------------------------------------------------------+
|  Skills Layer (9 skills)                                    |
|  + speckit-constitution                                     |
|  + speckit-spec-writer                                      |
|  + speckit-plan-engineer                                    |
|  + speckit-task-decomposer                                  |
|  + speckit-implementer                                      |
|  + speckit-reviewer                                         |
|  + rules/ (3 shared rule sets)                             |
+-------------------------------------------------------------+
|  Tools Layer (10 TypeScript modules)                        |
|  + speckit-scaffold                                         |
|  + speckit-validate                                         |
|  + speckit-audit                                            |
|  + speckit-clean                                            |
|  + speckit-status                                           |
|  + speckit-config                                           |
|  + speckit-complexity                                       |
|  + speckit-selfheal                                         |
|  + shared/ (io.ts, schemas.ts, types.ts)                   |
+-------------------------------------------------------------+
|  State Layer                                                |
|  + session.json (workflow state)                            |
|  + spec.json (feature metadata)                             |
|  + config.json (SDD configuration)                         |
|  + backups/ (with SHA-256 checksums)                       |
+-------------------------------------------------------------+
```

## Structure

```
~/.config/opencode/
  AGENTS.md              Workflow orchestration and agent definitions
  commands/              CLI command handlers (10 files)
  skills/                Skill instructions (9 skills plus shared rules)
  tools/                 TypeScript plugin tools (10 files)
  tools/shared/          Shared modules (io.ts, schemas.ts, types.ts)
  tools/test/            Test suite (45 test files)
  templates/             Artifact templates (12 templates)
  docs/                  Reference documentation
```

Ten tools live in the tools directory, each one a self-contained TypeScript file registered as an opencode plugin. Three shared modules provide common I/O operations, Zod schemas, and type definitions.

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
| speckit-delta | Manages incremental spec deltas |
| speckit-health | Health monitoring with auto-repair |

Nine skill files in the skills directory guide the agents through each phase. Three shared rule sets in skills/rules/ define design principles, spec writing standards, and task generation guidelines.

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

The resilience layer operates through three mechanisms:

Automatic Backups. Before any write to session.json, spec.json, or config.json, the system reads the existing content and saves it as a timestamped .bak file in the .opencode/backups/ directory. Old backups are trimmed to a maximum of ten per file.

Checksum Verification. Each backup receives a SHA-256 checksum stored in a companion .sha256 file. When restoration is triggered, the system verifies the checksum matches before attempting to restore.

Corruption Detection. Read operations validate JSON structure and Zod schema compliance. Invalid data triggers console warnings with a [SDD] prefix and accumulates in a global warning channel that feeds into audit and status output.

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

Key configuration options:

| Setting | Default | Description |
|---------|---------|-------------|
| defaultTechStack | none | Preferred technology stack for /plan |
| expressMode | false | Skip conversational proposals |
| autoVersioning | true | Automatic version tracking |

## Test Suite

The project includes 1290 automated tests distributed across 45 test files. The test suite covers multiple quality dimensions:

Unit Tests. Individual function testing for all shared modules (io.ts, schemas.ts, types.ts) and tool-specific logic.

Integration Tests. End-to-end workflow testing that validates complete feature lifecycle from spec creation through implementation.

Content Assertion Tests. Verification that skill files, templates, and documentation maintain required structure and content.

Phase Gate Tests. Validation that all commands enforce phase prerequisites and produce correct artifacts.

Concurrency Tests. Multi-threaded testing of file locking mechanisms and concurrent access patterns.

Edge Case Tests. Boundary condition testing including empty inputs, invalid paths, missing directories, and malformed data.

Corruption Recovery Tests. Validation of backup creation, checksum verification, and automatic restoration when state files become corrupted.

Property Based Tests. Generative testing using fast-check to discover edge cases through random input generation.

Fuzzing Tests. Random input injection to identify unexpected failure modes and crash conditions.

Chaos Tests. Fault injection testing to validate system behavior under adverse conditions.

Mutation Tests. Stryker mutation testing that verifies test suites catch real code changes across all 9 source modules.

Run the complete test suite with npm test. Run type checking with npm run typecheck.

Feature specs in the specs directory are intentionally tracked by git to enable full versioning of the specification, plan, and tasks alongside the code.

## Mutation Testing

The project uses Stryker mutation testing to measure test suite effectiveness. Mutation testing introduces small code changes (mutants) and verifies that tests catch them. A high mutation score indicates that tests are sensitive to real code changes.

Source modules under mutation testing:

| Module | Purpose |
|--------|---------|
| shared/io.ts | File I/O operations, backup management, corruption detection |
| shared/schemas.ts | Zod schema definitions for all state files |
| shared/types.ts | Re-exports, phase detection, project validation |
| speckit-scaffold | Feature directory and artifact creation |
| speckit-validate | Artifact existence validation |
| speckit-audit | Project audit with auto-fix capabilities |
| speckit-clean | Inconsistency detection and repair |
| speckit-delta | Incremental spec delta management |
| speckit-health | Health monitoring with auto-repair |

Target thresholds: high >= 80%, low >= 60%. Run mutation testing with npx stryker run.

## Contributing

Contributions are welcome. Please follow these guidelines:

Code Style. Use TypeScript with strict mode enabled. No semicolons, no colons in comments, minimal periods. Commas only for list separation.

Testing. All new features require integration tests. Run npm test and npm run typecheck before committing.

Commit Messages. Use conventional commit format (feat:, fix:, docs:, test:). Keep messages concise and descriptive.

Architecture. Tools must be self-contained. Shared logic belongs in tools/shared/. Avoid circular dependencies.

Documentation. Update README.md when adding features or changing behavior. Keep examples current.

Issues and pull requests are welcome at the GitHub repository.

## License

MIT
