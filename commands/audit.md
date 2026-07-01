---
description: Run a comprehensive project audit for phase consistency and artifact health
---

## Pre-validation

Call `speckit-validate` with:
- `command`: `"audit"`
- `featureDir`: `$ARGUMENTS` (optional specific feature)

If `metadata.phase` is `"empty"` or no features are found, tell the user no features exist and stop.
Use `metadata.featureDir` as the feature directory for the audit.

## Task

1. Call the `speckit-audit` tool to run the full audit
2. If the user passed `--fix`, pass `fix: true` to the tool

## Output format

Present the audit report clearly:
- Overall status: PASS or FAIL
- Error count, warning count, info count
- List each finding with [ERR], [WRN], [INF] prefix
- If FAIL, recommend specific commands to fix each issue

## Guidance

- Phase mismatches: run `/clean --fix` to repair
- Missing artifacts: run the appropriate scaffold command
- Steering issues: run `/steering <description>` to populate
- Specification clarity: resolve `[NEEDS CLARIFICATION]` markers
