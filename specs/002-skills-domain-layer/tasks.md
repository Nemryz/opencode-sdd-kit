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

T-008
  ├── T-009 [P]
  ├── T-010 [P]
  ├── T-011 [P]
  └── T-012 [P]
        └── T-013 ─── T-014
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

## Phase 4: spec.json Foundation — Tools [P]

### T-008 Create spec.json schema and template
- **Story**: 7 (Phase Tracking)
- **File**: `templates/spec-json-template.md`, `tools/speckit-scaffold.ts` (schema constant)
- **Deliverable**: spec.json schema defined as constant in scaffold; template file created; format matches cc-sdd pattern with `phase`, `approvals`, `updated_at`
- **Dependencies**: none

### T-009 [P] Update speckit-scaffold to create spec.json
- **Story**: 7 (Phase Tracking)
- **File**: `tools/speckit-scaffold.ts`
- **Deliverable**: On scaffold (`spec`/`plan`/`tasks`), scaffold also writes `spec.json` with `phase`, `created_at`, `updated_at`, `approvals` (all `false`), `ready_for_implementation: false`
- **Dependencies**: T-008

### T-010 [P] Update speckit-validate to read spec.json as primary phase
- **Story**: 7 (Phase Tracking)
- **File**: `tools/speckit-validate.ts`
- **Deliverable**: `speckit-validate` reads `spec.json` phase instead of doing file-detection-only. Falls back to file detection if spec.json missing. Reports mismatch between spec.json phase and reality.
- **Dependencies**: T-008

### T-011 [P] Update speckit-status for multi-feature dashboard from spec.json
- **Story**: 7 (Phase Tracking)
- **File**: `tools/speckit-status.ts`
- **Deliverable**: `/status` aggregates ALL features with their phase from each `spec.json`, not just the latest. Each feature shown as `NNN-name (phase)` with total counts per phase.
- **Dependencies**: T-008

### T-012 [P] Update speckit-clean to validate spec.json vs reality
- **Story**: 7 (Phase Tracking)
- **File**: `tools/speckit-clean.ts`
- **Deliverable**: `speckit-clean` reads each `spec.json`, verifies declared artifacts exist, reports mismatches (e.g. spec.json says `phase: ready` but `plan.md` missing). Auto-fix sets phase back to the correct state.
- **Dependencies**: T-008

## Phase 5: Skills & Commands Integration

### T-013 Update all 6 skills to write spec.json after artifact completion
- **Story**: 7 (Phase Tracking)
- **File**: `skills/speckit-spec-writer/SKILL.md`, `skills/speckit-plan-engineer/SKILL.md`, `skills/speckit-task-decomposer/SKILL.md`, `skills/speckit-implementer/SKILL.md`, `skills/speckit-reviewer/SKILL.md`, `skills/speckit-constitution/SKILL.md`
- **Deliverable**: Each skill's "Generate" or "Execute" step writes `spec.json` into the feature directory after completing its artifact. Updates `phase`, `approvals.<artifact>.generated = true`, and `updated_at`. Skills also read spec.json for pre-validation gates (check `approvals` before proceeding).
- **Dependencies**: T-009, T-010

### T-014 Update commands to pass spec.json context and enforce phase gates
- **Story**: 7 (Phase Tracking)
- **File**: `commands/spec.md`, `commands/plan.md`, `commands/tasks.md`, `commands/impl.md`
- **Deliverable**: Each command's pre-validation step reads spec.json and enforces the phase gate (e.g., plan command checks `approvals.spec.approved === true` before proceeding). Commands pass feature dir and spec.json path to skills.
- **Dependencies**: T-013
