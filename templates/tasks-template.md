# Tasks: [FEATURE NAME]

> Input: specs/NNN-feature-name/spec.md, specs/NNN-feature-name/plan.md
> Format: `[P]` = parallelizable, `_Boundary:_` = component ownership

---

## Phase 1: Setup (Shared Infrastructure)

### T-001 Initialize project structure and dependencies
- **Story**: Setup
- **File**: [root]/
- **Deliverable**: Project skeleton with package.json, config files
- **Dependencies**: none
- **Boundary**: infrastructure

### T-002 Set up build / lint / test tooling
- **Story**: Setup
- **File**: [root]/
- **Deliverable**: Build pipeline, lint config, test runner configured
- **Dependencies**: T-001
- **Boundary**: infrastructure

### T-003 [P] Configure database / storage schema
- **Story**: Setup
- **File**: [db]/schema.prisma
- **Deliverable**: Database schema with all entities
- **Dependencies**: T-001
- **Boundary**: data

### T-004 [P] Set up CI pipeline
- **Story**: Setup
- **File**: .github/workflows/ci.yml
- **Deliverable**: CI runs tests on push
- **Dependencies**: T-001
- **Boundary**: infrastructure

---

## Phase 2: Foundational (Blocking Prerequisites)

### T-005 Core data layer / models
- **Story**: Foundational
- **File**: src/models/
- **Deliverable**: All domain models with relations
- **Dependencies**: T-003
- **Boundary**: data

### T-006 Core services / business logic
- **Story**: Foundational
- **File**: src/services/
- **Deliverable**: Core service layer with business logic
- **Dependencies**: T-005
- **Boundary**: services

### T-007 [P] API endpoints (if applicable)
- **Story**: Foundational
- **File**: src/api/
- **Deliverable**: REST/GraphQL endpoints
- **Dependencies**: T-006
- **Boundary**: api

### T-008 [P] Basic UI scaffolding (if applicable)
- **Story**: Foundational
- **File**: src/ui/
- **Deliverable**: UI shell with routing
- **Dependencies**: T-005
- **Boundary**: ui

---

## Phase 3: User Story 1 (MVP)

Story: [Description of P1 story]

### T-009 Write tests for this story
- **Story**: Story 1
- **File**: tests/
- **Deliverable**: Test suite covers acceptance criteria
- **Dependencies**: T-006
- **Boundary**: testing

### T-010 Implement story acceptance criteria
- **Story**: Story 1
- **File**: src/
- **Deliverable**: Feature implementation passes all tests
- **Dependencies**: T-009
- **Boundary**: [component]

### T-011 Verify end-to-end flow
- **Story**: Story 1
- **File**: tests/e2e/
- **Deliverable**: E2E test passes
- **Dependencies**: T-010
- **Boundary**: testing

---

## Phase 4: User Story 2

Story: [Description of P2 story]

### T-012 Write tests for this story
- **Story**: Story 2
- **File**: tests/
- **Deliverable**: Test suite covers acceptance criteria
- **Dependencies**: T-010
- **Boundary**: testing

### T-013 Implement story acceptance criteria
- **Story**: Story 2
- **File**: src/
- **Deliverable**: Feature implementation passes all tests
- **Dependencies**: T-012
- **Boundary**: [component]

---

## Phase 5: User Story 3

Story: [Description of P3 story]

### T-014 Write tests for this story
- **Story**: Story 3
- **File**: tests/
- **Deliverable**: Test suite covers acceptance criteria
- **Dependencies**: T-013
- **Boundary**: testing

### T-015 Implement story acceptance criteria
- **Story**: Story 3
- **File**: src/
- **Deliverable**: Feature implementation passes all tests
- **Dependencies**: T-014
- **Boundary**: [component]

---

## Phase 6: Polish and Cross-Cutting Concerns

### T-016 [P] Error handling and edge cases
- **Story**: Polish
- **File**: src/
- **Deliverable**: All error paths handled gracefully
- **Dependencies**: T-013
- **Boundary**: [component]

### T-017 [P] Performance optimization
- **Story**: Polish
- **File**: src/
- **Deliverable**: Performance targets met
- **Dependencies**: T-015
- **Boundary**: [component]

### T-018 [P] Documentation
- **Story**: Polish
- **File**: docs/
- **Deliverable**: README, API docs, setup guide
- **Dependencies**: T-015
- **Boundary**: docs

### T-019 Final review and cleanup
- **Story**: Polish
- **File**: [root]/
- **Deliverable**: Code review complete, todos resolved
- **Dependencies**: T-016, T-017, T-018
- **Boundary**: [component]

---

## Dependencies Map

```
T-001
  └── T-002, T-003, T-004
         └── T-005, T-006
                ├── T-007, T-008
                 ├── T-009
                 │      └── T-010
                 │           └── T-011
                 ├── T-012
                 │      └── T-013
                 └── T-014
                        └── T-015
                            └── T-016, T-017, T-018, T-019
```

## Strategy

[MVP First / Incremental Delivery / Parallel Team]
