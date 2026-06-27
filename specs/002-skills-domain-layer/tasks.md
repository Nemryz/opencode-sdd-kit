# Tasks: Skills Domain Layer

## Dependency Map

```
T-001
  ├── T-002 [P]
  ├── T-003 [P]
  ├── T-004 [P]
  ├── T-005 [P]
  └── T-006 [P]
        └── T-007
```

## Phase 1: Setup

### T-001 Create shared rules directory
- **Story**: 1 (Shared Rules)
- **File**: `skills/rules/spec-writing.md`, `skills/rules/design-principles.md`, `skills/rules/tasks-generation.md`
- **Deliverable**: 3 rule files with boundary conventions, acceptance criteria format, and phase structure
- **Dependencies**: none

## Phase 2: Foundational — Skill Upgrades [P]

### T-002 [P] Upgrade speckit-spec-writer
- **Story**: 2, 3, 4 (Context Injection, Conversational, Safety)
- **File**: `skills/speckit-spec-writer/SKILL.md`
- **Deliverable**: Rewrite with steering context reading, conversational flow, boundary candidates, Safety & Fallback
- **Dependencies**: T-001

### T-003 [P] Upgrade speckit-plan-engineer
- **Story**: 2, 3, 4, 6 (Context, Conversational, Safety, Sub-agents)
- **File**: `skills/speckit-plan-engineer/SKILL.md`
- **Deliverable**: Rewrite with sub-agent research, decision docs with alternatives, immutable plan, Safety & Fallback
- **Dependencies**: T-001

### T-004 [P] Upgrade speckit-task-decomposer
- **Story**: 4, 5 (Safety, Boundaries)
- **File**: `skills/speckit-task-decomposer/SKILL.md`
- **Deliverable**: Rewrite with `_Boundary:_` and `_Depends:_` annotations, task-graph sanity review, Safety & Fallback
- **Dependencies**: T-001

### T-005 [P] Upgrade speckit-implementer
- **Story**: 4 (Safety)
- **File**: `skills/speckit-implementer/SKILL.md`
- **Deliverable**: Rewrite with sub-agent dispatch (implementer + reviewer + debugger), TDD cycle, bounded debug, Safety & Fallback
- **Dependencies**: T-001

### T-006 [P] Upgrade speckit-reviewer
- **Story**: 4, 5 (Safety, Boundaries)
- **File**: `skills/speckit-reviewer/SKILL.md`
- **Deliverable**: Rewrite with boundary audit, ownership classification, verify protocol, Safety & Fallback
- **Dependencies**: T-001

## Phase 3: Polish

### T-007 Update speckit-constitution
- **Story**: 2 (Context)
- **File**: `skills/speckit-constitution/SKILL.md`
- **Deliverable**: Minor update to reference domain-map.md and steering context
- **Dependencies**: T-002, T-003, T-004, T-005, T-006
