# Tasks: [FEATURE NAME]

> Input: specs/NNN-feature-name/spec.md, specs/NNN-feature-name/plan.md
> Format: `[ID] [P?] [Story] Description` (`[P]` = parallelizable)

---

## Phase 1: Setup (Shared Infrastructure)

- [ ] T-001 Initialize project structure and dependencies
- [ ] T-002 Set up build / lint / test tooling
- [P] T-003 Configure database / storage schema
- [P] T-004 Set up CI pipeline

---

## Phase 2: Foundational (Blocking Prerequisites)

- [ ] T-005 Core data layer / models
- [ ] T-006 Core services / business logic
- [P] T-007 API endpoints (if applicable)
- [P] T-008 Basic UI scaffolding (if applicable)

---

## Phase 3: User Story 1 (MVP)

Story: [Description of P1 story]

- [ ] T-009 Write tests for this story
- [ ] T-010 Implement story acceptance criteria
- [ ] T-011 Verify end-to-end flow

---

## Phase 4: User Story 2

Story: [Description of P2 story]

- [ ] T-012 Write tests for this story
- [ ] T-013 Implement story acceptance criteria

---

## Phase 5: User Story 3

Story: [Description of P3 story]

- [ ] T-014 Write tests for this story
- [ ] T-015 Implement story acceptance criteria

---

## Phase 6: Polish and Cross-Cutting Concerns

- [P] T-016 Error handling and edge cases
- [P] T-017 Performance optimization
- [P] T-018 Documentation
- [ ] T-019 Final review and cleanup

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
