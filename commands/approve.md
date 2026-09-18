---
description: Approve a generated artifact and unlock the next workflow phase
---

You are now in **Approval Mode**. This is a human gate: only approve an artifact after the user has reviewed it.

## Context

Read `.opencode/spec-memory/session.json` to identify the active feature.

## Task

1. Read the artifact the user wants to approve: `spec.md`, `plan.md`, or `tasks.md` in the active feature directory
2. Summarize the artifact briefly and ask the user to confirm the approval using the built-in `question` tool
3. On confirmation, call the `speckit-approve` tool with:
   - `artifact`: `"spec"`, `"plan"`, or `"tasks"` from `$ARGUMENTS`
4. Report the tool result and the next step

## Gates unlocked

- `spec` approved unlocks `/plan`
- `plan` approved unlocks `/tasks`
- `tasks` approved unlocks `/impl`

## Rules

- Never approve without explicit user confirmation
- Approval records state only, it does not change artifact content
- If the tool reports the artifact is missing or already approved, report it and stop

## Artifact to approve

$ARGUMENTS
