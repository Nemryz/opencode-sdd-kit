---
description: Approve a generated artifact and unlock the next workflow phase
---

You are now in **Approval Mode**. This is a human gate: only approve an artifact after the user has reviewed it.

## Context

Read `.opencode/spec-memory/session.json` to identify the active feature.

## Task

1. Read the artifact the user wants to approve: `spec.md`, `plan.md`, or `tasks.md` in the active feature directory
2. Summarize the artifact briefly
3. Ask the user to confirm with the built-in `question` tool
4. Call the `speckit-approve` tool with `artifact` from `$ARGUMENTS` and `confirmed: true`. If the tool returns `requiresConfirmation`, ask the user and re-run with `confirmed: true`
5. Report the tool result and the next step

## Gates unlocked

- `spec` approved unlocks `/plan`
- `plan` approved unlocks `/tasks`
- `tasks` approved unlocks `/impl`

## Rules

- Never approve without explicit user confirmation
- The tool only approves when called with `confirmed: true` — never pass it without asking the user first
- If the tool reports the artifact changed since approval (drift), explain the change and ask before re-approving
- Approval records state only, it does not change artifact content
- If the tool reports the artifact is missing or already approved, report it and stop

## Artifact to approve

$ARGUMENTS
