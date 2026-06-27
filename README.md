# opencode SDD Kit

**Spec-Driven Development** workflow for [opencode](https://opencode.ai) — a structured, artifact-driven methodology to build features from specification to implementation.

## Features

- **Constitution** — Project governing principles (Simplicity, Anti-Abstraction, Integration-First testing)
- **Specification** — Feature specs with user stories, Gherkin scenarios, and success criteria
- **Planning** — Tech stack decisions with rationale, risk analysis, and architecture
- **Task Decomposition** — Ordered tasks with dependency maps and parallel markers
- **Review** — Cross-artifact consistency checks with severity ratings
- **Implementation** — Phase-by-phase execution with integrated testing
- **Status & Cleanup** — Track workflow state and repair session inconsistencies

## Structure

```
~/.config/opencode/
├── AGENTS.md              — Workflow orchestration
├── agents/
│   └── spec.md            — Specification agent definition
├── commands/              — CLI command handlers (8 files)
├── skills/                — Skill instructions (6 skills)
├── tools/                 — TypeScript plugin tools (5 files)
└── templates/             — Artifact templates (4 files)
```

## Installation

1. Install [opencode](https://opencode.ai/docs/installation)
2. Copy these files into your `~/.config/opencode/` directory:

```bash
# Clone the repository
git clone https://github.com/Nemryz/opencode-sdd-kit.git

# Copy configuration files
cp -r opencode-sdd-kit/AGENTS.md ~/.config/opencode/
cp -r opencode-sdd-kit/commands ~/.config/opencode/
cp -r opencode-sdd-kit/skills ~/.config/opencode/
cp -r opencode-sdd-kit/tools ~/.config/opencode/
cp -r opencode-sdd-kit/templates ~/.config/opencode/
cp -r opencode-sdd-kit/agents ~/.config/opencode/
```

3. Restart opencode
4. Run `/status` to verify installation

## Usage

```bash
/status                              # Show current workflow state
/spec <feature description>          # Create a feature specification
/plan <tech stack>                   # Create an implementation plan
/tasks                               # Break plan into tasks
/review                              # Check cross-artifact consistency
/impl [task-id]                      # Execute implementation
/clean [--dry-run]                   # Scan for inconsistencies
/config key=language value=es        # Configure preferences
```

### Example

```
> /status
"No features yet. Run /spec <description> to create the first feature."

> /spec create a task management system with users and projects
Agent: Creates specs/001-task-management/spec.md
"spec.md created. Next: /plan <tech stack>"

> /plan Node.js + PostgreSQL + React
Agent: Creates specs/001-task-management/plan.md
"plan.md created. Next: /tasks"

> /tasks
Agent: Creates specs/001-task-management/tasks.md
"tasks.md created. Ready: /impl or /review"

> /review
Agent: Checks spec ↔ plan ↔ tasks consistency
"Review complete: 0 issues. Ready for /impl"
```

## Customization

- **Language**: Edit the `Language` section in `AGENTS.md` to change output language
- **Templates**: Modify files in `~/.config/opencode/templates/` to match your project style
- **Tools**: Extend or modify TypeScript tools in `~/.config/opencode/tools/`

## License

MIT

## Contributing

Issues and pull requests welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.
