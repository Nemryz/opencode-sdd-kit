# opencode SDD Kit

Spec-Driven Development workflow for opencode, a structured methodology that guides features from their initial specification through to final implementation using sequential artifacts and phase gates. Each phase produces a document, each document unlocks the next step, and no phase can be skipped without validation.

## Capabilities

Constitution. Project governing principles such as Simplicity, Anti-Abstraction, and Integration-First testing, all written into a single markdown file and enforced by the toolchain.

Specification. Feature specifications with prioritized user stories, Gherkin scenarios, acceptance criteria, edge cases, and measurable success metrics.

Planning. Technology stack decisions backed by documented rationale, alternative comparisons, risk analysis, component boundaries, and architecture descriptions.

Task Decomposition. Ordered tasks organized into phases with ASCII dependency maps, parallelization markers, boundary annotations, and explicit deliverable states.

Review. Cross-artifact consistency checks that compare spec, plan, and tasks against each other, producing severity-rated findings with ownership classification.

Implementation. Phase-by-phase execution with integrated testing, sub-agent dispatch for complex tasks, and three routing tiers (simple, standard, complex) based on complexity scoring.

Discovery. Automatic project context detection including package manager identification, framework recognition, config file scanning, and dependency analysis.

Express Mode. An operational shortcut that skips conversational proposals when speed is preferred, controlled by a configuration toggle.

Status and Cleanup. Workflow state tracking with automatic session repair when directories are moved, files are deleted, or spec.json phases fall out of sync with reality.

## Structure

```
~/.config/opencode/
  AGENTS.md              Workflow orchestration and agent definitions
  commands/              CLI command handlers (10 files)
  skills/                Skill instructions (6 skills plus shared rules)
  tools/                 TypeScript plugin tools (7 files)
  templates/             Artifact templates for spec, plan, tasks, constitution
  docs/                  Reference documentation and roadmap
```

Eight tools live in the tools directory, each one a self-contained TypeScript file registered as an opencode plugin: speckit-scaffold, speckit-validate, speckit-audit, speckit-clean, speckit-status, speckit-config, speckit-complexity, and speckit-selfheal. Six skill files in the skills directory guide the agents through each phase. Shared rules for design principles, spec writing, and task generation reside in skills/rules/.

## Installation

1. Install opencode by following the instructions at opencode.ai.

2. Clone or copy this repository into your opencode configuration directory.

   Quick installation method:
   ```
   git clone https://github.com/Nemryz/opencode-sdd-kit.git ~/.config/opencode
   cd ~/.config/opencode && npm install
   ```

   Alternative method that copies individual files:
   ```
   git clone https://github.com/Nemryz/opencode-sdd-kit.git
   cp -r opencode-sdd-kit/* ~/.config/opencode/
   cd ~/.config/opencode && npm install
   ```

3. Restart opencode for the changes to take effect.

4. Run /status from within opencode to verify that everything was installed correctly.

## Usage

```
/status                         Show current workflow state
/spec <description>             Create a feature specification
/plan <tech stack>              Create an implementation plan
/tasks                          Break the plan into actionable tasks
/review                         Check cross-artifact consistency
/impl [task-id]                 Execute implementation tasks
/clean [--dry-run]              Scan and repair inconsistencies
/config key=value               Read or update configuration
```

### Workflow Walkthrough

A typical session moves through the phases in order, each one producing a new artifact and updating the feature's spec.json phase.

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

## Customization

Language preferences. Edit the Language field in AGENTS.md to change the output language used by all agent responses.

Templates. Modify the markdown files in the templates directory to adapt artifact structures to your project conventions.

Tools. Extend or add new TypeScript tools in the tools directory by following the existing plugin pattern. Each tool exports a single default function that registers description, args schema, and execute handler.

Skills. Adjust the SKILL.md files in the skills directory to modify agent behavior for each workflow phase. Shared rules in skills/rules/ apply across multiple skills.

## Test Suite

The project includes 493 automated tests distributed across 24 test files, covering unit tests, integration tests, content assertions for skill files, phase gate verification for all 10 commands, concurrent lock safety, edge case handling for stale locks, status fallback with deleted directories, config tool performance with special characters, clean repair paths, discovery detection for package managers and frameworks, full e2e lifecycle validation from spec through audit, and cold-start bootstrap from an empty directory. Tests run with vitest via npm test.

## Contributing

Issues and pull requests are welcome at the GitHub repository. 

## License

MIT
