# Plan: Skills Domain Layer

> Based on research of cc-sdd (3.5K★), Dijjo10 sdd-opencode, and OpenSpec patterns.

## Tech Stack

- **Format**: Markdown SKILL.md files (native opencode skill format)
- **Rules system**: metadata.shared-rules frontmatter field
- **Sub-agents**: opencode Task tool with subagent_type `general`
- **Steering context**: Flat files in `.opencode/domain-map.md`
- **Templates**: `~/.config/opencode/templates/` directory

## Architecture

### Current state (before)
```
skills/
├── speckit-constitution/  →  flat, 33 lines, no context injection
├── speckit-spec-writer/   →  flat, 52 lines, no steering context
├── speckit-plan-engineer/ →  flat, 73 lines, no sub-agents
├── speckit-task-decomposer/ →  flat, 93 lines, no boundaries
├── speckit-implementer/   →  flat, 73 lines, no sub-agent dispatch
└── speckit-reviewer/      →  flat, 81 lines, no ownership
```

### Target state (after)
```
skills/
├── rules/                          # NUEVO — shared rules
│   ├── spec-writing.md
│   ├── design-principles.md
│   └── tasks-generation.md
├── speckit-constitution/SKILL.md   # Minor: domain-map integration
├── speckit-spec-writer/SKILL.md    # Steering + conversational + boundaries
├── speckit-plan-engineer/SKILL.md  # Sub-agents + immutable + decisions
├── speckit-task-decomposer/SKILL.md # Boundary annotations + graph review
├── speckit-implementer/SKILL.md    # Sub-agent dispatch + TDD + bounded debug
└── speckit-reviewer/SKILL.md       # Boundary audit + ownership + verify
```

### Simplicity Gate decisions

| Decision | Rationale |
|----------|-----------|
| 6 skills, not 17 | Keeps starter kit manageable. cc-sdd's 17-skill model is overkill for first-time SDD users. |
| One `rules/` directory | Simpler than cc-sdd's per-skill `rules/` + global `settings/`. All shared rules in one place. |
| Sub-agent via Task tool | Uses opencode's built-in mechanism, no external dependencies. |
| spec.json for phase tracking | Single JSON file per feature. Lighter than cc-sdd's SQLite or spec.json + approvals model. |

### Anti-Abstraction Gate
- Skills are plain Markdown files, no build step, no transpilation
- Sub-agents use opencode's native Task tool API directly
- No wrapper around opencode's skill loading mechanism

### Integration-First Testing
- No mocking: test skills by invoking them in a real opencode session
- Verify by loading skills and checking their behavior manually (since no automated skill test framework exists for opencode)

## Risks

| Risk | Mitigation |
|------|-----------|
| `metadata.shared-rules` not supported by opencode | Fallback: inline rules in each skill manually |
| Sub-agent dispatch unstable | Implement sequential fallback in each skill |
| spec.json not used by existing tools | Skills self-manage the file; tools can read it later |
