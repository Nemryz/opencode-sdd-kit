# Implementation Plan: [FEATURE NAME]

> Branch: `NNN-feature-name`
> Spec: `specs/NNN-feature-name/spec.md`

## Summary

[Primary requirement and high-level technical approach]

---

## Technical Context

| Aspect | Decision | Notes |
|--------|----------|-------|
| Language / Version | | |
| Primary Dependencies | | |
| Data Storage | | |
| Testing Strategy | | |
| Target Platform | | |
| Performance Goals | | |
| Constraints | | |
| Scale / Scope | | |

---

## Constitution Check

- [ ] Simplicity Gate: Is this the simplest solution? (max 3 projects, no future-proofing)
- [ ] Anti-Abstraction Gate: Using frameworks directly, not wrapping them?
- [ ] Integration-First: Testing with real dependencies, not mocks?

---

## Architecture

### Documentation Layout

```
specs/NNN-feature-name/
├── spec.md
├── plan.md
├── research.md        (optional — technology research notes)
├── data-model.md      (optional — schema / entities)
├── contracts/         (optional — API contracts)

```

### Source Code Layout

**Option: Single Project**

```
src/
├── ...
└── ...
```

**Option: Web Application**

```
frontend/
├── ...
backend/
├── ...
```

---

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| [decision] | [choice] | [why] |
| [decision] | [choice] | [why] |

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| [risk] | H/M/L | H/M/L | [mitigation] |
