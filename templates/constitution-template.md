# Project Constitution

> Governing principles for [PROJECT NAME]

## Article I: Simplicity First
Every feature must be built with minimal dependencies. Max 3 top-level projects. No abstraction without immediate need.

## Article II: Test-First Imperative (NON-NEGOTIABLE)
Tests must be written before implementation code. Every user story requires at minimum one integration test covering the happy path.

## Article III: Explicit Over Implicit
All configuration is explicit. No magic auto-discovery. No global state. Dependencies are injected, not imported.

## Article IV: Integration-First Testing
Tests run against real dependencies (database, API, filesystem) not mocks. Use testcontainers or equivalent for external services.

## Article V: Quality Gates
- Lint must pass before commit
- Tests must pass before merge
- No dead code, no commented-out code, no TODOs in main

## Article VI: Documentation as Code
Specs, plans, and decisions live in the repository alongside code. Update docs when behavior changes.

---

### Project-specific notes

- Simplicity: [add project-specific constraints]
- Test approach: [describe testing tools / patterns]
- Explicit config: [document configuration approach]
- Integration tests: [document integration test setup]
- Quality tools: [list lint/format/type-check tools]
- Docs: [document any doc conventions]
